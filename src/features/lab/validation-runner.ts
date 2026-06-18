import type { WorkerValidationResultResponse, PendulumParams, InitialConditions } from "@/shared/domain/valueObjects";
import { getScheduler } from "@/features/simulation/infrastructure/worker/scheduler-factory";

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

// ─── 验证场景参数 ──────────────────────────────────

const VALIDATION_DT = 1 / 60;

interface ValidationScenario {
  id: ValidationTestKey;
  params: PendulumParams;
  ic: InitialConditions;
  simDuration: number;
}

const SCENARIOS: ValidationScenario[] = [
  {
    id: "smallAngle",
    params: { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 },
    ic: {
      theta1: (5 * Math.PI) / 180,   // 5°
      theta1Dot: 0,
      theta2: (5 * Math.PI) / 180,   // 5°
      theta2Dot: 0,
    },
    simDuration: 10,
  },
  {
    id: "singlePendulum",
    params: { m1: 1.0, m2: 1e-6, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 },
    ic: {
      theta1: Math.PI / 4,           // 45°
      theta1Dot: 0,
      theta2: 0,
      theta2Dot: 0,
    },
    simDuration: 20,
  },
  {
    id: "energy",
    params: { m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 },
    ic: {
      theta1: Math.PI / 2,           // 90°
      theta1Dot: 0,
      theta2: Math.PI / 2,           // 90°
      theta2Dot: 0,
    },
    simDuration: 1000,
  },
];

// ─── 分析工具函数 ──────────────────────────────────

/** 检测过零点：从正到负或从负到正 */
function detectZeroCrossings(samples: number[]): number[] {
  const crossings: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1]! * samples[i]! < 0) {
      const frac = samples[i - 1]! / (samples[i - 1]! - samples[i]!);
      crossings.push((i - 1 + frac) * VALIDATION_DT);
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

// ─── 分析函数 ──────────────────────────────────────

function analyzeSmallAngle(data: WorkerValidationResultResponse): {
  passed: boolean;
  value: number;
  detail: string;
} {
  if (data.divergedAt !== undefined) {
    return { passed: false, value: NaN, detail: `积分在 t=${data.divergedAt.toFixed(2)}s 处发散` };
  }

  const g = SCENARIOS[0]!.params.g;
  const L1 = SCENARIOS[0]!.params.L1;
  const linearPeriod = 2 * Math.PI * Math.sqrt(L1 / g);

  const crossings = detectZeroCrossings(data.theta1Samples);
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

function analyzeSinglePendulum(data: WorkerValidationResultResponse): {
  passed: boolean;
  value: number;
  detail: string;
} {
  if (data.divergedAt !== undefined) {
    return { passed: false, value: NaN, detail: `积分在 t=${data.divergedAt.toFixed(2)}s 处发散` };
  }

  const g = SCENARIOS[1]!.params.g;
  const L1 = SCENARIOS[1]!.params.L1;
  const expectedPeriod = 2 * Math.PI * Math.sqrt(L1 / g);

  const crossings = detectZeroCrossings(data.theta1Samples);
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

function analyzeEnergy(data: WorkerValidationResultResponse): {
  passed: boolean;
  value: number;
  detail: string;
} {
  if (data.divergedAt !== undefined) {
    return { passed: false, value: NaN, detail: `积分在 t=${data.divergedAt.toFixed(2)}s 处发散` };
  }

  if (data.energySamples.length === 0 || Math.abs(data.energyInitial) < 1e-10) {
    return { passed: false, value: NaN, detail: "初始能量为零，无法评估漂移" };
  }

  let energyMax = data.energyInitial;
  let energyMin = data.energyInitial;

  for (const e of data.energySamples) {
    if (e > energyMax) energyMax = e;
    if (e < energyMin) energyMin = e;
  }

  const maxDrift = Math.abs(energyMax - energyMin) / Math.abs(data.energyInitial);
  const threshold = 0.005;

  return {
    passed: maxDrift < threshold,
    value: maxDrift,
    detail: `初始能量 ${data.energyInitial.toFixed(4)}J，最大相对漂移 ${(maxDrift * 100).toFixed(4)}%（${data.energySamples.length} 采样点，${data.simDuration}s）`,
  };
}

// ─── 公开入口 ──────────────────────────────────────

/**
 * 在 Worker 中依次运行三项物理验证实验，分析并返回结果。
 *
 * 架构对齐 LAB-02 设计文档：所有 ODE 积分在 Worker 中执行，
 * 主线程仅负责分析 Worker 返回的轨迹数据。
 */
export async function runAllValidations(
  onProgress?: (test: ValidationTestKey, result: ValidationResult) => void,
): Promise<ValidationResult[]> {
  const scheduler = getScheduler();
  const results: ValidationResult[] = [];

  for (const scenario of SCENARIOS) {
    let data: WorkerValidationResultResponse;
    try {
      data = await scheduler.runValidation(
        scenario.id,
        scenario.params,
        scenario.ic,
        scenario.simDuration,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failedResult: ValidationResult = {
        test: scenario.id,
        passed: false,
        label: "",
        value: NaN,
        threshold: 0,
        unit: "",
        detail: `Worker 验证失败: ${msg}`,
      };
      results.push(failedResult);
      onProgress?.(scenario.id, failedResult);
      continue;
    }

    let analysis: { passed: boolean; value: number; detail: string };
    switch (scenario.id) {
      case "smallAngle":
        analysis = analyzeSmallAngle(data);
        break;
      case "singlePendulum":
        analysis = analyzeSinglePendulum(data);
        break;
      case "energy":
        analysis = analyzeEnergy(data);
        break;
    }

    const result: ValidationResult = {
      test: scenario.id,
      passed: analysis.passed,
      label:
        scenario.id === "smallAngle"
          ? "小角度近似 (<2%)"
          : scenario.id === "singlePendulum"
            ? "单摆退化"
            : "能量漂移 (<0.5%)",
      value: analysis.value,
      threshold: scenario.id === "energy" ? 0.005 : 0.02,
      unit: "%",
      detail: analysis.detail,
    };

    results.push(result);
    onProgress?.(scenario.id, result);
  }

  return results;
}
