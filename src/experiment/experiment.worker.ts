import { runBatchExperiment } from "./runner";
import type { ExperimentWorkerRequest, ExperimentWorkerResponse } from "./workerProtocol";

interface WorkerScope {
  onmessage: ((event: MessageEvent<ExperimentWorkerRequest>) => void) | null;
  postMessage(message: ExperimentWorkerResponse): void;
}

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = () => {
  try {
    const result = runBatchExperiment({}, (completedRuns, totalRuns) => {
      workerScope.postMessage({ type: "progress", completedRuns, totalRuns });
    });
    workerScope.postMessage({ type: "complete", result });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Experiment failed.",
    });
  }
};