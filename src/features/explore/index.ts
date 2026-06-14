/**
 * explore feature 公共接口。
 *
 * 五层架构：domain → application → viewModel → view ← infrastructure
 * 所有外部消费者从此文件导入，禁止直接引用内部模块。
 */

// ─── Store (ViewModel) ────────────────────────────
export { useExploreStore, useButterflyStore } from "./store";
export type { ReversalMode, ReversalPhase, DriftSample } from "./store";
export type {
  DeltaEditMode,
  SeparationMetrics,
  SimSideState,
  EnergySnapshot,
} from "./store";

// ─── Components (View) ────────────────────────────
export { ButterflySplit } from "./view/components/ButterflySplit";
export { SeparationAlert, DeltaPanel } from "./view/components/ButterflyUI";
export { Scene3D } from "./view/components/Scene3D";
export { TrailRenderer } from "./view/components/TrailRenderer";
export { TrailControls } from "./view/components/TrailControls";
export { TimeReversal } from "./view/components/TimeReversal";
export {
  TimeReversalTrajectoryOverlay,
  updateTrajectoryData,
  clearTrajectoryData,
} from "./view/components/TimeReversalTrajectory";
export { SonificationToggle } from "./view/components/SonificationToggle";

// ─── Hooks (ViewModel) ────────────────────────────
export { useSonification } from "./viewModel/hooks/useSonification";
export type { UseSonificationAPI } from "./viewModel/hooks/useSonification";
export { useChaosIndicator } from "./viewModel/hooks/useChaosIndicator";
export type { ChaosIndicatorAPI } from "./viewModel/hooks/useChaosIndicator";
export { useChaosUpdater } from "./viewModel/hooks/useChaosUpdater";
export { useTrailBuffer } from "./viewModel/hooks/useTrailBuffer";
export type { TrailPoint, TrailBufferAPI } from "./viewModel/hooks/useTrailBuffer";

// ─── Pages ────────────────────────────────────────
export { ExplorePage } from "./view/pages/ExplorePage";

// ─── Contracts 重导出 ──────────────────────────────
export type { SonificationParams, ISonificationEngine, ISonificationController } from "./contracts";
export { SONIFICATION_DEFAULTS } from "./contracts";

export type {
  IButterflyScheduler,
  ISeparationCalculator,
  IDeltaController,
} from "./contracts";
export { BUTTERFLY_DEFAULTS } from "./contracts";

export type { ITimeReversalController, IDriftCalculator } from "./contracts";
export { REVERSAL_DEFAULTS } from "./contracts";

export type {
  ViewPreset,
  TrailLength,
  TrailPoint as ContractTrailPoint,
  TrailConfig,
  Scene3DConfig,
  ChaosIndicatorState,
  ResponsiveConfig,
} from "./contracts";
export {
  DEFAULT_TRAIL_CONFIG,
  DEFAULT_SCENE3D_CONFIG,
  RESPONSIVE_PRESETS,
} from "./contracts";

export {
  ExploreError,
  AudioContextError,
  ButterflyWorkerError,
  InsufficientHistoryError,
  InvalidDeltaError,
} from "./contracts";
