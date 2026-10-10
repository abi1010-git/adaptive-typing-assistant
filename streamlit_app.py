from __future__ import annotations

import statistics
import time

import streamlit as st


FIXED_THRESHOLD_MS = 180.0
MIN_ADAPTIVE_THRESHOLD_MS = 100.0
MAX_ADAPTIVE_THRESHOLD_MS = 350.0
INTERVAL_WINDOW_SIZE = 9
MEDIAN_MULTIPLIER = 0.75
MODES = ("Standard (no filtering)", "Fixed debounce", "Adaptive debounce")
KEY_ROWS = ("qwertyuiop", "asdfghjkl", "zxcvbnm")


def reset_filter_history() -> None:
    st.session_state.last_key = None
    st.session_state.last_timestamp_ms = None
    st.session_state.recent_intervals_ms = []
    st.session_state.current_threshold_ms = FIXED_THRESHOLD_MS


def reset_session() -> None:
    st.session_state.live_text = ""
    st.session_state.total_activations = 0
    st.session_state.accepted_activations = 0
    st.session_state.suppressed_activations = 0
    st.session_state.last_action = None
    reset_filter_history()


def initialize_session() -> None:
    defaults = {
        "live_mode": MODES[0],
        "mode_selector": MODES[0],
        "live_text": "",
        "total_activations": 0,
        "accepted_activations": 0,
        "suppressed_activations": 0,
        "last_action": None,
        "last_key": None,
        "last_timestamp_ms": None,
        "recent_intervals_ms": [],
        "current_threshold_ms": FIXED_THRESHOLD_MS,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def on_mode_change() -> None:
    selected = st.session_state.mode_selector
    if selected != st.session_state.live_mode:
        st.session_state.live_mode = selected
        st.session_state.total_activations = 0
        st.session_state.accepted_activations = 0
        st.session_state.suppressed_activations = 0
        st.session_state.last_action = None
        reset_filter_history()


def activate_key(key: str) -> None:
    now_ms = time.perf_counter_ns() / 1_000_000
    previous_key = st.session_state.last_key
    previous_timestamp = st.session_state.last_timestamp_ms
    threshold = st.session_state.current_threshold_ms
    interval = None if previous_timestamp is None else now_ms - previous_timestamp

    accepted = not (
        st.session_state.live_mode != MODES[0]
        and previous_key == key
        and interval is not None
        and interval < threshold
    )

    st.session_state.total_activations += 1
    if accepted:
        st.session_state.accepted_activations += 1
        st.session_state.live_text += key
    else:
        st.session_state.suppressed_activations += 1
    st.session_state.last_action = ("Space" if key == " " else key, accepted)

    if st.session_state.live_mode == MODES[2] and interval is not None:
        intervals = st.session_state.recent_intervals_ms
        intervals.append(interval)
        st.session_state.recent_intervals_ms = intervals[-INTERVAL_WINDOW_SIZE:]
        estimated = statistics.median(st.session_state.recent_intervals_ms) * MEDIAN_MULTIPLIER
        st.session_state.current_threshold_ms = min(
            MAX_ADAPTIVE_THRESHOLD_MS,
            max(MIN_ADAPTIVE_THRESHOLD_MS, estimated),
        )

    st.session_state.last_key = key
    st.session_state.last_timestamp_ms = now_ms


def backspace() -> None:
    st.session_state.live_text = st.session_state.live_text[:-1]
    reset_filter_history()


def clear_text() -> None:
    st.session_state.live_text = ""
    reset_filter_history()


def render_keyboard_row(keys: str, row_number: int) -> None:
    if row_number == 1:
        columns = st.columns(10)
    elif row_number == 2:
        columns = st.columns([0.5, *([1.0] * 9), 0.5])
        columns = columns[1:-1]
    else:
        columns = st.columns([1.5, *([1.0] * 7), 1.5])
        columns = columns[1:-1]

    for column, key in zip(columns, keys):
        with column:
            st.button(key.upper(), key=f"letter-{row_number}-{key}", on_click=activate_key, args=(key,), use_container_width=True)


def render_study_summary() -> None:
    st.subheader("Synthetic experiment snapshot")
    st.caption("Reported results from the TypeScript experiment matrix; this view does not run or alter that dataset.")

    headings = st.columns([1.5, 1, 1])
    headings[0].markdown("**Method**")
    headings[1].markdown("**Mean CER**")
    headings[2].markdown("**False suppression**")
    rows = (
        ("Unfiltered", "15.1%", "0.0%"),
        ("Fixed debounce", "12.5%", "3.9%"),
        ("Adaptive debounce", "12.3%", "2.3%"),
    )
    for method, cer, false_suppression in rows:
        columns = st.columns([1.5, 1, 1])
        columns[0].write(method)
        columns[1].write(cer)
        columns[2].write(false_suppression)

    st.info(
        "These are synthetic results, not real-user evidence. The CER difference is modest; "
        "adaptive debounce does not win every run and is not validated for people with disabilities."
    )


def main() -> None:
    st.set_page_config(page_title="Adaptive Typing Assistant", layout="wide")
    initialize_session()

    st.title("Adaptive Typing Assistant")
    st.caption("Streamlit companion demo · live on-screen input and debounce comparison")

    st.radio("Keyboard mode", MODES, horizontal=True, key="mode_selector", on_change=on_mode_change)

    text_column, control_column = st.columns([1.8, 1])
    with text_column:
        st.session_state.live_text_display = st.session_state.live_text
        st.text_area("Live typed text", height=120, disabled=True, key="live_text_display")
    with control_column:
        metrics = st.columns(2)
        metrics[0].metric("Total activations", st.session_state.total_activations)
        metrics[1].metric("Accepted", st.session_state.accepted_activations)
        metrics[0].metric("Suppressed", st.session_state.suppressed_activations)
        threshold = "Off" if st.session_state.live_mode == MODES[0] else f"{st.session_state.current_threshold_ms:.0f} ms"
        metrics[1].metric("Current threshold", threshold)
        if st.session_state.last_action:
            key, accepted = st.session_state.last_action
            st.caption(f"Last activation: **{key} {'accepted' if accepted else 'suppressed'}**")
        else:
            st.caption("No key activations yet.")

    st.subheader("On-screen QWERTY keyboard")
    for row_number, row in enumerate(KEY_ROWS, start=1):
        render_keyboard_row(row, row_number)

    editing_columns = st.columns([1, 2, 1])
    with editing_columns[0]:
        st.button("Clear", on_click=clear_text, use_container_width=True)
    with editing_columns[1]:
        st.button("Space", on_click=activate_key, args=(" ",), use_container_width=True)
    with editing_columns[2]:
        st.button("Backspace", on_click=backspace, use_container_width=True)

    st.caption("Backspace and Clear bypass filtering, are not counted, and reset filter timing history.")
    st.button("Reset Session", on_click=reset_session)

    with st.expander("How the modes work"):
        st.markdown(
            "- **Standard** accepts every letter and Space activation.\n"
            "- **Fixed debounce** suppresses the same key when it repeats within 180 ms.\n"
            "- **Adaptive debounce** uses the median of up to nine recent activation intervals, "
            "multiplied by 0.75 and bounded from 100 to 350 ms. It updates after classifying each key.\n\n"
            "Changing modes preserves accepted text but resets counters and filter history. "
            "Reset Session clears the text and counters while keeping the selected mode."
        )

    st.divider()
    render_study_summary()
    st.caption("Live input is separate from synthetic results. No live CER is shown because there is no independent reference phrase.")


if __name__ == "__main__":
    main()