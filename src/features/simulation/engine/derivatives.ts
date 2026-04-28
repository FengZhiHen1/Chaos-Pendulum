import type { PendulumParams } from "@/shared/types";

/**
 * ODE 右端函数：计算双摆拉格朗日方程（含线性阻尼）。
 * 输入 state: [θ₁, ω₁, θ₂, ω₂]，返回导数: [ω₁, α₁, ω₂, α₂]。
 */
export function odeRhs(state: Float64Array, p: PendulumParams): Float64Array {
  const t1 = state[0]!;
  const w1 = state[1]!;
  const t2 = state[2]!;
  const w2 = state[3]!;
  const { m1, m2, L1, L2, g, damping: b } = p;

  const delta = t2 - t1;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);

  // 标准拉格朗日推导：denom = m1 + m2 - m2·cos²(delta)
  const denom = m1 + m2 - m2 * cosD * cosD;
  // 防止分母过小：保留符号
  const safeDenom = Math.abs(denom) < 1e-12 ? Math.sign(denom) * 1e-12 : denom;

  // 角加速度（无阻尼部分）
  const alpha1 =
    (m2 * L1 * w1 * w1 * sinD * cosD +
      m2 * g * Math.sin(t2) * cosD +
      m2 * L2 * w2 * w2 * sinD -
      (m1 + m2) * g * Math.sin(t1)) /
    (L1 * safeDenom);

  const alpha2 =
    (-m2 * L2 * w2 * w2 * sinD * cosD +
      (m1 + m2) *
        (g * Math.sin(t1) * cosD - L1 * w1 * w1 * sinD - g * Math.sin(t2))) /
    (L2 * safeDenom);

  // 返回 [ω₁, α₁ - b·ω₁, ω₂, α₂ - b·ω₂]
  return new Float64Array([w1, alpha1 - b * w1, w2, alpha2 - b * w2]);
}

/**
 * 仅返回角加速度 [α₁, α₂]（无阻尼），供 Velocity Verlet 使用。
 */
export function angularAcceleration(
  state: Float64Array,
  p: PendulumParams,
): Float64Array {
  const rhs = odeRhs(state, { ...p, damping: 0 });
  return new Float64Array([rhs[1]!, rhs[3]!]);
}
