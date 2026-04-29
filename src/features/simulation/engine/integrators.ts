import type { PendulumParams, IntegratorMethod } from "@/shared/types";
import { odeRhs, angularAcceleration } from "./derivatives";

/**
 * 单步积分，根据 method 选择对应实现。
 * 原地更新 state: Float64Array(4) -> [θ₁, ω₁, θ₂, ω₂]。
 */
export function integratorStep(
  state: Float64Array,
  p: PendulumParams,
  dt: number,
  method: IntegratorMethod,
): void {
  switch (method) {
    case "RK4":
      rk4Step(state, p, dt);
      break;
    case "VelocityVerlet":
      verletStep(state, p, dt);
      break;
    case "Euler":
      eulerStep(state, p, dt);
      break;
    default:
      rk4Step(state, p, dt);
  }
}

// ─── RK4 预分配工作缓冲区（Worker 单线程，复用零分配）────

const _k1 = new Float64Array(4);
const _k2 = new Float64Array(4);
const _k3 = new Float64Array(4);
const _k4 = new Float64Array(4);
const _tmp = new Float64Array(4);

// ─── RK4（四阶 Runge-Kutta，默认积分器）───────────

function rk4Step(state: Float64Array, p: PendulumParams, dt: number): void {
  // k1 = odeRhs(state)
  odeRhs(state, p, _k1);

  // k2 = odeRhs(state + k1 * dt/2)
  addScaledInto(state, _k1, dt / 2, _tmp);
  odeRhs(_tmp, p, _k2);

  // k3 = odeRhs(state + k2 * dt/2)
  addScaledInto(state, _k2, dt / 2, _tmp);
  odeRhs(_tmp, p, _k3);

  // k4 = odeRhs(state + k3 * dt)
  addScaledInto(state, _k3, dt, _tmp);
  odeRhs(_tmp, p, _k4);

  for (let i = 0; i < 4; i++) {
    state[i] = state[i]! + (dt / 6) * (_k1[i]! + 2 * _k2[i]! + 2 * _k3[i]! + _k4[i]!);
  }
}

// ─── Velocity Verlet（实验性积分器）───────────────
//
// 注意：标准 Velocity Verlet 的辛性质要求加速度仅依赖位置 a=a(x)。
// 双摆的角加速度依赖角速度平方项（离心力/科里奥利力）：
//   α = f(θ₁,θ₂, ω₁²,ω₂²)
// 本实现简化为半步速度-全步位置-重算加速度的标准 VV 流程，
// 未处理 a=a(x,v) 的速度依赖，实际退化为精度不明的自定义格式。
//
// 对于生产用途，推荐使用 RK4 作为积分器；Velocity Verlet 保留
// 仅供教育对比和实验性探索。

function verletStep(state: Float64Array, p: PendulumParams, dt: number): void {
  const alpha0 = angularAcceleration(state, p);
  // 半步加速：ω += 0.5·dt·α
  state[1] = state[1]! + 0.5 * dt * alpha0[0]!;
  state[3] = state[3]! + 0.5 * dt * alpha0[1]!;
  // 全步位置：θ += dt·ω
  state[0] = state[0]! + dt * state[1]!;
  state[2] = state[2]! + dt * state[3]!;
  // 重算加速度
  const alpha1 = angularAcceleration(state, p);
  // 半步加速：ω += 0.5·dt·α'
  state[1] = state[1]! + 0.5 * dt * alpha1[0]!;
  state[3] = state[3]! + 0.5 * dt * alpha1[1]!;
}

// ─── Euler（显式欧拉，教育用途）───────────────────

function eulerStep(state: Float64Array, p: PendulumParams, dt: number): void {
  const d = odeRhs(state, p);
  for (let i = 0; i < 4; i++) {
    state[i] = state[i]! + dt * d[i]!;
  }
}

// ─── 辅助 ─────────────────────────────────────

/** base[i] + scaled[i] * factor → out（原地写入，零分配） */
function addScaledInto(
  base: Float64Array,
  scaled: Float64Array,
  factor: number,
  out: Float64Array,
): void {
  for (let i = 0; i < 4; i++) {
    out[i] = base[i]! + scaled[i]! * factor;
  }
}
