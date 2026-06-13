/**
 * 模块: simulation.contracts.physics-engine
 * 职责: 定义双摆 ODE 数值积分引擎的契约边界——积分器策略接口、注册表、解算器模板方法。
 *       这是系统最底层的计算核心，所有其他模块（能量监控、相空间、3D场景）均依赖此契约。
 * 数据来源:
 *   - PendulumParams (shared/domain/valueObjects): MUST — 物理参数是积分的必要输入，不可绕过的强依赖
 *   - odeRhs (domain/services/derivatives): MUST — ODE 右端函数是积分器的数学核心，必须由本模块提供
 * 边界:
 *   - 依赖: src/shared/domain/valueObjects (PendulumParams, IntegratorMethod)
 *   - 被依赖: energy-monitor.contract, phase-space.contract, worker-gateway.contract
 * 禁止行为:
 *   - 禁止在积分器中直接访问 Worker API 或任何浏览器 API（纯计算，零副作用）
 *   - 禁止积分器管理时间推进循环——那是 simulation-scheduler 的职责
 *   - 禁止在积分器中包含参数校验逻辑——由调用方在传入前完成
 *   - 禁止积分器方法返回值包含堆分配（step 必须原地修改 state，零 GC 压力）
 */

import type { PendulumParams, IntegratorMethod } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract IIntegrator — 积分器策略接口
// ───────────────────────────────────────────────

/**
 * ODE 积分器策略接口。
 *
 * 三种具体策略（RKF45、VelocityVerlet、Euler）各自实现此接口。
 * writeFrame / readFrame 布局见 shared/domain/valueObjects/simulation.ts:FrameField。
 *
 * 前置: state 已通过 hasInvalidValue 检查；params 已通过 PhysicsParams 校验
 * 后置: state 被原地更新为 dt 后的新状态；不分配堆内存（复用内部预分配缓冲区）
 * 输入约束:
 *   - state: Float64Array(4) = [θ₁, ω₁, θ₂, ω₂]，角度已归一化到 [-π, π)
 *   - params: 六个字段均通过硬约束校验（m1>0, m2>0, L1>0, L2>0, g>=0, damping>=0）
 *   - dt: 非零有限值，正数表示正向积分，负数表示反向积分
 * 输出约束: state 原地修改，不返回新对象
 * 异常: 无（NaN/Infinity 由调用方的 hasInvalidValue 在循环中检测）
 * Side Effects: 无——纯计算，不写日志，不操作 DOM，不发送消息
 */
export interface IIntegrator {
  /** 积分方法标识（不可变） */
  readonly method: IntegratorMethod;

  /**
   * 执行单步积分，原地更新 state。
   *
   * 前置: state[4] 已通过 hasInvalidValue；dt 非零有限；params 已校验
   * 后置: state[4] = 新状态向量，角度可能需要归一化（由调用方决定）
   * 输入约束: 见接口级文档
   * 输出约束: state 原地修改，零堆分配
   * 异常: 不抛异常（数值问题通过 hasInvalidValue 在外部检测）
   * Side Effects: 无
   */
  step(state: Float64Array, p: PendulumParams, dt: number): void;
}

// ───────────────────────────────────────────────
// @contract IntegratorRegistry — 积分器注册表
// ───────────────────────────────────────────────

/**
 * 积分器注册表——全局策略分发中心。
 *
 * 前置: 所有内置积分器已在模块加载时注册
 * 后置: get() 返回对应 method 的积分器或默认 RKF45
 * 输入约束: method 为 "RKF45" | "VelocityVerlet" | "Euler"
 * 输出约束: 永不返回 undefined（未注册时返回默认 RKF45）
 * 异常: 无
 * Side Effects: 无——读写内部 Map，不涉及 I/O
 */
export interface IIntegratorRegistry {
  /** 注册一个积分器策略 */
  register(integrator: IIntegrator): void;

  /** 获取指定方法的积分器；不存在时返回默认 RKF45 */
  get(method: IntegratorMethod): IIntegrator;
}

// ───────────────────────────────────────────────
// @contract IOdeSolver — ODE 解算器模板方法（ABC）
// ───────────────────────────────────────────────

/**
 * ODE 解算器抽象基类——定义积分流程的模板方法。
 *
 * 模板方法 solve() 的执行流程:
 *   1. 前置校验 (validateInputs) → 不通过则抛 SimulationError
 *   2. 调用钩子 _do_integrate() → 实现者填写具体积分逻辑
 *   3. 后置校验 (validateOutputs) → NaN/Infinity 检测
 *   4. 角度归一化
 *
 * 实现者（contract-implementer）只需填写 _do_integrate 钩子。
 * 不需要关心参数校验和 NaN 检测——solve() 已处理。
 */
export abstract class IOdeSolver {
  protected readonly registry: IIntegratorRegistry;

  constructor(registry: IIntegratorRegistry) {
    this.registry = registry;
  }

  /**
   * 执行批量积分（模板方法，不可覆写）。
   *
   * 前置: state[4] 非 NaN/Infinity；params 已校验
   * 后置: state 被原地更新；返回实际积分的帧数
   * 输入约束:
   *   - state: Float64Array(4) 初始状态
   *   - params: 物理参数
   *   - method: 积分方法
   *   - dt: 单步步长
   *   - frames: 要积分的帧数
   *   - buffer: 输出缓冲区 Float64Array(frames * FRAME_STRIDE)
   *   - direction: 积分方向 (1 正向, -1 反向)
   * 输出约束: 返回实际写入的帧数；buffer 中包含完整的帧数据
   * 异常:
   *   - InvalidStateError: state 包含 NaN/Infinity
   *   - DivergenceError: 积分过程中数值发散
   * Side Effects: 修改 buffer 内容（输出）；可能更新 state 的最后状态
   */
  solve(
    state: Float64Array,
    params: PendulumParams,
    method: IntegratorMethod,
    dt: number,
    frames: number,
    buffer: Float64Array,
    direction: 1 | -1,
  ): number {
    // 前置校验
    this.validateInputs(state, params, method, dt);
    // → 钩子
    const count = this._do_integrate(state, params, method, dt, frames, buffer, direction);
    // 后置校验
    this.validateOutputs(state, buffer, count);
    return count;
  }

  /**
   * 前置校验——在积分开始前检查输入合法性。
   *
   * 前置: 无
   * 后置: 通过时保证输入合法；不通过时抛异常
   * 输入约束: 见 solve() 文档
   * 异常: InvalidStateError — 状态包含 NaN/Infinity 或参数非法
   * Side Effects: 无
   */
  protected validateInputs(
    _state: Float64Array,
    _params: PendulumParams,
    _method: IntegratorMethod,
    _dt: number,
  ): void {
    // 契约骨架——实现由 contract-implementer 填写。基线校验至少检查 state 非 NaN/Infinity。
  }

  /**
   * 执行批量积分（抽象钩子——实现者在此填写积分循环）。
   *
   * 实现者不需要关心:
   *   - 输入校验（validateInputs 已处理）
   *   - 输出校验（validateOutputs 已处理）
   *   - 角度归一化（solve() 已处理）
   *
   * 输入约束:
   *   - 所有参数已通过前置校验
   *   - state / buffer 均为有效的 Float64Array
   * 输出约束: 返回实际写入的帧数（≤ frames）；buffer 中的帧数据完整
   * 异常: DivergenceError — 数值发散
   * Side Effects: 修改 state 和 buffer 内容
   */
  protected abstract _do_integrate(
    state: Float64Array,
    params: PendulumParams,
    method: IntegratorMethod,
    dt: number,
    frames: number,
    buffer: Float64Array,
    direction: 1 | -1,
  ): number;

  /**
   * 后置校验——积分完成后检查输出合法性。
   *
   * 前置: _do_integrate 已完成
   * 后置: 通过时保证输出无 NaN/Infinity
   * 异常: DivergenceError — 输出包含 NaN 或 Infinity
   * Side Effects: 无
   */
  protected validateOutputs(
    _state: Float64Array,
    _buffer: Float64Array,
    _frameCount: number,
  ): void {
    // 契约骨架——实现由 contract-implementer 填写。基线校验至少检查 buffer 中无 NaN。
  }
}

// ───────────────────────────────────────────────
// @contract IDerivativesProvider — ODE 右端函数
// ───────────────────────────────────────────────

/**
 * ODE 右端函数契约——计算双摆拉格朗日方程（含线性阻尼）。
 *
 * 前置: state[4] 和 params 均为有效值
 * 后置: 返回导数 [ω₁, α₁ - b·ω₁, ω₂, α₂ - b·ω₂]
 * 输入约束:
 *   - state: Float64Array(4) = [θ₁, ω₁, θ₂, ω₂]
 *   - params: 通过校验的 PendulumParams
 *   - out: 可选输出缓冲区 Float64Array(4)，提供时避免堆分配
 * 输出约束: 返回四元素 Float64Array（out 参数或新分配）
 * 异常: 无——数值稳定性通过 DENOM_EPSILON 保证
 * Side Effects: 无——纯数学函数
 */
export type OdeRhsFunction = (
  state: Float64Array,
  p: PendulumParams,
  out?: Float64Array,
) => Float64Array;
