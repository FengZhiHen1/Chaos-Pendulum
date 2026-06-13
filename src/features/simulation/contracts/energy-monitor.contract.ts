/**
 * 模块: simulation.contracts.energy-monitor
 * 职责: 定义能量实时监控的契约边界——能量计算器、漂移检测器、守恒检验阈值。
 *       SIM-04 的核心职责：追踪系统动能与势能总和，检测能量漂移。
 * 数据来源:
 *   - SimulationFrame (types.contract): MUST — 每帧的能量数据由此类型承载
 *   - computeDerived (domain/services/stateVector): MUST — 能量计算的核心公式
 * 边界:
 *   - 依赖: types.contract (SimulationFrame, EnergyDataPoint)
 *   - 被依赖: view/components/EnergyCanvas, view/components/EnergyMonitorPanel
 * 禁止行为:
 *   - 禁止能量监控器自动调整积分步长或修正能量值（仅追踪不修正）
 *   - 禁止在监控器中直接操作 Canvas DOM——那是 View 层职责
 *   - 禁止使用二元判定（if pass else fail）——使用连续置信度分数
 */

import type { EnergyDataPoint } from "./types.contract";

// ───────────────────────────────────────────────
// @contract EnergyThresholds — 能量守恒检验阈值
// ───────────────────────────────────────────────

/**
 * 能量守恒检验阈值配置。
 *
 * 前置: 所有阈值必须为非负有限值
 * 后置: 用于 driftDetector 中的阈值比较
 * 输入约束:
 *   - driftThreshold: 1000s 仿真内相对漂移上限，默认 0.005 (0.5%)
 *   - lowEnergyThreshold: 总能量绝对值低于此值改用绝对漂移判定 (J)，默认 1.0
 *   - absDriftThreshold: 低能量区绝对漂移容忍值 (J)，默认 0.05
 *   - maxNanFrames: 连续 NaN 帧数阈值，超过则标记非活跃
 *   - stoppedOmegaThreshold: 角速度低于此值视为静止 (rad/s)
 *   - stoppedFrameCount: 连续静止帧数阈值（~2秒 @60fps）
 * 输出约束: 所有字段为 readonly
 * 异常: 无
 * Side Effects: 无
 */
export interface EnergyThresholds {
  /** 1000s 仿真内相对漂移上限 (0.005 = 0.5%) */
  readonly driftThreshold: number;
  /** 总能量绝对值低于此值时改用绝对漂移判定 (J) */
  readonly lowEnergyThreshold: number;
  /** 低能量区绝对漂移容忍值 (J) */
  readonly absDriftThreshold: number;
  /** 连续 NaN 帧数阈值 */
  readonly maxNanFrames: number;
  /** 角速度低于此值视为静止 (rad/s) */
  readonly stoppedOmegaThreshold: number;
  /** 连续静止帧数阈值 */
  readonly stoppedFrameCount: number;
}

/**
 * 默认能量守恒检验阈值。
 *
 * 前置: 基于双摆参数范围 (m∈[0.01,10], L∈[0.1,3]) 的经验值
 * 后置: 适用于标准双摆能量守恒检验
 * 输入约束: 无
 * 输出约束: 所有字段为合理正值
 * 异常: 无
 * Side Effects: 无
 */
export const DEFAULT_ENERGY_THRESHOLDS: EnergyThresholds = {
  driftThreshold: 0.005,
  lowEnergyThreshold: 1.0,
  absDriftThreshold: 0.05,
  maxNanFrames: 60,
  stoppedOmegaThreshold: 1e-6,
  stoppedFrameCount: 120,
};

// ───────────────────────────────────────────────
// @contract IEnergyCalculator — 能量计算器
// ───────────────────────────────────────────────

/**
 * 从仿真状态计算动能、势能、总能量。
 *
 * 前置: state[4] 已通过 hasInvalidValue 检查
 * 后置: 返回 EnergyDataPoint { t, K, V, E }
 * 输入约束:
 *   - state: Float64Array(4) = [θ₁, ω₁, θ₂, ω₂]
 *   - params: 已校验的 PendulumParams
 *   - t: 当前仿真时间 (s)
 * 输出约束:
 *   - K ≥ 0 (动能非负)
 *   - V 可为负（势能参考零点在 y=0）
 *   - E = K + V
 * 异常: 无
 * Side Effects: 无——纯计算函数
 */
export interface IEnergyCalculator {
  /** 计算当前帧的能量数据 */
  compute(state: Float64Array, params: { m1: number; m2: number; L1: number; L2: number; g: number }, t: number): EnergyDataPoint;
}

// ───────────────────────────────────────────────
// @contract IEnergyDriftDetector — 能量漂移检测器
// ───────────────────────────────────────────────

/**
 * 能量漂移检测器——检测仿真过程中的能量不守恒。
 *
 * 使用连续置信度分数而非二元判定。分数越高表示漂移越严重。
 *
 * 前置: initialEnergy 已从保守系统初始状态建立
 * 后置: 返回漂移检测结果（置信度分数 + 是否超阈值 + 漂移百分比）
 * 输入约束:
 *   - currentEnergy: 当前帧总能量 (J)
 *   - damping: 当前阻尼系数
 *   - isActive: 仿真是否活跃（非 NaN 状态）
 *   - resetTrigger: 仿真重置计数器（用于检测新一轮仿真）
 * 输出约束:
 *   - confidence ∈ [0, 1]：漂移可信度
 *     · 阻尼 > 0 时始终返回 0（能量不守恒是预期行为）
 *     · 阻尼 = 0 时，相对漂移 < 0.1% → 0.1，0.1-0.5% → 线性插值，≥0.5% → 0.9+
 *   - exceeded: 仅阻尼=0 且置信度 > 0.8 时为 true
 *   - driftPercent: 相对漂移百分比
 * 异常: 无
 * Side Effects: 无——纯计算
 */
export interface IEnergyDriftDetector {
  /** 建立能量基线（仿真开始或重置时调用） */
  establishBaseline(initialEnergy: number): void;

  /** 检测当前帧的能量漂移 */
  detect(
    currentEnergy: number,
    damping: number,
    isActive: boolean,
    resetTrigger: number,
  ): EnergyDriftResult;
}

/**
 * 能量漂移检测结果。
 *
 * 前置: 由 detect() 方法产出
 * 后置: 供 UI 层消费（告警显示、颜色映射）
 * 输入约束: 所有字段有明确语义
 * 输出约束: confidence ∈ [0,1], driftPercent ≥ 0
 * 异常: 无
 * Side Effects: 无
 */
export interface EnergyDriftResult {
  /** 漂移可信度 [0, 1] */
  confidence: number;
  /** 是否超过阈值 */
  exceeded: boolean;
  /** 相对漂移百分比 */
  driftPercent: number;
  /** 绝对漂移值 (J) */
  absDrift: number;
  /** 能量范围 [min, max] (J) */
  energyRange: [number, number];
  /** 摆是否已静止（阻尼耗散殆尽） */
  isStopped: boolean;
}

// ───────────────────────────────────────────────
// @contract IEnergyProjector — 能量投影校正
// ───────────────────────────────────────────────

/**
 * 能量投影器——等比缩放角速度使总能量回到目标值（保守系统专用）。
 *
 * 前置: damping === 0（非保守系统不应调用）
 * 后置: state[1] 和 state[3] 被原地缩放
 * 输入约束:
 *   - state: Float64Array(4)
 *   - params: PendulumParams（damping 应为 0）
 *   - targetEnergy: 目标总能量 (J)
 * 输出约束: 返回校正量 (J)，正值表示补充了能量
 * 异常: 无——动能极小时返回 0
 * Side Effects: 原地修改 state[1] 和 state[3]
 */
export interface IEnergyProjector {
  /** 投影角速度使能量回到目标值。返回校正量 */
  project(state: Float64Array, params: { m1: number; m2: number; L1: number; L2: number; g: number }, targetEnergy: number): number;
}
