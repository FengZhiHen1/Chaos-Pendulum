import type { PendulumParams } from "@/shared/types";
import { angularAcceleration } from "./derivatives";

/** 计算后的派生值 */
export interface DerivedValues {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  alpha1: number;
  alpha2: number;
}

// ─── 能量计算（computeDerived 与 projectEnergy 共享）──

interface EnergyComponents {
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
}

function computeEnergies(state: Float64Array, p: PendulumParams): EnergyComponents {
  const t1 = state[0]!, w1 = state[1]!;
  const t2 = state[2]!, w2 = state[3]!;
  const { L1, L2, m1, m2, g } = p;

  const y1 = -L1 * Math.cos(t1);
  const y2 = y1 - L2 * Math.cos(t2);
  const V = m1 * g * y1 + m2 * g * y2;

  const v1x = L1 * w1 * Math.cos(t1);
  const v1y = L1 * w1 * Math.sin(t1);
  const v2x = v1x + L2 * w2 * Math.cos(t2);
  const v2y = v1y + L2 * w2 * Math.sin(t2);
  const K = 0.5 * m1 * (v1x * v1x + v1y * v1y) + 0.5 * m2 * (v2x * v2x + v2y * v2y);

  return { kineticEnergy: K, potentialEnergy: V, totalEnergy: K + V };
}

// ─── 派生量计算 ──────────────────────────────────

/**
 * 从积分后的状态计算笛卡尔坐标与能量。
 * state: Float64Array(4) = [θ₁, ω₁, θ₂, ω₂]
 */
export function computeDerived(
  state: Float64Array,
  p: PendulumParams,
): DerivedValues {
  const t1 = state[0]!;
  const t2 = state[2]!;
  const { L1, L2 } = p;

  // 笛卡尔坐标
  const x1 = L1 * Math.sin(t1);
  const y1 = -L1 * Math.cos(t1);
  const x2 = x1 + L2 * Math.sin(t2);
  const y2 = y1 - L2 * Math.cos(t2);

  // 能量
  const { kineticEnergy, potentialEnergy, totalEnergy } = computeEnergies(state, p);

  // 角加速度（用于受力分析）
  const a = angularAcceleration(state, p);

  return { x1, y1, x2, y2, kineticEnergy, potentialEnergy, totalEnergy, alpha1: a[0]!, alpha2: a[1]! };
}

/** 角度归一化到 [-π, π) */
export function normalizeAngle(angle: number): number {
  const twoPi = 2 * Math.PI;
  const shifted = angle + Math.PI;
  const wrapped = shifted - Math.floor(shifted / twoPi) * twoPi;
  return wrapped - Math.PI;
}

/** 计算下摆球 3D 坐标（EXP-01 和 EXP-02 共享使用） */
export function ball2Position(
  state: { theta1: number; theta2: number },
  params: { L1: number; L2: number },
): { x: number; y: number; z: number } {
  const ball1X = params.L1 * Math.sin(state.theta1);
  const ball1Y = -params.L1 * Math.cos(state.theta1);
  return {
    x: ball1X + params.L2 * Math.sin(state.theta2),
    y: ball1Y - params.L2 * Math.cos(state.theta2),
    z: 0,
  };
}

/**
 * 能量投影：等比缩放角速度使总能量回到目标值。
 * 仅适用于保守系统 (damping=0)。原地修改 state[1] 和 state[3]。
 * @returns 校正量 (J) — 正值表示补充了能量，负值表示移除了能量
 */
export function projectEnergy(
  state: Float64Array,
  p: PendulumParams,
  targetEnergy: number,
): number {
  const w1 = state[1]!, w2 = state[3]!;
  const { potentialEnergy: V, kineticEnergy: K } = computeEnergies(state, p);

  const Ktarget = targetEnergy - V;
  if (K < 1e-14 || Ktarget < 1e-14) return 0;

  const scale = Math.sqrt(Ktarget / K);
  state[1] = w1 * scale;
  state[3] = w2 * scale;
  return Ktarget - K;
}

/** 检查状态是否包含 NaN 或 Infinity */
export function hasInvalidValue(state: Float64Array): boolean {
  for (let i = 0; i < state.length; i++) {
    if (isNaN(state[i]!) || !isFinite(state[i]!)) return true;
  }
  return false;
}
