import type { WorkerValidationResultResponse, PendulumParams, InitialConditions } from "@/shared/domain/valueObjects";
import { getScheduler } from "@/features/simulation/infrastructure/worker/scheduler-factory";

// ─── 类型 ─────────────────────────────────────────

export type ValidationTestKey = "smallAngle" | "singlePendulum" | "energy";

/** 单项验证的结构化测量指标 */
export interface ValidationMetrics {
  measured: number;
  expected: number;
  unit: string;
  extra?: Record<string, string>;
}

export interface ValidationResult {
  test: ValidationTestKey;
  passed: boolean;
  label: string;
  value: number;
  threshold: number;
  unit: string;
  detail: string;
  /** Worker 积分耗时 (ms) */
  durationMs: number;
  /** 结构化测量指标（通过时填充） */
  metrics: ValidationMetrics | null;
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
      theta1: (5 * Math.PI) / 180,
      theta1Dot: 0,
      theta2: (5 * Math.PI) / 180,
      theta2Dot: 0,
    },
    simDuration: 10,
  },
  {
    id: "singlePendulum",
    params: { m1: 1.0, m2: 1e-6, L1: 1.0, L2: 1.0, g: 9.81, damping: 0 },
    ic: {
      theta1: (5 * Math.PI) / 180,   // 5° — 小角度保证周期公式精度
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
      theta1: 1.5,                 // ≈ 86° — 大角度混沌初始条件
      theta1Dot: 0,
      theta2: 2.0,                 // ≈ 115°
      theta2Dot: 0,
    },
    simDuration: 1000,
  },
];

// ─── 分析工具函数 ──────────────────────────────────

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

function averagePeriod(crossings: number[]): number {
  if (crossings.length < 3) return NaN;
  const periods: number[] = [];
  for (let i = 2; i < crossings.length; i += 2) {
    periods.push(crossings[i]! - crossings[i - 2]!);
  }
  return periods.reduce((a, b) => a + b, 0) / periods.length;
}

// ─── 分析函数 ──────────────────────────────────────

interface AnalysisResult {
  passed: boolean;
  value: number;
  detail: string;
  metrics: ValidationMetrics | null;
}

function analyzeSmallAngle(data: WorkerValidationResultResponse): AnalysisResult {
  if (data.divergedAt !== undefined) {
    return { passed: false, value: NaN, detail: `积分在 t=${data.divergedAt.toFixed(2)}s 处发散`, metrics: null };
  }

  const g = SCENARIOS[0]!.params.g;
  const L1 = SCENARIOS[0]!.params.L1;
  // 双摆等质量等长度小角度简正模——主导模（同相模）周期
  // ω² = (g/L)(2 - √2) → T = 2π/√[(g/L)(2-√2)]
  const expectedPeriod = (2 * Math.PI) / Math.sqrt((g / L1) * (2 - Math.SQRT2));

  const crossings = detectZeroCrossings(data.theta1Samples);
  const measuredPeriod = averagePeriod(crossings);

  if (isNaN(measuredPeriod)) {
    return { passed: false, value: NaN, detail: "未能检测到足够过零点", metrics: null };
  }

  const error = Math.abs(measuredPeriod - expectedPeriod) / expectedPeriod;
  const threshold = 0.02;

  return {
    passed: error < threshold,
    value: error,
    detail: `同相模周期 ${expectedPeriod.toFixed(4)}s，实测 ${measuredPeriod.toFixed(4)}s`,
    metrics: {
      measured: measuredPeriod,
      expected: expectedPeriod,
      unit: "s",
      extra: {
        "过零点数": String(crossings.length),
        "检测周期数": String(Math.floor(crossings.length / 2)),
      },
    },
  };
}

function analyzeSinglePendulum(data: WorkerValidationResultResponse): AnalysisResult {
  if (data.divergedAt !== undefined) {
    return { passed: false, value: NaN, detail: `积分在 t=${data.divergedAt.toFixed(2)}s 处发散`, metrics: null };
  }

  const g = SCENARIOS[1]!.params.g;
  const L1 = SCENARIOS[1]!.params.L1;
  const expectedPeriod = 2 * Math.PI * Math.sqrt(L1 / g);

  const crossings = detectZeroCrossings(data.theta1Samples);
  const measuredPeriod = averagePeriod(crossings);

  if (isNaN(measuredPeriod)) {
    return { passed: false, value: NaN, detail: "未能检测到足够过零点", metrics: null };
  }

  const error = Math.abs(measuredPeriod - expectedPeriod) / expectedPeriod;
  const threshold = 0.02;

  return {
    passed: error < threshold,
    value: error,
    detail: `期望周期 ${expectedPeriod.toFixed(4)}s，实测 ${measuredPeriod.toFixed(4)}s`,
    metrics: {
      measured: measuredPeriod,
      expected: expectedPeriod,
      unit: "s",
      extra: {
        "过零点数": String(crossings.length),
      },
    },
  };
}

function analyzeEnergy(data: WorkerValidationResultResponse): AnalysisResult {
  if (data.divergedAt !== undefined) {
    return { passed: false, value: NaN, detail: `积分在 t=${data.divergedAt.toFixed(2)}s 处发散`, metrics: null };
  }

  if (data.energySamples.length === 0 || Math.abs(data.energyInitial) < 1e-10) {
    return { passed: false, value: NaN, detail: "初始能量为零，无法评估漂移", metrics: null };
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
    detail: `初始能量 ${data.energyInitial.toFixed(2)}J，漂移 ${(maxDrift * 100).toFixed(4)}%`,
    metrics: {
      measured: maxDrift,
      expected: 0,
      unit: "%",
      extra: {
        "初始能量": `${data.energyInitial.toFixed(2)} J`,
        "最大能量": `${energyMax.toFixed(2)} J`,
        "最小能量": `${energyMin.toFixed(2)} J`,
        "采样点数": String(data.energySamples.length),
      },
    },
  };
}

// ─── 场景元数据 ────────────────────────────────────

const SCENARIO_META: Record<ValidationTestKey, { label: string; threshold: number; unit: string }> = {
  smallAngle: { label: "小角度简正模 (<2%)", threshold: 0.02, unit: "%" },
  singlePendulum: { label: "单摆退化", threshold: 0.02, unit: "%" },
  energy: { label: "能量漂移 (<0.5%)", threshold: 0.005, unit: "%" },
};

// ─── 公开入口 ──────────────────────────────────────

export interface ValidationCallbacks {
  /** 某项验证开始 */
  onStart?: (test: ValidationTestKey) => void;
  /** 某项验证完成 */
  onProgress?: (test: ValidationTestKey, result: ValidationResult) => void;
}

export async function runAllValidations(callbacks: ValidationCallbacks = {}): Promise<ValidationResult[]> {
  const { onStart, onProgress } = callbacks;
  const scheduler = getScheduler();
  console.log("[validation-runner] runAllValidations 开始, scheduler 已获取");
  const results: ValidationResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`[validation-runner] 开始验证: ${scenario.id}, duration=${scenario.simDuration}s`);
    onStart?.(scenario.id);
    const t0 = performance.now();

    let data: WorkerValidationResultResponse;
    try {
      data = await scheduler.runValidation(
        scenario.id,
        scenario.params,
        scenario.ic,
        scenario.simDuration,
      );
      console.log(`[validation-runner] Worker 返回数据: ${scenario.id}, theta1Samples=${data.theta1Samples.length}, divergedAt=${data.divergedAt}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[validation-runner] ${scenario.id} Worker 异常:`, msg);
      const failedResult: ValidationResult = {
        test: scenario.id,
        passed: false,
        label: SCENARIO_META[scenario.id].label,
        value: NaN,
        threshold: SCENARIO_META[scenario.id].threshold,
        unit: SCENARIO_META[scenario.id].unit,
        detail: `Worker 验证失败: ${msg}`,
        durationMs: performance.now() - t0,
        metrics: null,
      };
      results.push(failedResult);
      onProgress?.(scenario.id, failedResult);
      continue;
    }

    const durationMs = performance.now() - t0;
    let analysis: AnalysisResult;
    switch (scenario.id) {
      case "smallAngle": analysis = analyzeSmallAngle(data); break;
      case "singlePendulum": analysis = analyzeSinglePendulum(data); break;
      case "energy": analysis = analyzeEnergy(data); break;
    }

    const result: ValidationResult = {
      test: scenario.id,
      passed: analysis.passed,
      label: SCENARIO_META[scenario.id].label,
      value: analysis.value,
      threshold: SCENARIO_META[scenario.id].threshold,
      unit: SCENARIO_META[scenario.id].unit,
      detail: analysis.detail,
      durationMs,
      metrics: analysis.metrics,
    };

    results.push(result);
    onProgress?.(scenario.id, result);
  }

  return results;
}
