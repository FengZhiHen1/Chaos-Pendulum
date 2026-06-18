import { useCallback, useMemo } from "react";
import { useLabStore } from "../store";
import { useSimulationStore } from "@/features/simulation/store";
import { runAllValidations } from "../validation-runner";

export interface UseLabValidationAPI {
  validationResults: Record<string, "idle" | "running" | "passed" | "failed">;
  validationDetails: Record<string, string>;
  isRunning: boolean;
  allPassed: boolean;
  anyHasRun: boolean;
  handleRunValidation: () => void;
}

export function useLabValidation(): UseLabValidationAPI {
  const validationResults = useLabStore((s) => s.validationResults);
  const validationDetails = useLabStore((s) => s.validationDetails);
  const validationRunning = useLabStore((s) => s.validationRunning);
  const allPassed = useLabStore((s) => s.allPassed);
  const setValidationResult = useLabStore((s) => s.setValidationResult);
  const setValidationDetail = useLabStore((s) => s.setValidationDetail);
  const setValidationRunning = useLabStore((s) => s.setValidationRunning);
  const setAllPassed = useLabStore((s) => s.setAllPassed);

  const handleRunValidation = useCallback(() => {
    // 缓存当前仿真状态，验证完成后恢复
    const simStore = useSimulationStore.getState();
    const cachedParams = { ...simStore.params };
    const cachedIC = {
      theta1: simStore.state.theta1,
      theta1Dot: simStore.state.omega1,
      theta2: simStore.state.theta2,
      theta2Dot: simStore.state.omega2,
    };
    const wasRunning = simStore.isRunning;

    // 暂停当前仿真
    if (wasRunning) {
      simStore.setRunning(false);
    }

    setValidationRunning(true);
    setValidationResult("smallAngle", "running");
    setValidationResult("singlePendulum", "running");
    setValidationResult("energy", "running");
    setAllPassed(false);

    // 异步在 Worker 中运行三项验证（依次执行）
    runAllValidations((test, result) => {
      setValidationResult(test, result.passed ? "passed" : "failed");
      setValidationDetail(test, result.detail);
    }).then((results) => {
      const allOk = results.every((r) => r.passed);
      setAllPassed(allOk);
      setValidationRunning(false);

      // 验证完成后恢复仿真参数和运行状态
      simStore.injectParams(cachedParams, cachedIC);
      if (wasRunning) {
        simStore.setRunning(true);
      }
    }).catch(() => {
      // 即使出错也尝试恢复
      setValidationRunning(false);
      simStore.injectParams(cachedParams, cachedIC);
      if (wasRunning) {
        simStore.setRunning(true);
      }
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
    handleRunValidation,
  };
}
