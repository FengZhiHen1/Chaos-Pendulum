/**
 * simulation feature 公共接口。
 *
 * 五层架构：domain → application → viewModel → view → infrastructure
 * 所有外部消费者从此文件导入，禁止直接引用内部模块。
 */

// ─── Domain ──────────────────────────────────────
export { odeRhs, angularAcceleration } from "./domain/services/derivatives";
export { integratorStep, registerIntegrator, getIntegrator } from "./domain/services/integrators";
export { computeDerived, normalizeAngle, hasInvalidValue, ball2Position, projectEnergy } from "./domain/services/stateVector";
export type { DerivedValues } from "./domain/services/stateVector";

// ─── ViewModel ────────────────────────────────────
export { useSimulationStore } from "./store";
export type { SimulationFrame } from "./store";
export { readFrameField, getFrameSlice } from "@/stores/slices/simulationSlice";

// ─── ViewModel — Hooks ────────────────────────────
export { useEnergyMonitor } from "./hooks/useEnergyMonitor";
export { useSimulationControls } from "./hooks/useSimulationControls";
export { usePhaseSpace } from "./hooks/usePhaseSpace";

// ─── Infrastructure — Worker ──────────────────────
export { Float64Pool } from "./infrastructure/worker/float64-pool";
export { SimulationScheduler, getScheduler } from "./infrastructure/worker/scheduler";
export type { InterpSnapshot } from "./infrastructure/worker/scheduler";
export { setupSimulationBridge, setWorkerReady, setWorkerNotReady } from "./infrastructure/worker/bridge";

// ─── Infrastructure — History ─────────────────────
export {
  useSimulationHistory,
  clearSimulationHistory,
  getSimulationHistory,
  pauseHistoryRecording,
  resumeHistoryRecording,
} from "./infrastructure/repositories/history";

// ─── View — Components ────────────────────────────
export { ParamPanel } from "./view/components/ParamPanel";
export { ParamSlider } from "./view/components/ParamSlider";
export { MethodSelector } from "./view/components/MethodSelector";
export { PresetButtons } from "./view/components/PresetButtons";
export { EnergyMonitorPanel } from "./view/components/EnergyMonitorPanel";
export { EnergyCanvas } from "./view/components/EnergyCanvas";
export type { EnergyDataPoint } from "./view/components/EnergyCanvas";
export { PhaseSpacePanel, exportPhaseSpaceImage } from "./view/components/PhaseSpacePanel";
export type { PhaseVariable } from "./view/components/PhaseSpacePanel";
export { PhaseSpaceCanvas } from "./view/components/PhaseSpaceCanvas";

// ─── View — Boot ──────────────────────────────────
export { BootManager } from "./ui/BootManager";
export { LoadingScreen } from "./ui/LoadingScreen";
export { ErrorScreen } from "./ui/ErrorScreen";
export { createOdeWorker } from "./worker/createOdeWorker";
