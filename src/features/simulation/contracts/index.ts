/**
 * simulation.contracts — simulation 功能域的契约聚合出口。
 *
 * 提供 N 大契约：
 * 1. physics-engine: 双摆 ODE 数值积分引擎（积分器策略、注册表、解算器模板方法）
 * 2. energy-monitor: 能量实时监控（能量计算、漂移检测、守恒检验阈值）
 * 3. phase-space: 相空间可视化（轨迹收集、变量切换、Y轴自适应）
 * 4. worker-gateway: Worker 通信端口（消息协议、崩溃恢复、缓冲区池）
 * 5. simulation-scheduler: 仿真调度器（生命周期、双缓冲帧管理、外部tick驱动）
 * 6. history-repository: 历史数据仓储（正向轨迹持久化与查询）
 *
 * 核心类型：
 *   - SimulationFrame: 单帧完整仿真数据（13字段，域内"通用货币"）
 *   - IIntegrator: ODE 积分器策略接口
 *   - IEnergyCalculator: 能量计算器
 *   - IPhaseSpaceCollector: 相空间轨迹收集器
 *   - IWorkerGateway: Worker 通信端口
 *   - ISimulationScheduler: 仿真调度器 ABC
 *   - IHistoryRepository: 历史数据仓储
 *
 * 异常层次：
 *   - SimulationError → DivergenceError | TimeoutError | InvalidStateError | WorkerCrashError
 *
 * Usage:
 *     import { IIntegrator, IOdeSolver } from "@/features/simulation/contracts";
 *     import { SimulationError, DivergenceError } from "@/features/simulation/contracts";
 *     import type { SimulationFrame, EnergyDataPoint } from "@/features/simulation/contracts";
 */

// ─── 物理引擎 ─────────────────────────────────
export type {
  IIntegrator,
  IIntegratorRegistry,
  OdeRhsFunction,
} from "./physics-engine.contract";
export { IOdeSolver } from "./physics-engine.contract";

// ─── 能量监控 ─────────────────────────────────
export type {
  EnergyThresholds,
  IEnergyCalculator,
  IEnergyDriftDetector,
  EnergyDriftResult,
  IEnergyProjector,
} from "./energy-monitor.contract";
export { DEFAULT_ENERGY_THRESHOLDS } from "./energy-monitor.contract";

// ─── 相空间 ───────────────────────────────────
export type {
  PhaseVariable,
  PhaseSpacePoint,
  IPhaseSpaceCollector,
  IPhaseSpaceYDomain,
} from "./phase-space.contract";

// ─── Worker 通信 ──────────────────────────────
export type {
  IWorkerGateway,
  IWorkerRecoveryPolicy,
  IFloat64Pool,
} from "./worker-gateway.contract";

// ─── 仿真调度器 ───────────────────────────────
export type {
  ISimulationLifecycle,
  IFrameBufferManager,
} from "./simulation-scheduler.contract";
export { ISimulationScheduler } from "./simulation-scheduler.contract";

// ─── 历史仓储 ─────────────────────────────────
export type { IHistoryRepository, HistoryQuery } from "./history-repository.contract";

// ─── 共享类型 ─────────────────────────────────
export type {
  SimulationFrame,
  InterpSnapshot,
  EnergyDataPoint,
  DerivedValues,
} from "./types.contract";
export {
  FRAME_BUFFER_LAYOUT,
  FRAMES_PER_BATCH,
  BATCH_PREFETCH_THRESHOLD,
  BATCH_BUFFER_LENGTH,
  POOL_CONFIG,
  SIMULATION_DEFAULTS,
} from "./types.contract";

// ─── 异常 ─────────────────────────────────────
export {
  SimulationError,
  DivergenceError,
  TimeoutError,
  InvalidStateError,
  WorkerCrashError,
  WorkerNotReadyError,
  InvalidStateTransitionError,
} from "./exceptions";
