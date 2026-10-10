import { characterErrorRate } from "./metrics";
import {
  AdaptiveDebounceFilter,
  FixedDebounceFilter,
  type FilterDecision,
  type ObservedKeyEvent,
} from "./filters";
import type { SimulationEvent } from "./simulator";

export interface FilterEvaluation {
  outputText: string;
  characterErrorRate: number;
  acceptedCount: number;
  suppressedCount: number;
  falseSuppressionCount: number;
  duplicateSuppressionCount: number;
}

export interface FilterComparison {
  unfiltered: FilterEvaluation;
  fixed: FilterEvaluation;
  adaptive: FilterEvaluation;
}

function evaluateDecisions(
  intendedText: string,
  simulationEvents: readonly SimulationEvent[],
  decisions: readonly FilterDecision[],
): FilterEvaluation {
  if (decisions.length !== simulationEvents.length) {
    throw new Error("Each simulated event must have exactly one filter decision.");
  }

  let acceptedCount = 0;
  let suppressedCount = 0;
  let falseSuppressionCount = 0;
  let duplicateSuppressionCount = 0;
  let outputText = "";

  decisions.forEach((decision, index) => {
    if (decision.inputIndex !== index) {
      throw new Error("Filter decisions must preserve input event order.");
    }

    if (decision.accepted) {
      acceptedCount += 1;
      outputText += decision.observedKey;
      return;
    }

    suppressedCount += 1;
    const groundTruthEvent = simulationEvents[index];
    if (groundTruthEvent.errorType === "duplicate") {
      duplicateSuppressionCount += 1;
    } else if (groundTruthEvent.intendedKey !== null) {
      falseSuppressionCount += 1;
    }
  });

  return {
    outputText,
    characterErrorRate: characterErrorRate(intendedText, outputText),
    acceptedCount,
    suppressedCount,
    falseSuppressionCount,
    duplicateSuppressionCount,
  };
}

function collectDecisions(
  filter: FixedDebounceFilter | AdaptiveDebounceFilter,
  events: readonly ObservedKeyEvent[],
): FilterDecision[] {
  return events.map((event) => filter.process(event));
}

export function compareFilters(
  intendedText: string,
  simulationEvents: readonly SimulationEvent[],
): FilterComparison {
  const observedEvents: ObservedKeyEvent[] = simulationEvents.map(({ observedKey, timestampMs }) => ({
    observedKey,
    timestampMs,
  }));

  const fixedDecisions = collectDecisions(new FixedDebounceFilter(), observedEvents);
  const adaptiveDecisions = collectDecisions(new AdaptiveDebounceFilter(), observedEvents);
  const unfilteredDecisions = observedEvents.map((event, inputIndex): FilterDecision => ({
    inputIndex,
    observedKey: event.observedKey,
    timestampMs: event.timestampMs,
    accepted: true,
    thresholdMs: 0,
    nextThresholdMs: 0,
    reason: "outside-threshold",
  }));

  return {
    unfiltered: evaluateDecisions(intendedText, simulationEvents, unfilteredDecisions),
    fixed: evaluateDecisions(intendedText, simulationEvents, fixedDecisions),
    adaptive: evaluateDecisions(intendedText, simulationEvents, adaptiveDecisions),
  };
}

export { evaluateDecisions as evaluateFilterDecisions };