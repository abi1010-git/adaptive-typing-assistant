import {
  AdaptiveDebounceFilter,
  FixedDebounceFilter,
  type FilterDecision,
  type ObservedKeyEvent,
} from "../simulation/filters";
import { characterErrorRate } from "../simulation/metrics";
import { simulateInput, type SimulationEvent } from "../simulation/simulator";

export type StrategyName = "unfiltered" | "fixed" | "adaptive";

export interface SpeedRange {
  id: string;
  label: string;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export interface ExperimentCondition {
  id: string;
  duplicateProbability: number;
  speedRange: SpeedRange;
  phrase: string;
  hasRepeatedLetters: boolean;
}

export interface StrategyRunMetrics {
  outputText: string;
  characterErrorRate: number;
  acceptedEvents: number;
  suppressedEvents: number;
  falseSuppressions: number;
  duplicateSuppressions: number;
}

export interface ExperimentRun {
  conditionId: string;
  seed: string;
  duplicateProbability: number;
  speedRangeId: string;
  speedRangeLabel: string;
  minIntervalMs: number;
  maxIntervalMs: number;
  phrase: string;
  hasRepeatedLetters: boolean;
  intendedInputCount: number;
  injectedDuplicateCount: number;
  totalEventsProcessed: number;
  finalAdaptiveThresholdMs: number;
  methods: Record<StrategyName, StrategyRunMetrics>;
}

export interface StrategyAggregate {
  meanCharacterErrorRate: number;
  medianCharacterErrorRate: number;
  falseSuppressionRate: number;
  duplicateSuppressionRate: number | null;
}

export interface AggregateSummary {
  runCount: number;
  methods: Record<StrategyName, StrategyAggregate>;
  adaptiveWins: number;
  fixedWins: number;
  ties: number;
  meanFinalAdaptiveThresholdMs: number;
}

export interface ConditionAggregate extends AggregateSummary {
  condition: ExperimentCondition;
}

export interface BatchExperimentResult {
  runsPerCondition: number;
  totalRuns: number;
  conditions: ConditionAggregate[];
  overall: AggregateSummary;
  runs: ExperimentRun[];
}

export interface BatchExperimentOptions {
  matrix?: readonly ExperimentCondition[];
  seedsPerCondition?: number;
}

export const DUPLICATE_PROBABILITIES = [0, 0.05, 0.1, 0.2, 0.4] as const;

export const SPEED_RANGES: readonly SpeedRange[] = [
  { id: "fast", label: "Fast", minIntervalMs: 60, maxIntervalMs: 139 },
  { id: "medium", label: "Medium", minIntervalMs: 140, maxIntervalMs: 299 },
  { id: "slow", label: "Slow", minIntervalMs: 300, maxIntervalMs: 500 },
];

const PHRASES = [
  { phrase: "hello", hasRepeatedLetters: true },
  { phrase: "book", hasRepeatedLetters: true },
  { phrase: "letter", hasRepeatedLetters: true },
  { phrase: "world", hasRepeatedLetters: false },
  { phrase: "planet", hasRepeatedLetters: false },
  { phrase: "typing", hasRepeatedLetters: false },
] as const;

export const DEFAULT_SEEDS_PER_CONDITION = 100;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function createExperimentMatrix(): ExperimentCondition[] {
  return DUPLICATE_PROBABILITIES.flatMap((duplicateProbability) =>
    SPEED_RANGES.flatMap((speedRange) =>
      PHRASES.map(({ phrase, hasRepeatedLetters }) => ({
        id: `dup-${Math.round(duplicateProbability * 100)}-${speedRange.id}-${slug(phrase)}`,
        duplicateProbability,
        speedRange,
        phrase,
        hasRepeatedLetters,
      })),
    ),
  );
}

function evaluateRun(
  intendedText: string,
  simulationEvents: readonly SimulationEvent[],
  observedEvents: readonly ObservedKeyEvent[],
  decisions: readonly FilterDecision[],
): StrategyRunMetrics {
  let acceptedEvents = 0;
  let suppressedEvents = 0;
  let falseSuppressions = 0;
  let duplicateSuppressions = 0;
  let outputText = "";

  decisions.forEach((decision, index) => {
    if (decision.inputIndex !== index) {
      throw new Error("Filter decisions must preserve input event order.");
    }
    if (decision.observedKey !== observedEvents[index].observedKey
      || decision.timestampMs !== observedEvents[index].timestampMs) {
      throw new Error("Filter decision does not match the shared observed event.");
    }

    if (decision.accepted) {
      acceptedEvents += 1;
      outputText += decision.observedKey;
      return;
    }

    suppressedEvents += 1;
    const truth = simulationEvents[index];
    if (truth.errorType === "duplicate") duplicateSuppressions += 1;
    else if (truth.intendedKey !== null) falseSuppressions += 1;
  });

  return {
    outputText,
    characterErrorRate: characterErrorRate(intendedText, outputText),
    acceptedEvents,
    suppressedEvents,
    falseSuppressions,
    duplicateSuppressions,
  };
}

function getUnfilteredDecisions(events: readonly ObservedKeyEvent[]): FilterDecision[] {
  return events.map((event, inputIndex) => ({
    inputIndex,
    observedKey: event.observedKey,
    timestampMs: event.timestampMs,
    accepted: true,
    thresholdMs: 0,
    nextThresholdMs: 0,
    reason: "outside-threshold",
  }));
}

function runCondition(condition: ExperimentCondition, seedIndex: number): ExperimentRun {
  const seed = `${condition.id}-seed-${String(seedIndex).padStart(3, "0")}`;
  const simulation = simulateInput({
    phrase: condition.phrase,
    seed,
    duplicateProbability: condition.duplicateProbability,
    positionalProbability: 0,
    minIntervalMs: condition.speedRange.minIntervalMs,
    maxIntervalMs: condition.speedRange.maxIntervalMs,
  });

  const observedEvents: ObservedKeyEvent[] = simulation.events.map(({ observedKey, timestampMs }) => ({
    observedKey,
    timestampMs,
  }));
  const fixedFilter = new FixedDebounceFilter();
  const adaptiveFilter = new AdaptiveDebounceFilter();
  const fixedDecisions = observedEvents.map((event) => fixedFilter.process(event));
  const adaptiveDecisions = observedEvents.map((event) => adaptiveFilter.process(event));
  const unfilteredDecisions = getUnfilteredDecisions(observedEvents);

  return {
    conditionId: condition.id,
    seed,
    duplicateProbability: condition.duplicateProbability,
    speedRangeId: condition.speedRange.id,
    speedRangeLabel: condition.speedRange.label,
    minIntervalMs: condition.speedRange.minIntervalMs,
    maxIntervalMs: condition.speedRange.maxIntervalMs,
    phrase: condition.phrase,
    hasRepeatedLetters: condition.hasRepeatedLetters,
    intendedInputCount: simulation.intendedText.length,
    injectedDuplicateCount: simulation.eventCounts.duplicates,
    totalEventsProcessed: simulation.events.length,
    finalAdaptiveThresholdMs: adaptiveFilter.currentThresholdMs,
    methods: {
      unfiltered: evaluateRun(simulation.intendedText, simulation.events, observedEvents, unfilteredDecisions),
      fixed: evaluateRun(simulation.intendedText, simulation.events, observedEvents, fixedDecisions),
      adaptive: evaluateRun(simulation.intendedText, simulation.events, observedEvents, adaptiveDecisions),
    },
  };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function aggregateExperimentRuns(runs: readonly ExperimentRun[]): AggregateSummary {
  if (runs.length === 0) throw new Error("Cannot summarize an empty experiment group.");

  const intendedInputCount = runs.reduce((sum, run) => sum + run.intendedInputCount, 0);
  const injectedDuplicateCount = runs.reduce((sum, run) => sum + run.injectedDuplicateCount, 0);
  const methods = {} as Record<StrategyName, StrategyAggregate>;

  for (const method of ["unfiltered", "fixed", "adaptive"] as const) {
    const values = runs.map((run) => run.methods[method].characterErrorRate);
    const falseSuppressions = runs.reduce((sum, run) => sum + run.methods[method].falseSuppressions, 0);
    const duplicateSuppressions = runs.reduce((sum, run) => sum + run.methods[method].duplicateSuppressions, 0);
    methods[method] = {
      meanCharacterErrorRate: values.reduce((sum, value) => sum + value, 0) / values.length,
      medianCharacterErrorRate: median(values),
      falseSuppressionRate: intendedInputCount === 0 ? 0 : falseSuppressions / intendedInputCount,
      duplicateSuppressionRate: injectedDuplicateCount === 0 ? null : duplicateSuppressions / injectedDuplicateCount,
    };
  }

  let adaptiveWins = 0;
  let fixedWins = 0;
  let ties = 0;
  for (const run of runs) {
    if (run.methods.adaptive.characterErrorRate < run.methods.fixed.characterErrorRate) adaptiveWins += 1;
    else if (run.methods.fixed.characterErrorRate < run.methods.adaptive.characterErrorRate) fixedWins += 1;
    else ties += 1;
  }

  return {
    runCount: runs.length,
    methods,
    adaptiveWins: adaptiveWins / runs.length,
    fixedWins: fixedWins / runs.length,
    ties: ties / runs.length,
    meanFinalAdaptiveThresholdMs: runs.reduce((sum, run) => sum + run.finalAdaptiveThresholdMs, 0) / runs.length,
  };
}

export function runBatchExperiment(
  options: BatchExperimentOptions = {},
  onProgress?: (completedRuns: number, totalRuns: number) => void,
): BatchExperimentResult {
  const matrix = options.matrix ?? createExperimentMatrix();
  const seedsPerCondition = options.seedsPerCondition ?? DEFAULT_SEEDS_PER_CONDITION;
  if (!Number.isInteger(seedsPerCondition) || seedsPerCondition < 1) {
    throw new Error("Seeds per condition must be a positive integer.");
  }
  if (matrix.length === 0) throw new Error("Experiment matrix must contain at least one condition.");

  const totalRuns = matrix.length * seedsPerCondition;
  const runs: ExperimentRun[] = [];
  let completedRuns = 0;

  for (const condition of matrix) {
    for (let seedIndex = 0; seedIndex < seedsPerCondition; seedIndex += 1) {
      runs.push(runCondition(condition, seedIndex));
      completedRuns += 1;
      if (completedRuns % 100 === 0 || completedRuns === totalRuns) {
        onProgress?.(completedRuns, totalRuns);
      }
    }
  }

  const conditions = matrix.map((condition) => ({
    condition,
    ...aggregateExperimentRuns(runs.filter((run) => run.conditionId === condition.id)),
  }));

  return {
    runsPerCondition: seedsPerCondition,
    totalRuns,
    conditions,
    overall: aggregateExperimentRuns(runs),
    runs,
  };
}