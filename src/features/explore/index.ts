/**
 * explore feature 公共接口。
 *
 * 五层架构：domain → application → viewModel → view → infrastructure
 * 所有外部消费者从此文件导入，禁止直接引用内部模块。
 *
 * 类型来源优先级：
 *   1. contracts/ — 契约定义的类型（单一真相来源）
 *   2. store / butterfly-store — 向后兼容的旧导出路径
 */

// ─── Store (ViewModel) ────────────────────────────
export { useExploreStore } from "./store";
export type { ReversalMode, ReversalPhase, DriftSample } from "./store";
export { useButterflyStore } from "./butterfly-store";
export type {
  DeltaEditMode,
  SeparationMetrics,
  SimSideState,
  EnergySnapshot,
} from "./butterfly-store";

// ─── Components (View) ────────────────────────────
export { ButterflySplit } from "./components/ButterflySplit";
export { SeparationAlert, DeltaPanel } from "./components/ButterflyUI";
export { Scene3D } from "./components/Scene3D";
export { TrailRenderer } from "./components/TrailRenderer";
export { TrailControls } from "./components/TrailControls";
export { TimeReversal } from "./components/TimeReversal";
export {
  TimeReversalTrajectoryOverlay,
  updateTrajectoryData,
  clearTrajectoryData,
} from "./components/TimeReversalTrajectory";
export { SonificationToggle } from "./components/SonificationToggle";

// ─── Hooks (Application) ──────────────────────────
export { useSonification } from "./hooks/useSonification";
export type { UseSonificationAPI } from "./hooks/useSonification";
export { useChaosIndicator } from "./hooks/useChaosIndicator";
export type { ChaosIndicatorAPI } from "./hooks/useChaosIndicator";
export { useChaosUpdater } from "./hooks/useChaosUpdater";
export { useTrailBuffer } from "./hooks/useTrailBuffer";
export type { TrailPoint, TrailBufferAPI } from "./hooks/useTrailBuffer";

// ─── Pages ────────────────────────────────────────
export { ExplorePage } from "./ExplorePage";

// ─── Contracts 重导出 (新增) ──────────────────────
// 声音化
export type { SonificationParams, ISonificationEngine, ISonificationController } from "./contracts";
export { SONIFICATION_DEFAULTS } from "./contracts";

// 蝴蝶效应
export type {
  IButterflyScheduler,
  ISeparationCalculator,
  IDeltaController,
} from "./contracts";
export { BUTTERFLY_DEFAULTS } from "./contracts";

// 时间反演
export type { ITimeReversalController, IDriftCalculator } from "./contracts";
export { REVERSAL_DEFAULTS } from "./contracts";

// 共享类型
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

// 异常
export {
  ExploreError,
  AudioContextError,
  ButterflyWorkerError,
  InsufficientHistoryError,
  InvalidDeltaError,
} from "./contracts";
