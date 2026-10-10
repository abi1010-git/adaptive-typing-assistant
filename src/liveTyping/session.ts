import {
  AdaptiveDebounceFilter,
  FixedDebounceFilter,
  type DuplicateFilter,
} from "../simulation/filters";

export type LiveKeyboardMode = "standard" | "fixed" | "adaptive";

export interface LiveSessionSnapshot {
  mode: LiveKeyboardMode;
  text: string;
  totalActivations: number;
  acceptedActivations: number;
  suppressedActivations: number;
  currentThresholdMs: number | null;
  lastAction: { key: string; accepted: boolean } | null;
}

function createFilter(mode: LiveKeyboardMode): DuplicateFilter | null {
  if (mode === "fixed") return new FixedDebounceFilter();
  if (mode === "adaptive") return new AdaptiveDebounceFilter();
  return null;
}

export class LiveTypingSession {
  private mode: LiveKeyboardMode = "standard";
  private text = "";
  private filter: DuplicateFilter | null = null;
  private totalActivations = 0;
  private acceptedActivations = 0;
  private suppressedActivations = 0;
  private lastAction: LiveSessionSnapshot["lastAction"] = null;

  setMode(mode: LiveKeyboardMode): LiveSessionSnapshot {
    if (this.mode === mode) return this.getSnapshot();

    this.mode = mode;
    this.filter = createFilter(mode);
    this.resetMetrics();
    return this.getSnapshot();
  }

  activate(key: string, timestampMs: number): LiveSessionSnapshot {
    const accepted = this.filter?.process({ observedKey: key, timestampMs }).accepted ?? true;
    this.totalActivations += 1;

    if (accepted) {
      this.acceptedActivations += 1;
      this.text += key;
    } else {
      this.suppressedActivations += 1;
    }

    this.lastAction = { key, accepted };
    return this.getSnapshot();
  }

  backspace(): LiveSessionSnapshot {
    this.text = this.text.slice(0, -1);
    this.filter?.reset();
    return this.getSnapshot();
  }

  clearText(): LiveSessionSnapshot {
    this.text = "";
    this.filter?.reset();
    return this.getSnapshot();
  }

  resetSession(): LiveSessionSnapshot {
    this.text = "";
    this.filter?.reset();
    this.resetMetrics();
    return this.getSnapshot();
  }

  getSnapshot(): LiveSessionSnapshot {
    const currentThresholdMs = this.mode === "fixed"
      ? (this.filter as FixedDebounceFilter).thresholdMs
      : this.mode === "adaptive"
        ? (this.filter as AdaptiveDebounceFilter).currentThresholdMs
        : null;

    return {
      mode: this.mode,
      text: this.text,
      totalActivations: this.totalActivations,
      acceptedActivations: this.acceptedActivations,
      suppressedActivations: this.suppressedActivations,
      currentThresholdMs,
      lastAction: this.lastAction ? { ...this.lastAction } : null,
    };
  }

  private resetMetrics(): void {
    this.totalActivations = 0;
    this.acceptedActivations = 0;
    this.suppressedActivations = 0;
    this.lastAction = null;
  }
}