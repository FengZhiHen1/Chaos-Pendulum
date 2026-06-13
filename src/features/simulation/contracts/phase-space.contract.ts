/**
 * 模块: simulation.contracts.phase-space
 * 职责: 定义相空间可视化的契约边界——轨迹收集器、变量切换、数据点类型。
 *       SIM-05 的核心职责：在 2D 相平面中实时绘制系统状态轨迹。
 * 数据来源:
 *   - SimulationFrame (types.contract): MUST — 每帧的状态数据由此类型承载
 *   - StateVector (shared/domain/valueObjects): MUST — θ, ω 的来源
 * 边界:
 *   - 依赖: types.contract (PhaseSpacePoint, PhaseVariable)
 *   - 被依赖: view/components/PhaseSpaceCanvas, view/components/PhaseSpacePanel
 * 禁止行为:
 *   - 禁止在收集器中直接操作 Canvas DOM——那是 View 层职责
 *   - 禁止收集器访问 Worker API——它只消费帧数据
 *   - 禁止硬编码轨迹缓存容量——由 usePhaseSpace hook 注入配置
 */

// ───────────────────────────────────────────────
// @contract PhaseVariable — 相空间变量选择
// ───────────────────────────────────────────────

/**
 * 相空间变量选择——在 θ₁-θ̇₁ 和 θ₂-θ̇₂ 之间切换。
 *
 * 前置: 无
 * 后置: 用于决定从 FrameData 中提取哪个状态对
 * 输入约束: "theta1" | "theta2"
 * 输出约束: 字符串字面量，非运行时枚举
 * 异常: 无
 * Side Effects: 无
 */
export type PhaseVariable = "theta1" | "theta2";

// ───────────────────────────────────────────────
// @contract PhaseSpacePoint — 相空间数据点
// ───────────────────────────────────────────────

/**
 * 相空间中的单个数据点。
 *
 * 前置: theta 已归一化到 [-π, π)；thetaDot 为有限值
 * 后置: 用于绘制相空间轨迹
 * 输入约束:
 *   - theta: 归一化角度 (rad)，范围 [-π, π)
 *   - thetaDot: 角速度 (rad/s)，应为有限值
 * 输出约束: 两个字段均为有限值
 * 异常: 无
 * Side Effects: 无
 */
export interface PhaseSpacePoint {
  /** 归一化角度 (rad) */
  theta: number;
  /** 角速度 (rad/s) */
  thetaDot: number;
}

// ───────────────────────────────────────────────
// @contract IPhaseSpaceCollector — 相空间轨迹收集器
// ───────────────────────────────────────────────

/**
 * 相空间轨迹收集器——管理 θ-θ̇ 轨迹数据的采集与缓存。
 *
 * 前置: 仿真正在运行（isRunning === true）
 * 后置: 轨迹缓存包含当前帧的状态点
 * 输入约束:
 *   - variable: 当前活跃的相变量（theta1 或 theta2）
 *   - theta: 从 SimulationFrame 提取的当前角度（rad）
 *   - thetaDot: 从 SimulationFrame 提取的当前角速度（rad/s）
 *   - maxPoints: 轨迹缓存最大容量
 * 输出约束:
 *   - 返回的轨迹点数组长度 ≤ maxPoints
 *   - 所有 theta 值已归一化到 [-π, π)
 * 异常: 无——无效数据静默跳过
 * Side Effects: 修改内部轨迹缓存（追加新点，超出容量时 FIFO 移除旧点）
 */
export interface IPhaseSpaceCollector {
  /** 追加一个相空间数据点 */
  appendPoint(variable: PhaseVariable, theta: number, thetaDot: number, maxPoints: number): void;

  /** 获取指定变量的完整轨迹 */
  getTrajectory(variable: PhaseVariable): readonly PhaseSpacePoint[];

  /** 清空所有轨迹缓存 */
  clearAll(): void;

  /** 对指定变量的轨迹执行降采样（当轨迹接近容量上限时） */
  decimate(variable: PhaseVariable, factor: number): void;
}

// ───────────────────────────────────────────────
// @contract IPhaseSpaceYDomain — Y 轴自适应算法
// ───────────────────────────────────────────────

/**
 * Y 轴自适应范围管理器——根据轨迹数据动态调整 θ̇ 轴的显示范围。
 *
 * 使用 EMA 平滑 + 显著收缩跳变策略，避免 Y 轴频繁抖动。
 *
 * 前置: trajectory 非空
 * 后置: 返回 [lo, hi] 范围，满足 hi - lo ≥ MIN_Y_RANGE
 * 输入约束:
 *   - trajectory: 当前轨迹点数组
 *   - currentDomain: 当前 Y 轴范围 [lo, hi]
 *   - emaSmooth: EMA 平滑系数（默认 0.2）
 *   - shrinkThreshold: 收缩超过此比例直接跳变（默认 0.7）
 *   - minRange: Y 轴最小范围（默认 2.0 rad/s）
 * 输出约束: 返回 [lo, hi] 满足 hi - lo ≥ minRange
 * 异常: 无
 * Side Effects: 无——纯计算
 */
export interface IPhaseSpaceYDomain {
  /** 根据轨迹更新 Y 轴范围 */
  updateDomain(
    trajectory: readonly PhaseSpacePoint[],
    currentDomain: [number, number],
    emaSmooth: number,
    shrinkThreshold: number,
    minRange: number,
  ): [number, number];
}
