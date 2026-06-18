import { useCallback, useMemo, useState } from "react";
import { useLabStore } from "../store";
import { useSimulationStore } from "@/features/simulation/store";
import { runAllValidations } from "../validation-runner";
import type { ValidationTestKey, ValidationResult } from "../validation-runner";

export interface UseLabValidationAPI {
  validationResults: Record<string, "idle" | "running" | "passed" | "failed">;
  validationDetails: Record<string, string>;
  isRunning: boolean;
  allPassed: boolean;
  anyHasRun: boolean;
  /** 当前正在运行的验证项（用于 UI 高亮） */
  activeTest: ValidationTestKey | null;
  /** 最近一次验证的结构化结果 */
  lastResults: Record<string, ValidationResult | null>;
  handleRunValidation: () => void;
}

const ALL_TESTS = ["smallAngle", "singlePendulum", "energy"] as const;

const WORKER_NOT_READY_MSG =
  "仿真引擎未就绪。请先切换到「探索模式」点击播放按钮启动仿真，再返回此页面运行验证。";
const SIMULATION_NOT_STARTED_MSG =
  "仿真尚未启动。请先切换到「探索模式」点击播放按钮启动仿真，完成初始化后再运行验证。";

export function useLabValidation(): UseLabValidationAPI {
  const validationResults = useLabStore((s) => s.validationResults);
  const validationDetails = useLabStore((s) => s.validationDetails);
  const validationRunning = useLabStore((s) => s.validationRunning);
  const allPassed = useLabStore((s) => s.allPassed);
  const setValidationResult = useLabStore((s) => s.setValidationResult);
  const setValidationDetail = useLabStore((s) => s.setValidationDetail);
  const setValidationRunning = useLabStore((s) => s.setValidationRunning);
  const setAllPassed = useLabStore((s) => s.setAllPassed);

  const [activeTest, setActiveTest] = useState<ValidationTestKey | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, ValidationResult | null>>({
    smallAngle: null,
    singlePendulum: null,
    energy: null,
  });

  const handleRunValidation = useCallback(() => {
    console.log("[useLabValidation] handleRunValidation 被调用");
    const simStore = useSimulationStore.getState();
    console.log(`[useLabValidation] isWorkerReady=${simStore.isWorkerReady}, isRunning=${simStore.isRunning}, hasSimulationInitialized=${simStore.hasSimulationInitialized}`);
    // 先验检测：Worker 必须已注入且仿真已至少启动过一次（init 已发送），
    // 否则 Worker 内部 state/params 为 null，runValidation 会触发 error 响应导致卡死。
    if (!simStore.isWorkerReady) {
      console.warn("[useLabValidation] Worker 未就绪，中止验证");
      for (const test of ALL_TESTS) {
        setValidationDetail(test, WORKER_NOT_READY_MSG);
      }
      return;
    }
    if (!simStore.hasSimulationInitialized) {
      console.warn("[useLabValidation] 仿真尚未初始化，中止验证");
      for (const test of ALL_TESTS) {
        setValidationDetail(test, SIMULATION_NOT_STARTED_MSG);
      }
      return;
    }

    const cachedParams = { ...simStore.params };
    const cachedIC = {
      theta1: simStore.state.theta1,
      theta1Dot: simStore.state.omega1,
      theta2: simStore.state.theta2,
      theta2Dot: simStore.state.omega2,
    };
    const wasRunning = simStore.isRunning;

    if (wasRunning) {
      simStore.setRunning(false);
    }

    setValidationRunning(true);
    setAllPassed(false);
    setActiveTest(null);
    setLastResults({ smallAngle: null, singlePendulum: null, energy: null });
    for (const test of ALL_TESTS) {
      setValidationResult(test, "running");
      setValidationDetail(test, "");
    }

    runAllValidations({
      onStart: (test) => {
        setActiveTest(test);
      },
      onProgress: (test, result) => {
        setValidationResult(test, result.passed ? "passed" : "failed");
        setValidationDetail(test, result.detail);
        setLastResults((prev) => ({ ...prev, [test]: result }));
      },
    })
      .then((results) => {
        console.log("[useLabValidation] .then 触发, results=", results.length, "allPassed=", results.every(r => r.passed));
        const allOk = results.every((r) => r.passed);
        setAllPassed(allOk);
        setValidationRunning(false);
        setActiveTest(null);
        console.log("[useLabValidation] 开始 restoreSimulation");
        restoreSimulation(simStore, cachedParams, cachedIC, wasRunning);
        console.log("[useLabValidation] .then 完成");
      })
      .catch((err) => {
        console.error("[useLabValidation] .catch 触发:", err);
        setValidationRunning(false);
        setActiveTest(null);
        const msg = err instanceof Error ? err.message : String(err);
        for (const test of ALL_TESTS) {
          setValidationDetail(test, `验证失败: ${msg}`);
        }
        restoreSimulation(simStore, cachedParams, cachedIC, wasRunning);
      });
  }, [setValidationResult, setValidationDetail, setValidationRunning, setAllPassed]);

  const anyHasRun = useMemo(
    () => Object.values(validationResults).some((s) => s !== "idle"),
    [validationResults],
  );

  return {
    validationResults,
    validationDetails,
    isRunning: validationRunning,
    allPassed,
    anyHasRun,
    activeTest,
    lastResults,
    handleRunValidation,
  };
}

function restoreSimulation(
  simStore: ReturnType<typeof useSimulationStore.getState>,
  cachedParams: Record<string, number>,
  cachedIC: { theta1: number; theta1Dot: number; theta2: number; theta2Dot: number },
  wasRunning: boolean,
): void {
  console.log("[useLabValidation] restoreSimulation 开始, wasRunning=", wasRunning);
  try {
    simStore.injectParams(cachedParams, cachedIC);
    console.log("[useLabValidation] injectParams 完成");
    if (wasRunning) {
      simStore.setRunning(true);
      console.log("[useLabValidation] setRunning(true) 完成");
    }
    console.log("[useLabValidation] restoreSimulation 完成");
  } catch (err) {
    console.error("[useLabValidation] 恢复仿真状态失败:", err);
  }
}
