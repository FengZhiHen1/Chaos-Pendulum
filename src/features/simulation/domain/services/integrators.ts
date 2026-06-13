import type { PendulumParams, IntegratorMethod } from "@/shared/domain/valueObjects";
import type { IIntegrator, IIntegratorRegistry } from "../../contracts";
import { odeRhs, angularAcceleration } from "./derivatives";

// ─── 注册表 ─────────────────────────────────────

/**
 * 积分器注册表——全局策略分发中心。
 *
 * 实现 IIntegratorRegistry 契约接口。
 * 前置: 所有内置积分器已在模块加载时注册
 * 后置: get() 返回对应 method 的积分器或默认 RKF45
 * 输入约束: method 为 "RKF45" | "VelocityVerlet" | "Euler"
 * 输出约束: 永不返回 undefined（未注册时返回默认 RKF45）
 */
export class IntegratorRegistry implements IIntegratorRegistry {
  private readonly registry = new Map<IntegratorMethod, IIntegrator>();
  private defaultIntegrator: IIntegrator | null = null;

  /** 注册一个积分器策略 */
  register(integrator: IIntegrator): void {
    this.registry.set(integrator.method, integrator);
  }

  /** 获取指定方法的积分器；不存在时返回默认 RKF45 */
  get(method: IntegratorMethod): IIntegrator {
    return this.registry.get(method) ?? this.getDefault();
  }

  /** 获取并缓存默认积分器 */
  private getDefault(): IIntegrator {
    if (!this.defaultIntegrator) {
      const existing = this.registry.get("RKF45");
      if (existing) {
        this.defaultIntegrator = existing;
      } else {
        this.defaultIntegrator = new RKF45Integrator();
        this.registry.set("RKF45", this.defaultIntegrator);
      }
    }
    return this.defaultIntegrator;
  }
}

/** 模块级注册表单例 */
const globalRegistry = new IntegratorRegistry();

/** 注册积分器到全局注册表（向后兼容的函数式 API） */
export function registerIntegrator(integrator: IIntegrator): void {
  globalRegistry.register(integrator);
}

/** 从全局注册表获取积分器（向后兼容的函数式 API） */
export function getIntegrator(method: IntegratorMethod): IIntegrator | undefined {
  return globalRegistry.get(method);
}

// ─── Butcher 表系数 (Fehlberg 4(5) 嵌入对) ───────

const A21 = 1 / 4;
const A31 = 3 / 32;
const A32 = 9 / 32;
const A41 = 1932 / 2197;
const A42 = -7200 / 2197;
const A43 = 7296 / 2197;
const A51 = 439 / 216;
const A52 = -8;
const A53 = 3680 / 513;
const A54 = -845 / 4104;
const A61 = -8 / 27;
const A62 = 2;
const A63 = -3544 / 2565;
const A64 = 1859 / 4104;
const A65 = -11 / 40;

// 5 阶权重 (b5*) —— 用于状态推进
const B51 = 16 / 135;
const B53 = 6656 / 12825;
const B54 = 28561 / 56430;
const B55 = -9 / 50;
const B56 = 2 / 55;

// 4 阶权重 (b4) —— 用于误差估计
const B41 = 25 / 216;
const B43 = 1408 / 2565;
const B44 = 2197 / 4104;
const B45 = -1 / 5;

// ─── RKF45 自适应积分器 ───────────────────────────

const RKF45_DEFAULT_TOL = 1e-7;

/**
 * RKF45 (Runge-Kutta-Fehlberg 4(5)) 自适应步长积分器。
 * 使用 Fehlberg 嵌入对进行误差估计和步长控制。
 *
 * 实现 IIntegrator 契约接口。
 */
export class RKF45Integrator implements IIntegrator {
  readonly method: IntegratorMethod = "RKF45";

  private readonly tol: number;
  private readonly k1 = new Float64Array(4);
  private readonly k2 = new Float64Array(4);
  private readonly k3 = new Float64Array(4);
  private readonly k4 = new Float64Array(4);
  private readonly k5 = new Float64Array(4);
  private readonly k6 = new Float64Array(4);
  private readonly tmp = new Float64Array(4);
  private readonly save = new Float64Array(4);

  constructor(tolerance: number = RKF45_DEFAULT_TOL) {
    this.tol = tolerance;
  }

  step(state: Float64Array, p: PendulumParams, dt: number): void {
    this.adaptive(state, p, dt);
  }

  // ── 自适应步长控制 ──

  private adaptive(state: Float64Array, p: PendulumParams, dt: number): void {
    const dir = dt >= 0 ? 1 : -1;
    let remaining = Math.abs(dt);
    let h = remaining;

    while (remaining > 1e-14) {
      h = Math.min(h, remaining);
      this.save.set(state);

      const err = this.rkf45Substep(state, p, h * dir);

      if (err < this.tol) {
        remaining -= h;
        this.save.set(state);

        const fac = Math.min(5, 0.9 * Math.pow(this.tol / Math.max(err, 1e-15), 0.2));
        h = Math.min(remaining, h * (err < this.tol * 0.01 ? Math.min(fac, 3) : fac));
      } else {
        state.set(this.save);
        const fac = Math.max(0.1, 0.9 * Math.pow(this.tol / Math.max(err, 1e-15), 0.2));
        h = h * fac;
        if (h < 1e-10) {
          state.set(this.save);
          eulerStep(state, p, 1e-10 * dir);
          remaining -= 1e-10;
          if (remaining < 0) remaining = 0;
          break;
        }
      }
    }
  }

  // ── 单步 RKF45（Fehlberg 嵌入 4(5) 对）──

  private rkf45Substep(state: Float64Array, p: PendulumParams, h: number): number {
    const { k1, k2, k3, k4, k5, k6, tmp } = this;

    odeRhs(state, p, k1);

    for (let i = 0; i < 4; i++) tmp[i] = state[i]! + h * A21 * k1[i]!;
    odeRhs(tmp, p, k2);

    for (let i = 0; i < 4; i++) tmp[i] = state[i]! + h * (A31 * k1[i]! + A32 * k2[i]!);
    odeRhs(tmp, p, k3);

    for (let i = 0; i < 4; i++) tmp[i] = state[i]! + h * (A41 * k1[i]! + A42 * k2[i]! + A43 * k3[i]!);
    odeRhs(tmp, p, k4);

    for (let i = 0; i < 4; i++) tmp[i] = state[i]! + h * (A51 * k1[i]! + A52 * k2[i]! + A53 * k3[i]! + A54 * k4[i]!);
    odeRhs(tmp, p, k5);

    for (let i = 0; i < 4; i++) tmp[i] = state[i]! + h * (A61 * k1[i]! + A62 * k2[i]! + A63 * k3[i]! + A64 * k4[i]! + A65 * k5[i]!);
    odeRhs(tmp, p, k6);

    let err = 0;
    for (let i = 0; i < 4; i++) {
      const y4 = state[i]! + h * (B41 * k1[i]! + B43 * k3[i]! + B44 * k4[i]! + B45 * k5[i]!);
      const y5 = state[i]! + h * (B51 * k1[i]! + B53 * k3[i]! + B54 * k4[i]! + B55 * k5[i]! + B56 * k6[i]!);
      const diff = Math.abs(y5 - y4);
      if (diff > err) err = diff;
      state[i] = y5;
    }

    return err;
  }
}

// ─── Velocity Verlet 积分器 ──────────────────────

/**
 * Velocity Verlet 辛积分器——能量守恒优于 RKF45。
 *
 * 实现 IIntegrator 契约接口。
 */
export class VelocityVerletIntegrator implements IIntegrator {
  readonly method: IntegratorMethod = "VelocityVerlet";

  private readonly alphaBuf0 = new Float64Array(2);
  private readonly alphaBuf1 = new Float64Array(2);

  step(state: Float64Array, p: PendulumParams, dt: number): void {
    const alpha0 = angularAcceleration(state, p, this.alphaBuf0);
    state[1] = state[1]! + 0.5 * dt * alpha0[0]!;
    state[3] = state[3]! + 0.5 * dt * alpha0[1]!;
    state[0] = state[0]! + dt * state[1]!;
    state[2] = state[2]! + dt * state[3]!;
    const alpha1 = angularAcceleration(state, p, this.alphaBuf1);
    state[1] = state[1]! + 0.5 * dt * alpha1[0]!;
    state[3] = state[3]! + 0.5 * dt * alpha1[1]!;
  }
}

// ─── Euler（显式欧拉，教育用途）───────────────────

/**
 * 显式欧拉法积分器——仅用于教学演示，精度最低。
 *
 * 实现 IIntegrator 契约接口。
 */
export class EulerIntegrator implements IIntegrator {
  readonly method: IntegratorMethod = "Euler";

  private readonly tmp = new Float64Array(4);

  step(state: Float64Array, p: PendulumParams, dt: number): void {
    odeRhs(state, p, this.tmp);
    for (let i = 0; i < 4; i++) {
      state[i] = state[i]! + dt * this.tmp[i]!;
    }
  }
}

// ─── 内置积分器注册 ──────────────────────────────

registerIntegrator(new RKF45Integrator());
registerIntegrator(new VelocityVerletIntegrator());
registerIntegrator(new EulerIntegrator());

// ─── 公开入口 ───────────────────────────────────

/**
 * 单步积分，根据 method 选择对应实现。
 * 原地更新 state: Float64Array(4) -> [θ₁, ω₁, θ₂, ω₂]。
 *
 * 向后兼容的函数式 API，内部委托给 IntegratorRegistry。
 */
export function integratorStep(
  state: Float64Array,
  p: PendulumParams,
  dt: number,
  method: IntegratorMethod,
): void {
  const integrator = globalRegistry.get(method);
  integrator.step(state, p, dt);
}

// ─── 底层 Euler 步进（供 RKF45 步长坍缩回退）─────

function eulerStep(state: Float64Array, p: PendulumParams, dt: number): void {
  const tmp = new Float64Array(4);
  odeRhs(state, p, tmp);
  for (let i = 0; i < 4; i++) {
    state[i] = state[i]! + dt * tmp[i]!;
  }
}
