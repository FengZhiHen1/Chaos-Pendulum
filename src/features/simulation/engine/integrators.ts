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

// ─── RK4（四阶 Runge-Kutta，默认积分器）───────────

function rk4Step(state: Float64Array, p: PendulumParams, dt: number): void {
  const k1 = odeRhs(state, p);
  const k2 = odeRhs(addScaled(state, k1, dt / 2), p);
  const k3 = odeRhs(addScaled(state, k2, dt / 2), p);
  const k4 = odeRhs(addScaled(state, k3, dt), p);

  for (let i = 0; i < 4; i++) {
    state[i] = state[i]! + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }
}

// ─── Velocity Verlet（辛积分器）───────────────────

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

/** 返回新 Float64Array：base[i] + scaled[i] * factor */
function addScaled(
  base: Float64Array,
  scaled: Float64Array,
  factor: number,
): Float64Array {
  const out = new Float64Array(4);
  for (let i = 0; i < 4; i++) {
    out[i] = base[i]! + scaled[i]! * factor;
  }
  return out;
}
