import { describe, expect, it } from "vitest";
import { characterErrorRate, editDistance } from "../simulation/metrics";
import { simulateInput } from "../simulation/simulator";

const baseOptions = {
  phrase: "hello world",
  seed: "test-seed",
  duplicateProbability: 0,
  positionalProbability: 0,
  minIntervalMs: 100,
  maxIntervalMs: 400,
};

describe("simulateInput", () => {
  it("reproduces events and timing for the same seed", () => {
    expect(simulateInput(baseOptions)).toEqual(simulateInput(baseOptions));
  });

  it("preserves legitimate repeated letters in the intended sequence", () => {
    const result = simulateInput({ ...baseOptions, phrase: "balloon" });

    expect(result.intendedText).toBe("balloon");
    expect(result.observedText).toBe("balloon");
    expect(result.events.map((event) => event.intendedKey).join("")).toBe("balloon");
  });

  it("injects duplicate events without adding intended input", () => {
    const result = simulateInput({ ...baseOptions, phrase: "a", duplicateProbability: 1 });

    expect(result.intendedText).toBe("a");
    expect(result.observedText).toBe("aa");
    expect(result.events[1]).toMatchObject({
      intendedKey: null,
      observedKey: "a",
      errorType: "duplicate",
    });
    expect(result.injectedErrorCount).toBe(1);
  });
});

describe("edit distance metrics", () => {
  it("counts insertions, deletions, and substitutions", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abc", "ac")).toBe(1);
    expect(editDistance("", "a")).toBe(1);
  });

  it("calculates character error rate against the intended reference", () => {
    expect(characterErrorRate("hello", "helloo")).toBe(0.2);
    expect(characterErrorRate("", "")).toBe(0);
  });
});