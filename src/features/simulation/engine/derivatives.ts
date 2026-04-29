import type { PendulumParams } from "@/shared/types";

/**
 * 分母近零保护阈值。
 * 取值依据：双摆 denom = m₁+m₂ - m₂cos²(δ)，在 m₁,m₂ ∈ [0.01, 10] kg 范围内，
 * denom 最小值出现在 m₁→0.01,m₂→10,δ=0 时 ≈ 0.01。1e-12 远小于此量级，
 * 仅在浮点精度边界（如 m₁,m₂ 极端不成比例或 δ 接近 π/2 时 cos²→0）触发。
 */
const DENOM_EPSILON = 1e-12;

/**
 * ODE 右端函数：计算双摆拉格朗日方程（含线性阻尼）。
 * 输入 state: [θ₁, ω₁, θ₂, ω₂]，返回导数: [ω₁, α₁, ω₂, α₂]。
 */
export function odeRhs(state: Float64Array, p: PendulumParams, out?: Float64Array): Float64Array {
  const w1 = state[1]!;
  const w2 = state[3]!;
  const b = p.damping;

  const { alpha1, alpha2 } = computeAlphas(state, p);

  // 返回 [ω₁, α₁ - b·ω₁, ω₂, α₂ - b·ω₂]
  const result = out ?? new Float64Array(4);
  result[0] = w1;
  result[1] = alpha1 - b * w1;
  result[2] = w2;
  result[3] = alpha2 - b * w2;
  return result;
}

/**
 * 双摆角加速度核心公式 [α₁, α₂]（无阻尼）。
 * odeRhs 和 angularAcceleration 均调用此函数，避免冗余 ODE 展开。
 */
export function computeAlphas(
  state: Float64Array,
  p: PendulumParams,
): { alpha1: number; alpha2: number } {
  const t1 = state[0]!;
  const w1 = state[1]!;
  const t2 = state[2]!;
  const w2 = state[3]!;
  const { m1, m2, L1, L2, g } = p;

  const delta = t2 - t1;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);

  const denom = m1 + m2 - m2 * cosD * cosD;
  const safeDenom = Math.abs(denom) < DENOM_EPSILON
    ? (Math.sign(denom) || 1) * DENOM_EPSILON
    : denom;

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

  return { alpha1, alpha2 };
}

/**
 * 仅返回角加速度 [α₁, α₂]（无阻尼），供 Velocity Verlet / LAB-01 力计算使用。
 * 提供可选 out 参数避免堆分配。
 */
export function angularAcceleration(
  state: Float64Array,
  p: PendulumParams,
  out?: Float64Array,
): Float64Array {
  const a = computeAlphas(state, p);
  const result = out ?? new Float64Array(2);
  result[0] = a.alpha1;
  result[1] = a.alpha2;
  return result;
}
