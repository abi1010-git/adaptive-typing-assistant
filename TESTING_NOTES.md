# Testing Notes

## Automated coverage

`src/tests/simulation.test.ts` verifies:

- Identical simulation options and seed produce identical events and timestamps.
- Legitimate repeated letters remain in the intended phrase.
- A forced duplicate adds an observed activation without adding intended input.
- Edit distance handles insertions, deletions, substitutions, and empty strings.
- Character error rate is computed against the intended reference.

`src/tests/filters.test.ts` verifies:

- Filters only read observed keys and timestamps; guarded ground-truth properties throw if accessed.
- Identical observed event sequences produce deterministic fixed and adaptive decisions.
- The adaptive threshold updates one event at a time and remains within configured bounds.
- Repeated letters in `hello`, `book`, and `letter` survive when their observed intervals are outside the debounce threshold.
- Post-filter evaluation counts accepted events, false suppressions, duplicate removals, output text, and CER correctly.
- The comparison preserves the unfiltered stream and evaluates both filters against the same observations.
- The seed-42 `hello` fixture confirms adaptive CER can be worse than fixed-debounce CER.

`src/tests/experiment.test.ts` verifies:

- The default matrix has 90 conditions across the five requested duplicate probabilities, three speed ranges, two phrase classes, and at least 100 seeds per condition.
- Mean and median CER, pooled false/duplicate suppression rates, adaptive/fixed/tie shares, and final-threshold means aggregate correctly.
- Duplicate suppression rate is N/A when no duplicate events were injected.
- Re-running the same condition/seeds is deterministic, unfiltered output matches the simulator stream, and every method accounts for the same number of processed events.
- Worker progress is reported deterministically.

`src/tests/liveTyping.test.ts` verifies mode switching, accepted/suppressed activations, legitimate repeats, edit-command filter resets, and Reset Session behavior.

`src/tests/liveKeyboardAccessibility.test.tsx` verifies the keyboard mode group, pressed state, named key controls, read-only output, and the editing-controls description in rendered markup.

`src/tests/liveTyping.test.ts` verifies:

- Mode changes reset counters and filter history while preserving accepted text.
- Fixed debounce suppresses rapid repeats and appends accepted keys only.
- Legitimate repeats in `hello`, `book`, and `letter` are retained at ordinary intervals.
- Backspace and Clear bypass filtering and reset filter timing history.
- Reset Session clears live state and keeps the selected mode.

`src/tests/liveKeyboardAccessibility.test.tsx` checks that the rendered mode controls expose pressed state, keyboard keys have accessible names, and the text output is explicitly read-only.

Run the suite with `npm test`.

## Metric interpretation

Character error rate is Levenshtein edit distance divided by the number of reference characters. An empty reference returns zero when the observed string is also empty, otherwise the insertion count; it is not a normalized percentage because a zero-length reference has no denominator. Error injection counts duplicate and positional events. Intended event count includes every character in the phrase, including spaces. Total event count includes injected duplicates.

The fixed filter suppresses a same-key event less than 180 ms after the previous observed event. The adaptive filter begins at 180 ms; after each event it updates from the median of up to nine preceding observed inter-activation intervals, scaled by 0.75 and clamped to 100–350 ms. A filter's applied threshold is the value available before the event being classified. False suppression means a suppressed event with an intended key that is not labeled as an injected duplicate. Duplicate removal counts suppressed events labeled as duplicates. Those labels are read only during post-filter evaluation.

The batch uses five duplicate probabilities, three non-overlapping event-interval ranges (60–139 ms, 140–299 ms, 300–500 ms), and six fixed phrases (three with adjacent repeated letters, three without), for 90 conditions and 100 deterministic seeds per condition. Positional-error injection is off in this experiment. CER mean and median are calculated over run-level CERs. Suppression rates are pooled counts: false suppressions / intended activations, and injected duplicates suppressed / injected duplicates. The latter is N/A when the condition generated zero duplicates. Paired wins and ties compare adaptive and fixed CER per run.

## Manual checks

1. Select each live mode and activate letter keys with pointer and keyboard (Tab to focus, Enter or Space to activate); confirm focus stays on the activated control.
2. In fixed and adaptive modes, tap the same letter rapidly and confirm suppression; use longer intervals for legitimate repeated letters and confirm they remain.
3. Activate Space, Backspace, and Clear with pointer and keyboard; verify editing controls are not filtered or counted, and that filter timing resets after an edit.
4. Type several accepted characters, switch modes, and verify text remains while counters and debounce history reset. Reset Session and verify the selected mode remains while all live session data clears.
5. Confirm live text and counters are not added to the simulated result or batch experiment, and that no live CER is shown.
6. Run the same simulator phrase and seed twice with unchanged settings; confirm the comparison outputs and metrics match.
7. Set duplicate probability to 0%, then 100% for a short phrase; verify all three strategies use the same event counts and that only the filtered outputs may suppress events.
8. Set neighboring-key probability to 0% and then a nonzero value; compare CER and false suppressions without assuming the adaptive row improves.
9. Use `hello`, `book`, and `letter` at longer intervals to verify legitimate repeats survive; try shorter intervals and inspect any false suppressions.
10. With phrase `hello`, seed `42`, duplicate probability `100%`, neighboring-key probability `0%`, and interval bounds `100`–`400` ms, verify unfiltered output `hheelllloo`. In this deterministic run fixed debounce has 60% CER and one false suppression; adaptive debounce has 80% CER and no false suppressions. This is an observed simulator tradeoff, not a general performance claim.
11. Check keyboard navigation and horizontal access to the on-screen key rows and comparison table at a narrow viewport.
12. Run the batch experiment and confirm progress advances while the page remains interactive; inspect the aggregate dashboard and download the run-level CSV.
13. Re-run the batch and compare its aggregate values and CSV rows; fixed seeds and condition IDs should reproduce the same results.

All simulated outcomes are synthetic. These checks do not constitute testing with people with disabilities or evidence of accessibility effectiveness.