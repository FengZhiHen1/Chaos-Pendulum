/**
 * 模块: lab.contracts.physics-validation
 * 职责: 定义物理验证套件的契约边界——三项标准验证实验、四态结果机、失败诊断提示。
 *       LAB-02 的核心职责：一键运行三个标准物理验证实验，提供"物理正确性背书"。
 * 数据来源:
 *   - integratorStep (simulation/domain/services/integrators): MUST — 三项验证均使用纯积分函数
 *   - PendulumParams (shared/domain/valueObjects): MUST — 物理参数类型
 * 边界:
 *   - 依赖: simulation/domain/services/integrators, shared/domain/valueObjects
 *   - 被依赖: hooks/useLabValidation, LabPage
 * 禁止行为:
 *   - 禁止验证期间使用 Worker——在主线程直接调用 integratorStep 同步运行
 *   - 禁止验证覆盖所有参数组合（三项是标准场景，不证明"所有参数下都正确"）
 *   - 禁止作为后台持续监控——仅手动触发的一次性实验
 *   - 禁止使用二元判定——使用四态结果机（idle→running→passed|failed）
 */

import type { IntegratorMethod } from "@/shared/domain/valueObjects";

// ───────────────────────────────────────────────
// @contract ValidationTestKey — 验证实验标识
// ───────────────────────────────────────────────

/** 三项标准验证实验的标识 */
export type ValidationTestKey = "smallAngle" | "singlePendulum" | "energy";

// ───────────────────────────────────────────────
// @contract ValidationStatus — 验证四态
// ───────────────────────────────────────────────

/** 单个验证实验的四态结果 */
export type ValidationStatus = "idle" | "running" | "passed" | "failed";

// ───────────────────────────────────────────────
// @contract ValidationResult — 验证结果
// ───────────────────────────────────────────────

/**
 * 单个验证实验的完整结果。
 *
 * 前置: 验证已运行完毕
 * 后置: passed 为 true 时 value < threshold
 * 输入约束:
 *   - test: 三项之一
 *   - passed: 是否通过
 *   - value: 实际测量值（偏差百分比或漂移百分比）
 *   - threshold: 通过阈值
 *   - detail: 人类可读的详细描述
 * 异常: 无——数据不可用时 passed=false
 * Side Effects: 无——纯数据
 */
export interface IValidationResult {
  readonly test: ValidationTestKey;
  readonly passed: boolean;
  readonly label: string;
  readonly value: number;
  readonly threshold: number;
  readonly unit: string;
  readonly detail: string;
}

// ───────────────────────────────────────────────
// @contract ValidationDefaults — 验证阈值
// ───────────────────────────────────────────────

/** 三项验证实验的阈值配置 */
export const VALIDATION_THRESHOLDS: Record<ValidationTestKey, {
  readonly threshold: number;
  readonly label: string;
  readonly unit: string;
}> = {
  smallAngle: {
    threshold: 0.02,      // 2%
    label: "小角度近似 (<2%)",
    unit: "%",
  },
  singlePendulum: {
    threshold: 0.02,      // 2%
    label: "单摆退化",
    unit: "%",
  },
  energy: {
    threshold: 0.005,     // 0.5%
    label: "能量漂移 (<0.5%)",
    unit: "%",
  },
} as const;

/** 验证实验默认参数 */
export const VALIDATION_DEFAULTS = {
  /** 默认积分步长 (s) */
  dt: 1 / 60,
  /** 小角度测试的初始角度 (°) */
  smallAngleTheta0Deg: 5,
  /** 单摆退化测试的初始角度 (rad) */
  singlePendulumTheta0: Math.PI / 4,
  /** 能量测试的仿真时长 (s) */
  energyTestDuration: 100,
  /** 能量测试的采样间隔（步数） */
  energySampleInterval: 10,
  /** 验证超时 (ms) */
  timeoutMs: 30000,
} as const;

// ───────────────────────────────────────────────
// @contract IValidationRunner — 验证运行器
// ───────────────────────────────────────────────

/**
 * 物理验证运行器——在主线程中同步运行三项标准验证实验。
 *
 * 前置: 未在 Worker 积分循环中（验证使用主线程 CPU）
 * 后置: 返回三项验证的完整结果
 * 输入约束:
 *   - method: 已注册的积分方法
 *   - onProgress: 可选回调，每完成一项触发一次
 * 输出约束:
 *   - 返回 3 个 ValidationResult，顺序为 smallAngle → singlePendulum → energy
 *   - 全部通过时 LabPage 显示绿色徽章
 * 异常: 无——验证失败通过 passed=false 表达，不抛异常
 * Side Effects: 调用 integratorStep 消耗 CPU（约 5-10 秒×3 项）；
 *   不修改任何全局状态；不访问 Worker、DOM、或网络
 */
export interface IValidationRunner {
  /** 运行全部三项验证 */
  runAll(
    method: IntegratorMethod,
    onProgress?: (test: ValidationTestKey, result: IValidationResult) => void,
  ): readonly IValidationResult[];
}

// ───────────────────────────────────────────────
// @contract IValidationController — 验证生命周期
// ───────────────────────────────────────────────

/**
 * 验证生命周期控制器——管理验证的触发、状态更新、结果展示。
 *
 * 前置: 仿真积分器可用
 * 后置: 验证完成（全通过或部分失败）
 * 输入约束:
 *   - 一次只能运行一轮验证（isRunning 互斥）
 * 输出约束:
 *   - results: 三项的状态映射 { smallAngle: "passed", singlePendulum: "passed", energy: "passed" }
 *   - allPassed: 全部通过时 LabPage 显示绿色徽章
 * 异常: 无
 * Side Effects: 更新 Zustand Store 中的 validationResults / validationDetails / validationRunning
 */
export interface IValidationController {
  /** 当前验证是否正在运行 */
  readonly isRunning: boolean;

  /** 三项验证的状态 */
  readonly results: Record<ValidationTestKey, ValidationStatus>;

  /** 三项验证的详细信息 */
  readonly details: Record<ValidationTestKey, string>;

  /** 启动一轮完整验证 */
  startValidation(method: IntegratorMethod): Promise<void>;

  /** 重置所有验证状态 */
  reset(): void;

  /** 是否全部三项都通过 */
  get allPassed(): boolean;
}
