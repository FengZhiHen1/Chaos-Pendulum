// Store
export { useSimulationStore, readFrameField, getFrameSlice } from "./store";
export type { SimulationFrame } from "./store";

// Engine
export { odeRhs, angularAcceleration } from "./engine/derivatives";
export { integratorStep } from "./engine/integrators";
export { computeDerived, normalizeAngle, hasInvalidValue, ball2Position, projectEnergy } from "./engine/state-vector";
export type { DerivedValues } from "./engine/state-vector";

// History (EXP-05 时间反演消费)
export { useSimulationHistory, clearSimulationHistory, getSimulationHistory, pauseHistoryRecording, resumeHistoryRecording } from "./history";

// Worker
export { Float64Pool } from "./worker/float64-pool";
export { SimulationScheduler, getScheduler } from "./worker/scheduler";
export type { InterpSnapshot } from "./worker/scheduler";
export { setupSimulationBridge, setWorkerReady, setWorkerNotReady } from "./worker/bridge";

// UI
export { ParamPanel } from "./ui/ParamPanel";
export { ParamSlider } from "./ui/ParamSlider";
export { MethodSelector } from "./ui/MethodSelector";
export { PresetButtons } from "./ui/PresetButtons";
export { EnergyMonitorPanel } from "./ui/EnergyMonitorPanel";
export { EnergyCanvas } from "./ui/EnergyCanvas";
export type { EnergyDataPoint } from "./ui/EnergyCanvas";
export { PhaseSpacePanel, exportPhaseSpaceImage } from "./ui/PhaseSpacePanel";
export type { PhaseVariable } from "./ui/PhaseSpacePanel";
export { PhaseSpaceCanvas } from "./ui/PhaseSpaceCanvas";
