import { createSeededRandom } from "./random";

export type SimulationErrorType = "none" | "duplicate" | "positional";

export interface SimulationEvent {
  intendedKey: string | null;
  observedKey: string;
  timestampMs: number;
  errorType: SimulationErrorType;
}

export interface SimulationOptions {
  phrase: string;
  seed: string;
  duplicateProbability: number;
  positionalProbability?: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export interface SimulationResult {
  intendedText: string;
  observedText: string;
  events: SimulationEvent[];
  injectedErrorCount: number;
  eventCounts: {
    intended: number;
    duplicates: number;
    positional: number;
  };
}

const keyboardRows = [
  { keys: "qwertyuiop", offset: 0.5 },
  { keys: "asdfghjkl", offset: 0.75 },
  { keys: "zxcvbnm", offset: 1.25 },
] as const;

const keyPositions = keyboardRows.flatMap((row, rowIndex) =>
  [...row.keys].map((key, columnIndex) => ({
    key,
    x: row.offset + columnIndex,
    y: rowIndex,
  })),
);

function findNeighborKeys(key: string): string[] {
  const position = keyPositions.find((candidate) => candidate.key === key);
  if (!position) return [];

  return keyPositions.filter((candidate) => {
    if (candidate.key === key) return false;
    const horizontalDistance = Math.abs(candidate.x - position.x);
    const verticalDistance = Math.abs(candidate.y - position.y);
    return horizontalDistance <= 1.35 && verticalDistance <= 1;
  }).map((candidate) => candidate.key);
}

function validateOptions(options: SimulationOptions): void {
  if (!/^[a-z ]*$/i.test(options.phrase)) {
    throw new Error("Phrase may contain only letters and spaces.");
  }

  for (const [name, probability] of [
    ["Duplicate probability", options.duplicateProbability],
    ["Positional probability", options.positionalProbability ?? 0],
  ] as const) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`${name} must be between 0 and 1.`);
    }
  }

  if (!Number.isFinite(options.minIntervalMs) || !Number.isFinite(options.maxIntervalMs)
    || options.minIntervalMs < 0 || options.maxIntervalMs < options.minIntervalMs) {
    throw new Error("Timing must use non-negative values with minimum no greater than maximum.");
  }
}

export function simulateInput(options: SimulationOptions): SimulationResult {
  validateOptions(options);

  const intendedText = options.phrase.toLowerCase();
  const random = createSeededRandom(options.seed);
  const positionalProbability = options.positionalProbability ?? 0;
  const events: SimulationEvent[] = [];
  let timestampMs = 0;
  let duplicates = 0;
  let positional = 0;

  const nextInterval = () => options.minIntervalMs
    + Math.floor(random() * (options.maxIntervalMs - options.minIntervalMs + 1));

  for (const intendedKey of intendedText) {
    timestampMs += nextInterval();

    const neighbors = findNeighborKeys(intendedKey);
    const isPositionalError = neighbors.length > 0 && random() < positionalProbability;
    const observedKey = isPositionalError
      ? neighbors[Math.floor(random() * neighbors.length)]
      : intendedKey;

    if (isPositionalError) positional += 1;
    events.push({
      intendedKey,
      observedKey,
      timestampMs,
      errorType: isPositionalError ? "positional" : "none",
    });

    if (random() < options.duplicateProbability) {
      timestampMs += nextInterval();
      duplicates += 1;
      events.push({
        intendedKey: null,
        observedKey,
        timestampMs,
        errorType: "duplicate",
      });
    }
  }

  return {
    intendedText,
    observedText: events.map((event) => event.observedKey).join(""),
    events,
    injectedErrorCount: duplicates + positional,
    eventCounts: { intended: intendedText.length, duplicates, positional },
  };
}