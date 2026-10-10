import { describe, expect, it } from "vitest";
import { evaluateFilterDecisions, compareFilters } from "../simulation/evaluation";
import {
  AdaptiveDebounceFilter,
  FixedDebounceFilter,
  type FilterDecision,
  type ObservedKeyEvent,
} from "../simulation/filters";
import { simulateInput, type SimulationEvent } from "../simulation/simulator";

function runFilter(
  events: readonly ObservedKeyEvent[],
  filter: FixedDebounceFilter | AdaptiveDebounceFilter,
): FilterDecision[] {
  return events.map((event) => filter.process(event));
}

function acceptedText(decisions: readonly FilterDecision[]): string {
  return decisions.filter((decision) => decision.accepted).map((decision) => decision.observedKey).join("");
}

describe("duplicate debounce filters", () => {
  it("only reads observed keys and timestamps, never ground-truth properties", () => {
    const event = new Proxy({ observedKey: "a", timestampMs: 100 }, {
      get(target, property, receiver) {
        if (["intendedKey", "errorType", "phrase", "referenceText"].includes(String(property))) {
          throw new Error(`Filter attempted to read ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    }) as ObservedKeyEvent;

    expect(() => new FixedDebounceFilter().process(event)).not.toThrow();
    expect(() => new AdaptiveDebounceFilter().process(event)).not.toThrow();
  });

  it("produces deterministic decisions for the same observed sequence", () => {
    const events = [
      { observedKey: "h", timestampMs: 0 },
      { observedKey: "h", timestampMs: 70 },
      { observedKey: "e", timestampMs: 300 },
      { observedKey: "e", timestampMs: 360 },
    ];

    expect(runFilter(events, new AdaptiveDebounceFilter())).toEqual(
      runFilter(events, new AdaptiveDebounceFilter()),
    );
    expect(runFilter(events, new FixedDebounceFilter())).toEqual(
      runFilter(events, new FixedDebounceFilter()),
    );
  });

  it("updates incrementally and keeps adaptive thresholds within bounds", () => {
    const filter = new AdaptiveDebounceFilter({
      windowSize: 2,
      minimumThresholdMs: 100,
      maximumThresholdMs: 250,
      initialThresholdMs: 180,
      medianMultiplier: 1,
    });

    const first = filter.process({ observedKey: "a", timestampMs: 0 });
    const second = filter.process({ observedKey: "a", timestampMs: 20 });
    const third = filter.process({ observedKey: "b", timestampMs: 1000 });

    expect(first.thresholdMs).toBe(180);
    expect(first.nextThresholdMs).toBe(180);
    expect(second.accepted).toBe(false);
    expect(second.thresholdMs).toBe(180);
    expect(second.nextThresholdMs).toBe(100);
    expect(third.thresholdMs).toBe(100);
    expect(third.nextThresholdMs).toBe(250);
    for (const threshold of [first.nextThresholdMs, second.nextThresholdMs, third.nextThresholdMs]) {
      expect(threshold).toBeGreaterThanOrEqual(100);
      expect(threshold).toBeLessThanOrEqual(250);
    }
  });

  it.each(["hello", "book", "letter"])("preserves spaced legitimate repeats in %s", (phrase) => {
    const events = [...phrase].map((observedKey, index) => ({ observedKey, timestampMs: index * 300 }));
    const fixedText = acceptedText(runFilter(events, new FixedDebounceFilter()));
    const adaptiveText = acceptedText(runFilter(events, new AdaptiveDebounceFilter()));

    expect(fixedText).toBe(phrase);
    expect(adaptiveText).toBe(phrase);
  });
});

describe("post-filter evaluation", () => {
  it("counts false suppressions and duplicate removals after filtering", () => {
    const events: SimulationEvent[] = [
      { intendedKey: "a", observedKey: "a", timestampMs: 0, errorType: "none" },
      { intendedKey: null, observedKey: "a", timestampMs: 50, errorType: "duplicate" },
      { intendedKey: "a", observedKey: "a", timestampMs: 300, errorType: "none" },
    ];
    const decisions: FilterDecision[] = [
      { inputIndex: 0, observedKey: "a", timestampMs: 0, accepted: true, thresholdMs: 180, nextThresholdMs: 180, reason: "first-event" },
      { inputIndex: 1, observedKey: "a", timestampMs: 50, accepted: false, thresholdMs: 180, nextThresholdMs: 180, reason: "rapid-repeat" },
      { inputIndex: 2, observedKey: "a", timestampMs: 300, accepted: false, thresholdMs: 180, nextThresholdMs: 180, reason: "rapid-repeat" },
    ];

    expect(evaluateFilterDecisions("aa", events, decisions)).toEqual({
      outputText: "a",
      characterErrorRate: 0.5,
      acceptedCount: 1,
      suppressedCount: 2,
      falseSuppressionCount: 1,
      duplicateSuppressionCount: 1,
    });
  });

  it("feeds unfiltered and both filters the same observed sequence", () => {
    const events: SimulationEvent[] = [
      { intendedKey: "h", observedKey: "h", timestampMs: 0, errorType: "none" },
      { intendedKey: null, observedKey: "h", timestampMs: 60, errorType: "duplicate" },
      { intendedKey: "i", observedKey: "i", timestampMs: 300, errorType: "none" },
    ];
    const comparison = compareFilters("hi", events);

    expect(comparison.unfiltered.outputText).toBe("hhi");
    expect(comparison.unfiltered.acceptedCount).toBe(events.length);
    expect(comparison.fixed.suppressedCount).toBe(1);
    expect(comparison.adaptive.suppressedCount).toBe(1);
  });

  it("reports the seed-42 hello case without assuming adaptive improves", () => {
    const simulation = simulateInput({
      phrase: "hello",
      seed: "42",
      duplicateProbability: 1,
      positionalProbability: 0,
      minIntervalMs: 100,
      maxIntervalMs: 400,
    });
    const comparison = compareFilters(simulation.intendedText, simulation.events);

    expect(comparison.unfiltered.outputText).toBe("hheelllloo");
    expect(comparison.unfiltered.characterErrorRate).toBe(1);
    expect(comparison.fixed.characterErrorRate).toBe(0.6);
    expect(comparison.fixed.falseSuppressionCount).toBe(1);
    expect(comparison.adaptive.characterErrorRate).toBe(0.8);
    expect(comparison.adaptive.falseSuppressionCount).toBe(0);
    expect(comparison.adaptive.characterErrorRate).toBeGreaterThan(comparison.fixed.characterErrorRate);
  });
});