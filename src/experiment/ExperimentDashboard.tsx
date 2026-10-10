import type { CSSProperties } from "react";
import type {
  BatchExperimentResult,
  ConditionAggregate,
  StrategyAggregate,
  StrategyName,
} from "./runner";

const strategies: readonly StrategyName[] = ["unfiltered", "fixed", "adaptive"];
const strategyLabels: Record<StrategyName, string> = {
  unfiltered: "Unfiltered",
  fixed: "Fixed debounce",
  adaptive: "Adaptive debounce",
};

function percent(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function metricTriplet(
  methods: Record<StrategyName, StrategyAggregate>,
  metric: keyof StrategyAggregate,
): string {
  return strategies.map((strategy) => percent(methods[strategy][metric])).join(" / ");
}

function downloadRunRecords(result: BatchExperimentResult): void {
  const header = [
    "condition_id", "seed", "duplicate_probability", "speed_range", "min_interval_ms", "max_interval_ms",
    "phrase", "has_repeated_letters", "intended_input_count", "injected_duplicate_count", "total_events_processed",
    "unfiltered_output", "fixed_output", "adaptive_output", "unfiltered_cer", "fixed_cer", "adaptive_cer",
    "unfiltered_false_suppressions", "fixed_false_suppressions", "adaptive_false_suppressions",
    "unfiltered_duplicate_suppressions", "fixed_duplicate_suppressions", "adaptive_duplicate_suppressions",
    "final_adaptive_threshold_ms",
  ];
  const rows = result.runs.map((run) => [
    run.conditionId,
    run.seed,
    run.duplicateProbability,
    run.speedRangeLabel,
    run.minIntervalMs,
    run.maxIntervalMs,
    run.phrase,
    run.hasRepeatedLetters,
    run.intendedInputCount,
    run.injectedDuplicateCount,
    run.totalEventsProcessed,
    run.methods.unfiltered.outputText,
    run.methods.fixed.outputText,
    run.methods.adaptive.outputText,
    run.methods.unfiltered.characterErrorRate,
    run.methods.fixed.characterErrorRate,
    run.methods.adaptive.characterErrorRate,
    run.methods.unfiltered.falseSuppressions,
    run.methods.fixed.falseSuppressions,
    run.methods.adaptive.falseSuppressions,
    run.methods.unfiltered.duplicateSuppressions,
    run.methods.fixed.duplicateSuppressions,
    run.methods.adaptive.duplicateSuppressions,
    run.finalAdaptiveThresholdMs,
  ]);
  const csvValue = (value: string | number | boolean) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "adaptive-typing-experiment-runs.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface MetricChartProps {
  title: string;
  description: string;
  values: Record<StrategyName, number>;
  formatValue: (value: number) => string;
}

function MetricChart({ title, description, values, formatValue }: MetricChartProps) {
  const maximum = Math.max(...strategies.map((strategy) => values[strategy]), 0.0001);

  return (
    <figure className="experiment-chart">
      <figcaption>
        <h4>{title}</h4>
        <p>{description}</p>
      </figcaption>
      <div className="chart-rows">
        {strategies.map((strategy) => {
          const value = values[strategy];
          const style = { "--bar-width": `${(value / maximum) * 100}%` } as CSSProperties;
          return (
            <div className={`chart-row chart-${strategy}`} key={strategy}>
              <span className="chart-label">{strategyLabels[strategy]}</span>
              <div className="chart-track" role="img" aria-label={`${strategyLabels[strategy]}: ${formatValue(value)}`}>
                <span className="chart-bar" style={style} />
              </div>
              <strong>{formatValue(value)}</strong>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function ConditionRow({ aggregate }: { aggregate: ConditionAggregate }) {
  const { condition } = aggregate;
  return (
    <tr>
      <th scope="row">{Math.round(condition.duplicateProbability * 100)}%</th>
      <td>{condition.speedRange.label} · {condition.speedRange.minIntervalMs}–{condition.speedRange.maxIntervalMs} ms</td>
      <td>{condition.hasRepeatedLetters ? "Repeated letters" : "No repeated letters"} · {condition.phrase}</td>
      <td>{metricTriplet(aggregate.methods, "meanCharacterErrorRate")}</td>
      <td>{metricTriplet(aggregate.methods, "medianCharacterErrorRate")}</td>
      <td>{metricTriplet(aggregate.methods, "falseSuppressionRate")}</td>
      <td>{metricTriplet(aggregate.methods, "duplicateSuppressionRate")}</td>
      <td>{percent(aggregate.adaptiveWins)} / {percent(aggregate.fixedWins)} / {percent(aggregate.ties)}</td>
      <td>{aggregate.meanFinalAdaptiveThresholdMs.toFixed(0)} ms</td>
    </tr>
  );
}

export function ExperimentDashboard({ result }: { result: BatchExperimentResult }) {
  return (
    <section className="experiment-dashboard" aria-labelledby="experiment-results-title">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">04 <span aria-hidden="true">/</span> Results</p>
          <h2 id="experiment-results-title">Batch experiment</h2>
          <p className="dashboard-subtitle">
            {result.totalRuns.toLocaleString()} paired runs · {result.conditions.length} conditions · {result.runsPerCondition} seeds each
          </p>
        </div>
        <button className="download-button" type="button" onClick={() => downloadRunRecords(result)}>
          Download run-level CSV
        </button>
      </div>

      <div className="charts-grid">
        <MetricChart
          title="Mean character error rate"
          description="Average CER over every run. Lower is better; values are shown as percentages."
          values={Object.fromEntries(strategies.map((strategy) => [strategy, result.overall.methods[strategy].meanCharacterErrorRate * 100])) as Record<StrategyName, number>}
          formatValue={(value) => `${value.toFixed(1)}%`}
        />
        <MetricChart
          title="False suppression rate"
          description="Intended key activations suppressed, divided by all intended activations. Lower is better."
          values={Object.fromEntries(strategies.map((strategy) => [strategy, result.overall.methods[strategy].falseSuppressionRate * 100])) as Record<StrategyName, number>}
          formatValue={(value) => `${value.toFixed(1)}%`}
        />
      </div>

      <div className="overall-summary" aria-label="Overall adaptive versus fixed comparison">
        <span>Adaptive lower CER: <strong>{percent(result.overall.adaptiveWins)}</strong></span>
        <span>Fixed lower CER: <strong>{percent(result.overall.fixedWins)}</strong></span>
        <span>Tied CER: <strong>{percent(result.overall.ties)}</strong></span>
      </div>

      <details className="metric-definitions" open>
        <summary>Metric definitions</summary>
        <dl>
          <div><dt>CER</dt><dd>Levenshtein edit distance between the intended phrase and method output, divided by intended characters. Lower is better.</dd></div>
          <div><dt>False suppression rate</dt><dd>Suppressed legitimate intended activations divided by all intended activations. Injected duplicates are excluded from this numerator.</dd></div>
          <div><dt>Duplicate suppression rate</dt><dd>Injected duplicate events suppressed divided by all injected duplicate events. Shown as N/A when a condition produced no duplicates.</dd></div>
          <div><dt>Win / tie share</dt><dd>Per-run CER comparison between adaptive and fixed; the three percentages sum to 100% within each condition.</dd></div>
          <div><dt>U / F / A</dt><dd>Values in each condition row are ordered unfiltered, fixed debounce, adaptive debounce.</dd></div>
        </dl>
      </details>

      <div className="condition-table-wrap">
        <table className="condition-table">
          <thead>
            <tr>
              <th scope="col">Duplicate probability</th>
              <th scope="col">Typing speed</th>
              <th scope="col">Phrase group</th>
              <th scope="col">Mean CER U/F/A</th>
              <th scope="col">Median CER U/F/A</th>
              <th scope="col">False suppression U/F/A</th>
              <th scope="col">Duplicate suppression U/F/A</th>
              <th scope="col">Adaptive / fixed / tie</th>
              <th scope="col">Mean final adaptive threshold</th>
            </tr>
          </thead>
          <tbody>
            {result.conditions.map((aggregate) => <ConditionRow key={aggregate.condition.id} aggregate={aggregate} />)}
          </tbody>
        </table>
      </div>
      <p className="dashboard-caveat">These are deterministic simulated results, not evidence of real-world effectiveness. Adaptive filtering may regress relative to fixed debounce. Run-level metrics and final adaptive thresholds are available in the CSV.</p>
    </section>
  );
}