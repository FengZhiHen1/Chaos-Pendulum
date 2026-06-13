export { ObservabilityCoordinator, observabilityCoordinator } from "./coordinator";
export { FPSTracker } from "./fps-tracker";
export { measure } from "./perf-mark";
export { initErrorCapture, getErrors, clearErrors } from "./error-capture";
export type {
  WorkerLatencyRecord,
  PyodideLoadPhase,
  DebugPanelTab,
  ObservabilityConfig,
} from "./types";
