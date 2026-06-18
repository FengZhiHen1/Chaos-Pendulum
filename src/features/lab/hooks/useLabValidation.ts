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
    console.log(`[useLabValidation] isWorkerReady=${simStore.isWorkerReady}, isRunning=${simStore.isRunning}`);
    if (!simStore.isWorkerReady) {
      console.warn("[useLabValidation] Worker 未就绪，中止验证");
      for (const test of ALL_TESTS) {
        setValidationDetail(test, WORKER_NOT_READY_MSG);
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
        const allOk = results.every((r) => r.passed);
        setAllPassed(allOk);
        setValidationRunning(false);
        setActiveTest(null);
        restoreSimulation(simStore, cachedParams, cachedIC, wasRunning);
      })
      .catch((err) => {
        console.error("[useLabValidation] 验证异常:", err);
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
  try {
    simStore.injectParams(cachedParams, cachedIC);
    if (wasRunning) {
      simStore.setRunning(true);
    }
  } catch (err) {
    console.error("[useLabValidation] 恢复仿真状态失败:", err);
  }
}
