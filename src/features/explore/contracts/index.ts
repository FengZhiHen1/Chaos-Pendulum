/**
 * explore.contracts — 混沌现象探索功能域的契约聚合出口。
 *
 * 提供 3 大契约：
 * 1. sonification: 参数→音频映射（声音化引擎、生命周期控制、平台适配）
 * 2. butterfly-effect: 蝴蝶效应对比器（双 Worker 调度、分离度计算、Delta 控制）
 * 3. time-reversal: 时间反演实验（双模式反演、漂移曲线、教学注释）
 *
 * 核心类型：
 *   - ViewPreset: 3D 视图预设（side/top/chaos）
 *   - TrailLength / TrailPoint / TrailConfig: 运动尾迹系统
 *   - SonificationParams / ISonificationEngine: 声音化引擎
 *   - SimSideState / SeparationMetrics / IButterflyScheduler: 蝴蝶效应
 *   - ReversalMode / DriftSample / ITimeReversalController: 时间反演
 *
 * 异常层次：
 *   - ExploreError → AudioContextError | ButterflyWorkerError | InsufficientHistoryError | InvalidDeltaError
 *
 * Usage:
 *     import { ISonificationEngine } from "@/features/explore/contracts";
 *     import { IButterflyScheduler, SeparationMetrics } from "@/features/explore/contracts";
 *     import { ITimeReversalController, ReversalMode } from "@/features/explore/contracts";
 */

// ─── 声音化 ───────────────────────────────────
export type {
  SonificationParams,
  ISonificationEngine,
  ISonificationController,
} from "./sonification.contract";
export { SONIFICATION_DEFAULTS } from "./sonification.contract";

// ─── 蝴蝶效应 ─────────────────────────────────
export type {
  DeltaEditMode,
  EnergySnapshot,
  SimSideState,
  SeparationMetrics,
  IButterflyScheduler,
  ISeparationCalculator,
  IDeltaController,
} from "./butterfly-effect.contract";
export { BUTTERFLY_DEFAULTS } from "./butterfly-effect.contract";

// ─── 时间反演 ─────────────────────────────────
export type {
  ReversalMode,
  ReversalPhase,
  DriftSample,
  ITimeReversalController,
  IDriftCalculator,
} from "./time-reversal.contract";
export { REVERSAL_DEFAULTS } from "./time-reversal.contract";

// ─── 共享类型 ─────────────────────────────────
export type {
  ViewPreset,
  TrailLength,
  TrailPoint,
  TrailConfig,
  Scene3DConfig,
  ChaosIndicatorState,
  ResponsiveConfig,
} from "./types.contract";
export {
  DEFAULT_TRAIL_CONFIG,
  DEFAULT_SCENE3D_CONFIG,
  RESPONSIVE_PRESETS,
} from "./types.contract";

// ─── 异常 ─────────────────────────────────────
export {
  ExploreError,
  AudioContextError,
  ButterflyWorkerError,
  InsufficientHistoryError,
  InvalidDeltaError,
} from "./exceptions";
