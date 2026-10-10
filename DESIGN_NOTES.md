# Design Notes

## Purpose and intended users

This prototype gives the project team and accessibility researchers a transparent baseline for exploring how duplicate and neighboring-key activations affect text entry. Its motivation is to investigate interaction barriers that can affect people who have difficulty with precise or repeated input, including some people with motor impairments. The current simulator is a development instrument, not a clinical or assistive assessment.

## Architecture

- React and TypeScript render the interface and manage the practice and simulation controls.
- `src/simulation/random.ts` provides a seeded pseudorandom sequence.
- `src/simulation/simulator.ts` emits intended and observed key activations with event timestamps and error labels. Duplicate events have no intended key; the original intended phrase remains unchanged.
- `src/simulation/filters.ts` contains the fixed and adaptive incremental debounce filters. Its `ObservedKeyEvent` input contains only `observedKey` and `timestampMs`; it does not import or receive simulator labels or the phrase.
- `src/simulation/evaluation.ts` projects the simulation events to that observed-only shape, runs both filters on the same ordered events, and only then joins filter decisions by input index to ground truth for comparison metrics.
- `src/liveTyping/session.ts` applies those same filter classes to timestamped live on-screen key activations. Live state is separate from simulation ground truth and batch results.
- `src/simulation/metrics.ts` computes Levenshtein edit distance and character error rate (edit distance divided by reference length).
- Vite serves and builds the static client. There is no backend or persistent storage.

## Milestone 1 boundaries

At Milestone 1 the practice keyboard was standard and non-adaptive. The simulator is a simplified model, not a model calibrated to any person's movement, device, fatigue, access method, or context. Its probabilities and timing controls are experimental inputs, not estimates of an individual's abilities. Character error rate on generated text describes only the simulated output relative to its generated reference.

No claim is made that this system is accurate, beneficial, usable, or validated for people with speech or motor impairments. There has been no evaluation with disabled people, and generated results are not user evidence.

## Milestone 2: duplicate debounce experiment

The fixed filter uses a 180 ms same-key threshold. The adaptive filter tracks the most recent nine intervals between observed activations, estimates their median, multiplies it by 0.75, and clamps the result to 100–350 ms. The current threshold classifies an event before its interval updates the estimate for the next event. Both filters track each observed event, including suppressed events, and only suppress a repeated observed key inside the active threshold.

The adaptive rule is a heuristic, not a learned or user-calibrated model. A legitimate fast repeat and an accidental duplicate can have identical observed keys and timing. The UI therefore reports character error rate, accepted/suppressed event counts, false suppressions of intended activations, and accidental duplicates removed for each strategy. It makes no assumption that adaptive results will be better; any regressions remain visible in the comparison.

One reproducible fixture (phrase `hello`, seed `42`, duplicate probability `100%`, neighboring-key probability `0%`, intervals `100`–`400` ms) yields 100% CER unfiltered, 60% with fixed debounce, and 80% with adaptive debounce. In that run, fixed debounce falsely suppresses one legitimate event; adaptive debounce has no false suppressions but leaves more duplicate text. This example illustrates the tradeoff and is not evidence that either filter is generally superior.

## Milestone 3: experimental evaluation

The default matrix crosses five duplicate probabilities (0%, 5%, 10%, 20%, 40%), three non-overlapping activation interval ranges (60–139 ms, 140–299 ms, 300–500 ms), and six fixed phrases. `hello`, `book`, and `letter` contain adjacent legitimate repeated letters; `world`, `planet`, and `typing` do not. This gives 90 conditions with 100 seeds each (9,000 simulations). Neighboring-key errors are held at 0% to isolate duplicate filtering. Seed strings are derived from each condition ID and a zero-padded run index, so runs are reproducible and unique across conditions.

Each simulation is generated once. Its ground-truth events are projected into a new observed-only array before either filter runs. The unfiltered, fixed, and adaptive decisions all use that same ordered array. Only after filtering are decisions matched by event index to intended-key and error-type labels for evaluation. A Web Worker runs the batch and posts progress; results remain in browser memory until the user downloads the run-level CSV.

Each run stores per-method output, CER, accepted and suppressed counts, false suppressions of legitimate intended activations, duplicate suppressions, total events processed, and the final adaptive threshold. Condition summaries show arithmetic mean and median of run-level CER; suppression rates pool counts over all runs in the condition. False-suppression rate uses all intended activations as its denominator. Duplicate-suppression rate uses all generated duplicate events, and is reported as N/A if that denominator is zero. Adaptive/fixed/tie percentages compare paired run CERs; overall percentages are pooled across runs.

The experiment does not sample real users or natural typing data. Its small fixed phrase set, simulator timing distributions, duplicate probabilities, fixed threshold, and adaptive median heuristic are assumptions selected for an initial controlled comparison. Holding positional errors at zero narrows the question but limits generality. Results can be sensitive to the matrix and filter parameters; they cannot establish accessibility, benefit, or real-world effectiveness. No improvement claim is made without appropriate real-world evaluation.

## Milestone 4: live adaptive keyboard

The live keyboard routes real on-screen letter and Space activations through Standard, Fixed debounce, or Adaptive debounce mode. Event timestamps are captured with `performance.now()`. Only accepted events append to live text. No intended phrase is assumed and no live CER is computed. Live typing state does not enter simulator or batch results.

Switching modes preserves accepted text but resets counters, last-action status, and the filter instance/history. Backspace and Clear are unfiltered, are excluded from activation counts, and reset filter history to avoid carrying a pre-edit interval into the next key. Reset Session clears live text, all counters/status, and filter history while retaining the selected mode. Native buttons and a pressed-state mode group keep controls keyboard operable and screen-reader identifiable; React updates do not move focus.

These live controls demonstrate algorithm behavior on immediate browser activations, not assistive effectiveness. They do not model pointer dwell, hardware keyboard repeat, user-specific motor patterns, or an independently authored reference. No real-user evaluation has been performed.

## Later milestones (not implemented)

1. Co-design and evaluate input needs and simulation assumptions with disabled users and accessibility specialists; define consent, privacy, and safeguards before any user study.
2. Compare the baseline and debounce strategies using appropriate, consented data and preregistered task measures; do not infer real-user outcomes from simulator CER.
3. Consider persistence only when a justified data model and privacy plan exist.