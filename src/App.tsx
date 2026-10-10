import { useState, type FormEvent } from "react";
import { ExperimentDashboard } from "./experiment/ExperimentDashboard";
import type { BatchExperimentResult } from "./experiment/runner";
import type { ExperimentWorkerResponse } from "./experiment/workerProtocol";
import { LiveTypingSession, type LiveKeyboardMode } from "./liveTyping/session";
import { compareFilters, type FilterComparison } from "./simulation/evaluation";
import { simulateInput, type SimulationResult } from "./simulation/simulator";

const keyRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function App() {
  const [liveSession] = useState(() => new LiveTypingSession());
  const [liveState, setLiveState] = useState(() => liveSession.getSnapshot());
  const [phrase, setPhrase] = useState("hello again");
  const [seed, setSeed] = useState("banana-01");
  const [duplicatePercent, setDuplicatePercent] = useState(8);
  const [positionalPercent, setPositionalPercent] = useState(3);
  const [minimumInterval, setMinimumInterval] = useState(140);
  const [maximumInterval, setMaximumInterval] = useState(360);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [comparison, setComparison] = useState<FilterComparison | null>(null);
  const [simulationError, setSimulationError] = useState("");
  const [experimentResult, setExperimentResult] = useState<BatchExperimentResult | null>(null);
  const [experimentProgress, setExperimentProgress] = useState({ completedRuns: 0, totalRuns: 0 });
  const [experimentRunning, setExperimentRunning] = useState(false);
  const [experimentError, setExperimentError] = useState("");

  function pressKey(key: string) {
    if (key === "Backspace") {
      setLiveState(liveSession.backspace());
    } else if (key === "Clear") {
      setLiveState(liveSession.clearText());
    } else {
      setLiveState(liveSession.activate(key === "Space" ? " " : key, performance.now()));
    }
  }

  function changeKeyboardMode(mode: LiveKeyboardMode) {
    setLiveState(liveSession.setMode(mode));
  }

  function resetLiveSession() {
    setLiveState(liveSession.resetSession());
  }

  function runSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSimulationError("");

    try {
      const result = simulateInput({
        phrase,
        seed,
        duplicateProbability: duplicatePercent / 100,
        positionalProbability: positionalPercent / 100,
        minIntervalMs: minimumInterval,
        maxIntervalMs: maximumInterval,
      });
      setSimulation(result);
      setComparison(compareFilters(result.intendedText, result.events));
    } catch (error) {
      setSimulation(null);
      setComparison(null);
      setSimulationError(error instanceof Error ? error.message : "Unable to run this simulation.");
    }
  }

  function runBatchExperiment() {
    setExperimentResult(null);
    setExperimentError("");
    setExperimentProgress({ completedRuns: 0, totalRuns: 0 });
    setExperimentRunning(true);

    try {
      const worker = new Worker(new URL("./experiment/experiment.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<ExperimentWorkerResponse>) => {
        if (event.data.type === "progress") {
          setExperimentProgress({ completedRuns: event.data.completedRuns, totalRuns: event.data.totalRuns });
        } else if (event.data.type === "complete") {
          setExperimentResult(event.data.result);
          setExperimentRunning(false);
          worker.terminate();
        } else {
          setExperimentError(event.data.message);
          setExperimentRunning(false);
          worker.terminate();
        }
      };
      worker.onerror = (event) => {
        setExperimentError(event.message || "Experiment worker failed.");
        setExperimentRunning(false);
        worker.terminate();
      };
      worker.postMessage({ type: "run" });
    } catch (error) {
      setExperimentError(error instanceof Error ? error.message : "Unable to start the experiment worker.");
      setExperimentRunning(false);
    }
  }

  const comparisonRows = comparison ? [
    { name: "Unfiltered baseline", result: comparison.unfiltered },
    { name: "Fixed debounce", result: comparison.fixed },
    { name: "Adaptive debounce", result: comparison.adaptive },
  ] : [];

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>BananaBots <span className="brand-divider">/</span> Input Lab</span>
        </div>
        <span className="milestone-tag">MILESTONE 04 <span aria-hidden="true">·</span> LIVE INPUT</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Live typing and controlled simulation</p>
        <h1 id="page-title">Adaptive Typing Assistant</h1>
        <p className="intro-copy">
          Try standard, fixed, and adaptive input on the live keyboard. The separate simulator and batch study remain synthetic.
        </p>
      </section>

      <div className="workbench">
        <section className="baseline-panel" aria-labelledby="baseline-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 <span aria-hidden="true">/</span> Practice</p>
              <h2 id="baseline-title">Live keyboard</h2>
            </div>
            <span className="mode-label"><span className="status-dot" /> {liveState.mode === "standard" ? "Standard" : "Filtering"}</span>
          </div>

          <fieldset className="mode-fieldset">
            <legend className="field-label">Keyboard mode</legend>
            <div className="mode-selector" role="group" aria-label="Keyboard mode">
              {([
                ["standard", "Standard"],
                ["fixed", "Fixed debounce"],
                ["adaptive", "Adaptive debounce"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  className="mode-option"
                  type="button"
                  aria-pressed={liveState.mode === mode}
                  onClick={() => changeKeyboardMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field-label" htmlFor="typed-text">Live typed text</label>
          <textarea
            id="typed-text"
            className="typed-text"
            value={liveState.text}
            readOnly
            aria-describedby="live-keyboard-note"
            placeholder="Activate an on-screen key to start typing…"
            rows={4}
            spellCheck={false}
          />
          <div className="live-metrics" aria-live="polite" aria-atomic="true">
            <div className="live-metric"><strong>{liveState.totalActivations}</strong><span>Total activations</span></div>
            <div className="live-metric"><strong>{liveState.acceptedActivations}</strong><span>Accepted</span></div>
            <div className="live-metric"><strong>{liveState.suppressedActivations}</strong><span>Suppressed</span></div>
            <div className="live-metric"><strong>{liveState.currentThresholdMs === null ? "Off" : `${liveState.currentThresholdMs.toFixed(0)} ms`}</strong><span>Current threshold</span></div>
          </div>
          <div className="text-meta" aria-live="polite">
            <span>{liveState.text.length} characters</span>
            <span>
              {liveState.lastAction
                ? `${liveState.lastAction.key === " " ? "Space" : liveState.lastAction.key} ${liveState.lastAction.accepted ? "accepted" : "suppressed"}`
                : "No key activations yet"}
            </span>
          </div>

          <div className="keyboard" role="group" aria-label="On-screen QWERTY keyboard">
            <div className="key-grid">
              {keyRows.map((row, rowIndex) => (
                <div className={`key-row key-row-${rowIndex + 1}`} key={row}>
                  {[...row].map((key) => (
                    <button
                      className="key-button"
                      key={key}
                      type="button"
                      aria-label={`Type ${key}`}
                      onClick={() => pressKey(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              ))}
              <div className="key-row key-row-actions">
                <button className="key-button utility-key" type="button" onClick={() => pressKey("Clear")}>
                  Clear
                </button>
                <button className="key-button space-key" type="button" aria-label="Type space" onClick={() => pressKey("Space")}>
                  Space
                </button>
                <button className="key-button utility-key" type="button" aria-label="Delete last character" onClick={() => pressKey("Backspace")}>
                  Backspace
                </button>
              </div>
            </div>
          </div>
          <p className="keyboard-hint">Use Tab and Enter or Space to operate each key, or type in the text field.</p>
          <p id="live-keyboard-note" className="keyboard-hint">Backspace and Clear are not filtered or counted as key activations; each resets filter timing history. Mode changes reset counters and filter history but keep accepted text.</p>
          <button className="reset-session-button" type="button" onClick={resetLiveSession}>Reset Session</button>
        </section>

        <section className="simulator-panel" aria-labelledby="simulator-title">
          <div className="section-heading simulator-heading">
            <div>
              <p className="eyebrow">02 <span aria-hidden="true">/</span> Experiment</p>
              <h2 id="simulator-title">Input-error simulator</h2>
            </div>
            <span className="seed-stamp">SEEDED RUN</span>
          </div>

          <form className="simulator-form" onSubmit={runSimulation}>
            <label className="form-field phrase-field">
              <span className="field-label">Intended phrase</span>
              <input value={phrase} onChange={(event) => setPhrase(event.target.value)} required />
            </label>
            <label className="form-field seed-field">
              <span className="field-label">Random seed</span>
              <input value={seed} onChange={(event) => setSeed(event.target.value)} required />
            </label>

            <label className="form-field range-field">
              <span className="range-label"><span>Duplicate activation</span><output>{duplicatePercent}%</output></span>
              <input type="range" min="0" max="100" step="1" value={duplicatePercent} onChange={(event) => setDuplicatePercent(Number(event.target.value))} />
            </label>
            <label className="form-field range-field">
              <span className="range-label"><span>Neighboring-key error</span><output>{positionalPercent}%</output></span>
              <input type="range" min="0" max="100" step="1" value={positionalPercent} onChange={(event) => setPositionalPercent(Number(event.target.value))} />
            </label>

            <fieldset className="timing-fields">
              <legend>Activation interval <span>(milliseconds)</span></legend>
              <label className="form-field">
                <span className="field-label">Minimum</span>
                <input type="number" min="0" max="10000" step="10" value={minimumInterval} onChange={(event) => setMinimumInterval(Number(event.target.value))} required />
              </label>
              <label className="form-field">
                <span className="field-label">Maximum</span>
                <input type="number" min="0" max="10000" step="10" value={maximumInterval} onChange={(event) => setMaximumInterval(Number(event.target.value))} required />
              </label>
            </fieldset>

            <button className="run-button" type="submit">Run filter comparison <span aria-hidden="true">↗</span></button>
          </form>

          {simulationError && <p className="error-message" role="alert">{simulationError}</p>}

          {simulation && comparison ? (
            <section className="results" aria-labelledby="results-title" aria-live="polite">
              <div className="results-heading">
                <div>
                  <p className="eyebrow">Seed <span className="result-seed">{seed}</span></p>
                  <h3 id="results-title">Filter comparison</h3>
                </div>
                <span className="result-mark" aria-hidden="true">↘</span>
              </div>
              <div className="reference-cell">
                <span className="result-label">Intended reference</span>
                <p>{simulation.intendedText || <span className="empty-result">(empty)</span>}</p>
              </div>
              <div className="comparison-table-scroll">
                <div className="table-scroll">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th scope="col">Strategy</th>
                        <th scope="col">Output</th>
                        <th scope="col">CER</th>
                        <th scope="col">Accepted</th>
                        <th scope="col">Suppressed</th>
                        <th scope="col">False suppressions</th>
                        <th scope="col">Duplicates removed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map(({ name, result }) => (
                        <tr key={name}>
                          <th scope="row">{name}</th>
                          <td className="output-cell">{result.outputText || <span className="empty-result">(empty)</span>}</td>
                          <td>{(result.characterErrorRate * 100).toFixed(1)}%</td>
                          <td>{result.acceptedCount}</td>
                          <td>{result.suppressedCount}</td>
                          <td>{result.falseSuppressionCount}</td>
                          <td>{result.duplicateSuppressionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="comparison-note">Each strategy processed the same observed events. Lower CER is not guaranteed; false suppressions count intended activations removed by a filter.</p>
            </section>
          ) : (
            <div className="results-placeholder" aria-live="polite">
              <span className="placeholder-index">A</span>
              <p>Choose a phrase and seed to generate a repeatable baseline run.</p>
            </div>
          )}
        </section>
      </div>

      <section className="batch-experiment-panel" aria-labelledby="batch-experiment-title">
        <div className="batch-heading">
          <div>
            <p className="eyebrow">03 <span aria-hidden="true">/</span> Batch study</p>
            <h2 id="batch-experiment-title">Experimental evaluation</h2>
            <p>90 conditions × 100 seeds. The batch runs in a background worker; the page remains responsive.</p>
          </div>
          <button className="run-button batch-run-button" type="button" onClick={runBatchExperiment} disabled={experimentRunning}>
            {experimentRunning ? "Experiment running…" : "Run 9,000 simulations"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>

        {experimentRunning && (
          <div className="experiment-progress" aria-live="polite">
            <progress value={experimentProgress.completedRuns} max={experimentProgress.totalRuns || 9000} aria-label="Experiment progress" />
            <span>{experimentProgress.completedRuns.toLocaleString()} / {(experimentProgress.totalRuns || 9000).toLocaleString()} runs</span>
          </div>
        )}
        {experimentError && <p className="error-message" role="alert">{experimentError}</p>}
        {experimentResult && <ExperimentDashboard result={experimentResult} />}
      </section>

      <footer className="page-footer">
        <p>Simulation only. These generated results are not evidence of real-world performance or outcomes for people with disabilities.</p>
        <span>M4 <span aria-hidden="true">/</span> LIVE INPUT</span>
      </footer>
    </main>
  );
}

export default App;