import type { BatchExperimentResult } from "./runner";

export type ExperimentWorkerRequest = { type: "run" };

export type ExperimentWorkerResponse =
  | { type: "progress"; completedRuns: number; totalRuns: number }
  | { type: "complete"; result: BatchExperimentResult }
  | { type: "error"; message: string };