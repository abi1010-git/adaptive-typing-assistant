export interface ObservedKeyEvent {
  observedKey: string;
  timestampMs: number;
}

export type FilterDecisionReason = "first-event" | "different-key" | "outside-threshold" | "rapid-repeat";

export interface FilterDecision {
  inputIndex: number;
  observedKey: string;
  timestampMs: number;
  accepted: boolean;
  thresholdMs: number;
  nextThresholdMs: number;
  reason: FilterDecisionReason;
}

export interface DuplicateFilter {
  process(event: ObservedKeyEvent): FilterDecision;
  reset(): void;
}

export interface AdaptiveFilterOptions {
  windowSize?: number;
  minimumThresholdMs?: number;
  maximumThresholdMs?: number;
  initialThresholdMs?: number;
  medianMultiplier?: number;
}

const DEFAULT_FIXED_THRESHOLD_MS = 180;

function validateTimestamp(previous: ObservedKeyEvent | null, current: ObservedKeyEvent): void {
  if (!Number.isFinite(current.timestampMs)) {
    throw new Error("Event timestamp must be finite.");
  }
  if (previous && current.timestampMs < previous.timestampMs) {
    throw new Error("Events must be processed in timestamp order.");
  }
}

function getDecisionReason(
  previous: ObservedKeyEvent | null,
  current: ObservedKeyEvent,
  intervalMs: number | null,
  thresholdMs: number,
): FilterDecisionReason {
  if (!previous) return "first-event";
  if (previous.observedKey !== current.observedKey) return "different-key";
  if (intervalMs !== null && intervalMs < thresholdMs) return "rapid-repeat";
  return "outside-threshold";
}

export class FixedDebounceFilter implements DuplicateFilter {
  private previousEvent: ObservedKeyEvent | null = null;
  private nextInputIndex = 0;

  constructor(readonly thresholdMs = DEFAULT_FIXED_THRESHOLD_MS) {
    if (!Number.isFinite(thresholdMs) || thresholdMs < 0) {
      throw new Error("Fixed threshold must be a non-negative number.");
    }
  }

  process(event: ObservedKeyEvent): FilterDecision {
    validateTimestamp(this.previousEvent, event);
    const intervalMs = this.previousEvent ? event.timestampMs - this.previousEvent.timestampMs : null;
    const reason = getDecisionReason(this.previousEvent, event, intervalMs, this.thresholdMs);
    const decision: FilterDecision = {
      inputIndex: this.nextInputIndex,
      observedKey: event.observedKey,
      timestampMs: event.timestampMs,
      accepted: reason !== "rapid-repeat",
      thresholdMs: this.thresholdMs,
      nextThresholdMs: this.thresholdMs,
      reason,
    };

    this.previousEvent = event;
    this.nextInputIndex += 1;
    return decision;
  }

  reset(): void {
    this.previousEvent = null;
    this.nextInputIndex = 0;
  }
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  return (ordered[middle - 1] + ordered[middle]) / 2;
}

export class AdaptiveDebounceFilter implements DuplicateFilter {
  private previousEvent: ObservedKeyEvent | null = null;
  private intervalsMs: number[] = [];
  private nextInputIndex = 0;
  private threshold: number;

  private readonly windowSize: number;
  private readonly minimumThresholdMs: number;
  private readonly maximumThresholdMs: number;
  private readonly medianMultiplier: number;
  private readonly initialThresholdMs: number;

  constructor(options: AdaptiveFilterOptions = {}) {
    this.windowSize = options.windowSize ?? 9;
    this.minimumThresholdMs = options.minimumThresholdMs ?? 100;
    this.maximumThresholdMs = options.maximumThresholdMs ?? 350;
    this.medianMultiplier = options.medianMultiplier ?? 0.75;
    const initialThresholdMs = options.initialThresholdMs ?? 180;

    if (!Number.isInteger(this.windowSize) || this.windowSize < 1) {
      throw new Error("Adaptive interval window must be a positive integer.");
    }
    if (!Number.isFinite(this.minimumThresholdMs) || !Number.isFinite(this.maximumThresholdMs)
      || this.minimumThresholdMs < 0 || this.maximumThresholdMs < this.minimumThresholdMs) {
      throw new Error("Adaptive threshold bounds must be non-negative and ordered.");
    }
    if (!Number.isFinite(initialThresholdMs)
      || initialThresholdMs < this.minimumThresholdMs || initialThresholdMs > this.maximumThresholdMs) {
      throw new Error("Initial threshold must be within the adaptive bounds.");
    }
    if (!Number.isFinite(this.medianMultiplier) || this.medianMultiplier <= 0) {
      throw new Error("Median multiplier must be greater than zero.");
    }

    this.initialThresholdMs = initialThresholdMs;
    this.threshold = initialThresholdMs;
  }

  get currentThresholdMs(): number {
    return this.threshold;
  }

  process(event: ObservedKeyEvent): FilterDecision {
    validateTimestamp(this.previousEvent, event);
    const intervalMs = this.previousEvent ? event.timestampMs - this.previousEvent.timestampMs : null;
    const appliedThreshold = this.threshold;
    const reason = getDecisionReason(this.previousEvent, event, intervalMs, appliedThreshold);

    if (intervalMs !== null) {
      this.intervalsMs.push(intervalMs);
      if (this.intervalsMs.length > this.windowSize) this.intervalsMs.shift();
      this.threshold = Math.min(
        this.maximumThresholdMs,
        Math.max(this.minimumThresholdMs, median(this.intervalsMs) * this.medianMultiplier),
      );
    }

    const decision: FilterDecision = {
      inputIndex: this.nextInputIndex,
      observedKey: event.observedKey,
      timestampMs: event.timestampMs,
      accepted: reason !== "rapid-repeat",
      thresholdMs: appliedThreshold,
      nextThresholdMs: this.threshold,
      reason,
    };

    this.previousEvent = event;
    this.nextInputIndex += 1;
    return decision;
  }

  reset(): void {
    this.previousEvent = null;
    this.intervalsMs = [];
    this.nextInputIndex = 0;
    this.threshold = this.initialThresholdMs;
  }
}