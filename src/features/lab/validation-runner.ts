import { integratorStep } from "@/features/simulation/domain/services/integrators";
import type { PendulumParams, IntegratorMethod } from "@/shared/domain/valueObjects";

// ─── 类型 ─────────────────────────────────────────

export type ValidationTestKey = "smallAngle" | "singlePendulum" | "energy";

export interface ValidationResult {
  test: ValidationTestKey;
  passed: boolean;
  label: string;
  value: number;
  threshold: number;
  unit: string;
  detail: string;
}

// ─── 工具函数 ──────────────────────────────────────

const DT = 1 / 60;
const DEFAULT_PARAMS: PendulumParams = {
  m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0,
};

function totalEnergy(state: Float64Array, p: PendulumParams): number {
  const t1 = state[0]!, w1 = state[1]!, t2 = state[2]!, w2 = state[3]!;
  const v1y = -p.L1 * Math.cos(t1);
  const v2y = v1y - p.L2 * Math.cos(t2);
  const pe = p.m1 * p.g * v1y + p.m2 * p.g * v2y;
  const x1dot = p.L1 * w1 * Math.cos(t1);
  const y1dot = p.L1 * w1 * Math.sin(t1);
  const x2dot = x1dot + p.L2 * w2 * Math.cos(t2);
  const y2dot = y1dot + p.L2 * w2 * Math.sin(t2);
  const ke =
    0.5 * p.m1 * (x1dot * x1dot + y1dot * y1dot) +
    0.5 * p.m2 * (x2dot * x2dot + y2dot * y2dot);
  return ke + pe;
}

/** 检测过零点：从正到负或从负到正 */
function detectZeroCrossings(
  history: number[],
): number[] {
  const crossings: number[] = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i - 1]! * history[i]! < 0) {
      const frac = history[i - 1]! / (history[i - 1]! - history[i]!);
      crossings.push((i - 1 + frac) * DT);
    }
  }
  return crossings;
}

/** 从过零点序列计算平均周期 */
function averagePeriod(crossings: number[]): number {
  if (crossings.length < 3) return NaN;
  const periods: number[] = [];
  for (let i = 2; i < crossings.length; i += 2) {
    periods.push(crossings[i]! - crossings[i - 2]!);
  }
  return periods.reduce((a, b) => a + b, 0) / periods.length;
}

// ─── 验证 1：小角度近似 ──────────────────────────────

function runSmallAngleTest(method: IntegratorMethod): {
  passed: boolean;
  value: number;
  detail: string;
} {
  const theta0 = (5 * Math.PI) / 180; // 5°
  const p = { ...DEFAULT_PARAMS, L1: 1.0 };
  const state = new Float64Array([theta0, 0, theta0, 0]);

  const linearPeriod = 2 * Math.PI * Math.sqrt(p.L1 / p.g);

  // 仿真约 20 个周期
  const simDuration = linearPeriod * 25;
  const steps = Math.ceil(simDuration / DT);

  const thetaHistory: number[] = [];
  for (let i = 0; i < steps; i++) {
    thetaHistory.push(state[0]!);
    integratorStep(state, p, DT, method);
  }

  const crossings = detectZeroCrossings(thetaHistory.map((t) => t - theta0));
  const measuredPeriod = averagePeriod(crossings);

  if (isNaN(measuredPeriod)) {
    return { passed: false, value: NaN, detail: "未能检测到足够过零点" };
  }

  const error = Math.abs(measuredPeriod - linearPeriod) / linearPeriod;
  const threshold = 0.02;

  return {
    passed: error < threshold,
    value: error,
    detail: `线性周期 ${linearPeriod.toFixed(4)}s，实测 ${measuredPeriod.toFixed(4)}s，相对误差 ${(error * 100).toFixed(3)}%`,
  };
}

// ─── 验证 2：单摆退化 ─────────────────────────────────

function runSinglePendulumTest(method: IntegratorMethod): {
  passed: boolean;
  value: number;
  detail: string;
} {
  const p: PendulumParams = { ...DEFAULT_PARAMS, m2: 0, L1: 1.0 };
  const theta0 = Math.PI / 4; // 45°
  const state = new Float64Array([theta0, 0, 0, 0]);

  const expectedPeriod = 2 * Math.PI * Math.sqrt(p.L1 / p.g);

  // 仿真约 15 个周期
  const simDuration = expectedPeriod * 20;
  const steps = Math.ceil(simDuration / DT);

  const theta1History: number[] = [];
  for (let i = 0; i < steps; i++) {
    theta1History.push(state[0]!);
    integratorStep(state, p, DT, method);
    // m₂ = 0 时 θ₂ 不应发散
    if (!isFinite(state[2]!) || Math.abs(state[2]!) > 100) {
      return { passed: false, value: NaN, detail: "θ₂ 发散 — 单摆退化失败" };
    }
  }

  const crossings = detectZeroCrossings(theta1History.map((t) => t - theta0));
  const measuredPeriod = averagePeriod(crossings);

  if (isNaN(measuredPeriod)) {
    return { passed: false, value: NaN, detail: "未能检测到足够过零点" };
  }

  const error = Math.abs(measuredPeriod - expectedPeriod) / expectedPeriod;
  const threshold = 0.02;

  return {
    passed: error < threshold,
    value: error,
    detail: `期望周期 ${expectedPeriod.toFixed(4)}s，实测 ${measuredPeriod.toFixed(4)}s，相对误差 ${(error * 100).toFixed(3)}%`,
  };
}

// ─── 验证 3：能量漂移 ─────────────────────────────────

function runEnergyTest(method: IntegratorMethod): {
  passed: boolean;
  value: number;
  detail: string;
} {
  const p: PendulumParams = { ...DEFAULT_PARAMS, damping: 0 };
  const theta0 = 1.5;
  const state = new Float64Array([theta0, 0, theta0 + 0.5, 0]);

  const e0 = totalEnergy(state, p);
  if (Math.abs(e0) < 1e-10) {
    return { passed: false, value: NaN, detail: "初始能量为零，无法评估漂移" };
  }

  const simDuration = 100; // 100s（约 6000 步）
  const steps = Math.ceil(simDuration / DT);
  let maxDrift = 0;

  for (let i = 0; i < steps; i++) {
    integratorStep(state, p, DT, method);
    if (i % 10 === 0) {
      // 每 10 步采样一次以降低开销
      const e = totalEnergy(state, p);
      const drift = Math.abs(e - e0) / Math.abs(e0);
      if (drift > maxDrift) maxDrift = drift;
    }
  }

  const threshold = 0.005; // 0.5%

  return {
    passed: maxDrift < threshold,
    value: maxDrift,
    detail: `初始能量 ${e0.toFixed(4)}J，最大相对漂移 ${(maxDrift * 100).toFixed(4)}%（${steps} 步，${simDuration}s）`,
  };
}

// ─── 公开入口 ──────────────────────────────────────

export function runAllValidations(
  method: IntegratorMethod = "RKF45",
  onProgress?: (test: ValidationTestKey, result: ValidationResult) => void,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 小角度
  const r1 = runSmallAngleTest(method);
  const result1: ValidationResult = {
    test: "smallAngle",
    passed: r1.passed,
    label: "小角度近似 (<2%)",
    value: r1.value,
    threshold: 0.02,
    unit: "%",
    detail: r1.detail,
  };
  results.push(result1);
  onProgress?.("smallAngle", result1);

  // 单摆退化
  const r2 = runSinglePendulumTest(method);
  const result2: ValidationResult = {
    test: "singlePendulum",
    passed: r2.passed,
    label: "单摆退化",
    value: r2.value,
    threshold: 0.02,
    unit: "%",
    detail: r2.detail,
  };
  results.push(result2);
  onProgress?.("singlePendulum", result2);

  // 能量漂移
  const r3 = runEnergyTest(method);
  const result3: ValidationResult = {
    test: "energy",
    passed: r3.passed,
    label: "能量漂移 (<0.5%)",
    value: r3.value,
    threshold: 0.005,
    unit: "%",
    detail: r3.detail,
  };
  results.push(result3);
  onProgress?.("energy", result3);

  return results;
}
