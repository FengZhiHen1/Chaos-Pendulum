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

/**
 * 从积分后的状态计算笛卡尔坐标与能量。
 * state: Float64Array(4) = [θ₁, ω₁, θ₂, ω₂]
 */
export function computeDerived(
  state: Float64Array,
  p: PendulumParams,
): DerivedValues {
  const t1 = state[0]!;
  const w1 = state[1]!;
  const t2 = state[2]!;
  const w2 = state[3]!;
  const { L1, L2, m1, m2, g } = p;

  // 笛卡尔坐标
  const x1 = L1 * Math.sin(t1);
  const y1 = -L1 * Math.cos(t1);
  const x2 = x1 + L2 * Math.sin(t2);
  const y2 = y1 - L2 * Math.cos(t2);

  // 线速度
  const v1x = L1 * w1 * Math.cos(t1);
  const v1y = L1 * w1 * Math.sin(t1);
  const v2x = v1x + L2 * w2 * Math.cos(t2);
  const v2y = v1y + L2 * w2 * Math.sin(t2);

  // 能量
  const K = 0.5 * m1 * (v1x * v1x + v1y * v1y) + 0.5 * m2 * (v2x * v2x + v2y * v2y);
  const V = m1 * g * y1 + m2 * g * y2;

  // 角加速度（用于受力分析）
  const a = angularAcceleration(state, p);

  return {
    x1,
    y1,
    x2,
    y2,
    kineticEnergy: K,
    potentialEnergy: V,
    totalEnergy: K + V,
    alpha1: a[0]!,
    alpha2: a[1]!,
  };
}

/** 角度归一化到 [-π, π] */
export function normalizeAngle(angle: number): number {
  return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

/** 检查状态是否包含 NaN 或 Infinity */
export function hasInvalidValue(state: Float64Array): boolean {
  for (let i = 0; i < state.length; i++) {
    if (isNaN(state[i]!) || !isFinite(state[i]!)) return true;
  }
  return false;
}
