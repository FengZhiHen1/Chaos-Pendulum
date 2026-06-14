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
export { readFrameField, getFrameSlice } from "./viewModel/stores/simulationSlice";

// ─── ViewModel — Hooks ────────────────────────────
export { useEnergyMonitor } from "./viewModel/hooks/useEnergyMonitor";
export { useSimulationControls } from "./viewModel/hooks/useSimulationControls";
export { usePhaseSpace } from "./viewModel/hooks/usePhaseSpace";
export { useAutoPause } from "./viewModel/hooks/useAutoPause";
export type { UseBootSequenceAPI } from "./viewModel/hooks/useBootSequence";
export { useBootSequence } from "./viewModel/hooks/useBootSequence";

// ─── Infrastructure — Worker ──────────────────────
// TODO(Phase 5): 移除以下直接 Infrastructure 导出，改为通过 Application UseCase 访问
export { Float64Pool } from "./infrastructure/worker/float64-pool";
export { SimulationScheduler } from "./infrastructure/worker/scheduler";
export type { InterpSnapshot } from "./infrastructure/worker/scheduler";
export { getScheduler, releaseScheduler } from "./infrastructure/worker/scheduler-factory";
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
export type { PhaseVariable } from "./contracts";
export { PhaseSpaceCanvas } from "./view/components/PhaseSpaceCanvas";

// ─── View — Boot ──────────────────────────────────
export { BootManager } from "./view/components/BootManager";
export { LoadingScreen } from "./view/components/LoadingScreen";
export { ErrorScreen } from "./view/components/ErrorScreen";
export { createOdeWorker } from "./infrastructure/worker/createOdeWorker";

// ─── Control Contracts (参数面板契约由 simulation 模块承载) ──
export type {
  ParameterCategory,
  IParameterValidator,
  IParameterController,
  IParameterPreview,
} from "@/features/control/contracts";
