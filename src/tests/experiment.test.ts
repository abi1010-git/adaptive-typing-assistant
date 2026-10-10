import { describe, expect, it } from "vitest";
import {
  aggregateExperimentRuns,
  createExperimentMatrix,
  DEFAULT_SEEDS_PER_CONDITION,
  runBatchExperiment,
  SPEED_RANGES,
  type ExperimentRun,
  type StrategyName,
  type StrategyRunMetrics,
} from "../experiment/runner";
import { AdaptiveDebounceFilter, FixedDebounceFilter } from "../simulation/filters";
import { simulateInput } from "../simulation/simulator";

function methodResult(
  outputText: string,
  characterErrorRate: number,
  falseSuppressions: number,
  duplicateSuppressions: number,
): StrategyRunMetrics {
  return {
    outputText,
    characterErrorRate,
    acceptedEvents: outputText.length,
    suppressedEvents: falseSuppressions + duplicateSuppressions,
    falseSuppressions,
    duplicateSuppressions,
  };
}

function makeRun(
  runIndex: number,
  values: Record<StrategyName, [number, number, number]>,
): ExperimentRun {
  const [unfiltered, fixed, adaptive] = ["unfiltered", "fixed", "adaptive"].map((name) => {
    const [cer, falseSuppressions, duplicateSuppressions] = values[name as StrategyName];
    return methodResult(name, cer, falseSuppressions, duplicateSuppressions);
  });

  return {
    conditionId: "condition-a",
    seed: `seed-${runIndex}`,
    duplicateProbability: 0.2,
    speedRangeId: "fast",
    speedRangeLabel: "Fast",
    minIntervalMs: 60,
    maxIntervalMs: 140,
    phrase: "hello",
    hasRepeatedLetters: true,
    intendedInputCount: 10,
    injectedDuplicateCount: 2,
    totalEventsProcessed: 12,
    finalAdaptiveThresholdMs: 150 + runIndex * 10,
    methods: { unfiltered, fixed, adaptive },
  };
}

describe("experiment matrix", () => {
  it("covers the planned probabilities, speeds, phrase classes, and at least 100 seeds", () => {
    const matrix = createExperimentMatrix();
    const probabilities = new Set(matrix.map((condition) => condition.duplicateProbability));
    const speeds = new Set(matrix.map((condition) => condition.speedRange.id));

    expect(matrix).toHaveLength(90);
    expect([...probabilities]).toEqual([0, 0.05, 0.1, 0.2, 0.4]);
    expect([...speeds]).toEqual(["fast", "medium", "slow"]);
    expect(SPEED_RANGES[0].maxIntervalMs).toBeLessThan(SPEED_RANGES[1].minIntervalMs);
    expect(SPEED_RANGES[1].maxIntervalMs).toBeLessThan(SPEED_RANGES[2].minIntervalMs);
    expect(matrix.filter((condition) => condition.hasRepeatedLetters)).toHaveLength(45);
    expect(matrix.filter((condition) => !condition.hasRepeatedLetters)).toHaveLength(45);
    expect(DEFAULT_SEEDS_PER_CONDITION).toBeGreaterThanOrEqual(100);
  });
});

describe("aggregateExperimentRuns", () => {
  it("calculates mean, median, micro suppression rates, and paired win shares", () => {
    const runs = [
      makeRun(0, {
        unfiltered: [0.2, 0, 0],
        fixed: [0.1, 1, 2],
        adaptive: [0.1, 2, 1],
      }),
      makeRun(1, {
        unfiltered: [0.1, 0, 0],
        fixed: [0.3, 3, 1],
        adaptive: [0.2, 0, 0],
      }),
      makeRun(2, {
        unfiltered: [0.4, 0, 0],
        fixed: [0.2, 2, 0],
        adaptive: [0.4, 1, 2],
      }),
    ];

    const summary = aggregateExperimentRuns(runs);

    expect(summary.runCount).toBe(3);
    expect(summary.methods.unfiltered.meanCharacterErrorRate).toBeCloseTo(0.233333);
    expect(summary.methods.unfiltered.medianCharacterErrorRate).toBe(0.2);
    expect(summary.methods.fixed.meanCharacterErrorRate).toBeCloseTo(0.2);
    expect(summary.methods.fixed.medianCharacterErrorRate).toBe(0.2);
    expect(summary.methods.fixed.falseSuppressionRate).toBeCloseTo(0.2);
    expect(summary.methods.adaptive.falseSuppressionRate).toBeCloseTo(0.1);
    expect(summary.methods.fixed.duplicateSuppressionRate).toBeCloseTo(0.5);
    expect(summary.methods.adaptive.duplicateSuppressionRate).toBeCloseTo(0.5);
    expect(summary.adaptiveWins).toBeCloseTo(1 / 3);
    expect(summary.fixedWins).toBeCloseTo(1 / 3);
    expect(summary.ties).toBeCloseTo(1 / 3);
    expect(summary.meanFinalAdaptiveThresholdMs).toBe(160);
  });

  it("marks duplicate suppression rate undefined when no duplicates were injected", () => {
    const run = makeRun(0, {
      unfiltered: [0, 0, 0],
      fixed: [0, 0, 0],
      adaptive: [0, 0, 0],
    });
    run.injectedDuplicateCount = 0;

    expect(aggregateExperimentRuns([run]).methods.adaptive.duplicateSuppressionRate).toBeNull();
  });
});

describe("runBatchExperiment", () => {
  it("is reproducible and gives every method the same generated event sequence", () => {
    const condition = createExperimentMatrix().find((entry) => entry.id === "dup-20-fast-hello");
    if (!condition) throw new Error("Expected condition missing from matrix.");

    const options = { matrix: [condition], seedsPerCondition: 4 };
    const first = runBatchExperiment(options);
    const second = runBatchExperiment(options);

    expect(first).toEqual(second);
    expect(first.totalRuns).toBe(4);
    for (const run of first.runs) {
      const simulation = simulateInput({
        phrase: run.phrase,
        seed: run.seed,
        duplicateProbability: run.duplicateProbability,
        positionalProbability: 0,
        minIntervalMs: run.minIntervalMs,
        maxIntervalMs: run.maxIntervalMs,
      });
      const sharedObservedEvents = simulation.events.map(({ observedKey, timestampMs }) => ({
        observedKey,
        timestampMs,
      }));
      const fixedFilter = new FixedDebounceFilter();
      const adaptiveFilter = new AdaptiveDebounceFilter();
      const fixedDecisions = sharedObservedEvents.map((event) => fixedFilter.process(event));
      const adaptiveDecisions = sharedObservedEvents.map((event) => adaptiveFilter.process(event));

      expect(run.methods.unfiltered.outputText).toBe(simulation.observedText);
      expect(run.methods.fixed.outputText).toBe(fixedDecisions.filter((decision) => decision.accepted).map((decision) => decision.observedKey).join(""));
      expect(run.methods.adaptive.outputText).toBe(adaptiveDecisions.filter((decision) => decision.accepted).map((decision) => decision.observedKey).join(""));
      for (const method of Object.values(run.methods)) {
        expect(method.acceptedEvents + method.suppressedEvents).toBe(run.totalEventsProcessed);
      }
      expect(run.finalAdaptiveThresholdMs).toBeGreaterThanOrEqual(100);
      expect(run.finalAdaptiveThresholdMs).toBeLessThanOrEqual(350);
    }
  });

  it("reports progress in deterministic run-count increments", () => {
    const condition = createExperimentMatrix()[0];
    const progress: Array<[number, number]> = [];
    const result = runBatchExperiment(
      { matrix: [condition], seedsPerCondition: 2 },
      (completed, total) => progress.push([completed, total]),
    );

    expect(result.totalRuns).toBe(2);
    expect(progress).toEqual([[2, 2]]);
  });
});