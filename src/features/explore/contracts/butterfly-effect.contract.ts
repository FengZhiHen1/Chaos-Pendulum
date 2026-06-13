/**
 * 模块: explore.contracts.butterfly-effect
 * 职责: 定义蝴蝶效应对比器的契约边界——双 Worker 调度、分离度计算、同步控制、Delta 编辑模式。
 *       EXP-04 的核心职责：双视口并排展示微小的初值差异如何导致轨迹分离。
 * 数据来源:
 *   - SimulationFrame (simulation/contracts): MUST — 两侧仿真的状态数据
 *   - StateVector (shared/domain/valueObjects): MUST — 状态向量类型
 *   - PendulumParams (shared/domain/valueObjects): MUST — 物理参数类型
 * 边界:
 *   - 依赖: simulation/contracts, shared/domain/valueObjects
 *   - 被依赖: view/components/ButterflySplit, view/components/ButterflyUI
 * 禁止行为:
 *   - 禁止蝴蝶效应 Worker 直接访问主仿真 Worker——通过 commandBus 通信
 *   - 禁止分离度检测使用二元判定（if>90°pass else fail）——使用连续置信度分数
 *   - 禁止 Delta 编辑在仿真运行中直接修改 Worker 参数——需先 pause 再 apply
 */

import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract DeltaEditMode — Delta 编辑模式
// ───────────────────────────────────────────────

/**
 * Delta（初始差异）的编辑模式。
 *
 * 前置: 蝴蝶效应已启动
 * 后置: 决定了参数调节的应用范围
 * 输入约束: "synced" | "a-only" | "b-only"
 * 输出约束: 精确的字符串字面量类型
 * 异常: 无
 * Side Effects: 无
 */
export type DeltaEditMode = "synced" | "a-only" | "b-only";

// ───────────────────────────────────────────────
// @contract ButterflyDefaults — 蝴蝶效应默认值
// ───────────────────────────────────────────────

/** 蝴蝶效应默认配置 */
export const BUTTERFLY_DEFAULTS = {
  /** 默认初始差异 (度) */
  defaultDeltaDeg: 0.001,
  /** 最小初始差异 (度) — 1e-6° */
  minDeltaDeg: 1e-6,
  /** 最大初始差异 (度) */
  maxDeltaDeg: 10,
  /** 完全失相关阈值：分离度 > 90° */
  fullyDecoupledThresholdDeg: 90,
  /** 分离度计算用角度归一化范围 */
  angleRange: Math.PI,
  /** 分隔线宽度 (px) */
  dividerWidth: 2,
} as const;

// ───────────────────────────────────────────────
// @contract EnergySnapshot — 能量快照
// ───────────────────────────────────────────────

/**
 * 某一侧的能量快照——用于蝴蝶效应两侧的能量对比。
 *
 * 前置: 从 SimulationFrame 中提取
 * 后置: 三个字段均为有限值；kinetic >= 0
 * 输入约束: 见各字段
 * 输出约束: total = kinetic + potential
 * 异常: 无
 * Side Effects: 无
 */
export interface EnergySnapshot {
  readonly kinetic: number;
  readonly potential: number;
  readonly total: number;
}

// ───────────────────────────────────────────────
// @contract SimSideState — 单侧仿真状态
// ───────────────────────────────────────────────

/**
 * 蝴蝶效应中一侧（A 或 B）的完整仿真状态。
 *
 * 前置: Worker 已返回至少一帧数据
 * 后置: 用于 3D 渲染该侧的摆体位置
 * 输入约束:
 *   - state: 四个角度/角速度分量均为有限值
 *   - params: 六字段已通过校验
 *   - energy: 三个分量均为有限值
 *   - x1/y1/x2/y2: 笛卡尔坐标 (m)，物理坐标系 y↑
 *   - workerReady: Worker 是否已就绪（第一次 ready 消息到达后为 true）
 *   - simTime: 当前仿真时间 (s)
 * 输出约束: 所有数值字段为有限值
 * 异常: 无——纯数据容器
 * Side Effects: 无
 */
export interface SimSideState {
  readonly state: StateVector;
  readonly params: PendulumParams;
  readonly energy: EnergySnapshot;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly workerReady: boolean;
  readonly simTime: number;
}

// ───────────────────────────────────────────────
// @contract SeparationMetrics — 分离度指标
// ───────────────────────────────────────────────

/**
 * 两侧轨迹的分离度指标。
 *
 * 前置: 两侧均有至少一帧数据
 * 后置: currentSeparation >= 0
 * 输入约束:
 *   - currentSeparation: 当前分离度（角度差 + 角速度差的欧氏距离）
 *   - isFullyDecoupled: 分离度 > 90° → true
 *   - maxSeparation: 历史最大分离度
 *   - decoupledAt: 首次完全失相关的仿真时间 (s)，null 表示未发生
 * 输出约束: currentSeparation ∈ [0, ∞), maxSeparation >= currentSeparation
 * 异常: 无
 * Side Effects: 无
 */
export interface SeparationMetrics {
  /** 当前分离度（角度差+角速度差欧氏距离） */
  readonly currentSeparation: number;
  /** 是否已完全失相关（> 90°） */
  readonly isFullyDecoupled: boolean;
  /** 历史最大分离度 */
  readonly maxSeparation: number;
  /** 首次完全失相关的仿真时间 (s) */
  readonly decoupledAt: number | null;
}

// ───────────────────────────────────────────────
// @contract IButterflyScheduler — 蝴蝶效应调度器
// ───────────────────────────────────────────────

/**
 * 蝴蝶效应双 Worker 调度器端口——管理两侧独立的 Worker 实例。
 *
 * 前置: 主仿真正在运行（提供 baseParams 和 baseState）
 * 后置: 两侧 Worker 已创建并返回仿真帧
 * 输入约束:
 *   - baseParams: 六字段已通过硬约束校验
 *   - baseState: 四分量均为有限值
 *   - deltaDeg: [1e-6, 10] 范围内的角度差异
 * 输出约束: 两侧帧数据通过 commandBus 事件异步推送
 * 异常:
 *   - WorkerCrashError: 任一侧 Worker 崩溃且恢复失败
 *   - TimeoutError: Worker 初始化或积分超时
 * Side Effects: 创建/销毁 Worker 实例；注册 commandBus 事件处理器；
 *   启动/停止 rAF 循环
 */
export interface IButterflyScheduler {
  /** 启动蝴蝶效应——创建两侧 Worker 并发送 init */
  start(baseParams: PendulumParams, baseState: StateVector, deltaDeg: number): void;

  /** 播放——两侧同时开始积分 */
  play(): void;

  /** 暂停——两侧同时停止 */
  pause(): void;

  /** 重置——销毁两侧 Worker 并清空状态 */
  reset(): void;

  /** 销毁——释放所有资源 */
  destroy(): void;

  /** 更新参数（根据 editMode 决定应用到哪一侧） */
  updateParams(patch: Partial<PendulumParams>, mode: DeltaEditMode): void;

  /** 更新 Delta 值 */
  setDelta(deltaDeg: number): void;

  /** 是否正在运行 */
  get isRunning(): boolean;
}

// ───────────────────────────────────────────────
// @contract ISeparationCalculator — 分离度计算器
// ───────────────────────────────────────────────

/**
 * 分离度计算器——计算两侧轨迹之间的分离程度。
 *
 * 前置: sideA 和 sideB 的 state 均为有效值
 * 后置: 返回 SeparationMetrics
 * 输入约束:
 *   - sideA: 金色摆 A 的 SimSideState
 *   - sideB: 紫色摆 B 的 SimSideState
 * 输出约束:
 *   - currentSeparation 使用角度差+角速度差的欧氏距离
 *   - isFullyDecoupled 在分离度 > 90° 时为 true
 * 异常: 无
 * Side Effects: 无——纯计算
 */
export interface ISeparationCalculator {
  /** 计算当前分离度 */
  compute(sideA: SimSideState, sideB: SimSideState): SeparationMetrics;
}

// ───────────────────────────────────────────────
// @contract IDeltaController — Delta 控制器
// ───────────────────────────────────────────────

/**
 * Delta（初始差异）控制器——管理初值差异的精确调节。
 *
 * 前置: 蝴蝶效应已启动
 * 后置: deltaDeg 已更新并应用到相应 Worker
 * 输入约束:
 *   - deltaDeg: [1e-6, 10] 度
 *   - editMode: "synced" | "a-only" | "b-only"
 *     · synced: A 和 B 均应用新参数，B 的 theta1 = A.theta1 + deltaDeg
 *     · a-only: 只修改 A 的参数
 *     · b-only: 只修改 B 的参数
 * 输出约束: 参数通过 commandBus 异步发送到 Worker
 * 异常: RangeError — deltaDeg 超出 [1e-6, 10] 范围
 * Side Effects: 发送参数更新命令到 Worker
 */
export interface IDeltaController {
  /** 设置初始差异值（度） */
  setDelta(deltaDeg: number): void;

  /** 设置编辑模式 */
  setEditMode(mode: DeltaEditMode): void;

  /** 获取当前 Delta 值 */
  get deltaDeg(): number;

  /** 获取当前编辑模式 */
  get editMode(): DeltaEditMode;
}
