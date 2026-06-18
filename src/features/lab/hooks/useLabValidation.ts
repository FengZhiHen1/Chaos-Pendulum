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

/** 三项验证的标识 */
const ALL_TESTS = ["smallAngle", "singlePendulum", "energy"] as const;

/** Worker 未就绪时显示的友好提示 */
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

  const handleRunValidation = useCallback(() => {
    // ── 预检：Worker 是否就绪 ──
    const simStore = useSimulationStore.getState();
    if (!simStore.isWorkerReady) {
      for (const test of ALL_TESTS) {
        setValidationDetail(test, WORKER_NOT_READY_MSG);
      }
      return;
    }

    // 缓存当前仿真状态，验证完成后恢复
    const cachedParams = { ...simStore.params };
    const cachedIC = {
      theta1: simStore.state.theta1,
      theta1Dot: simStore.state.omega1,
      theta2: simStore.state.theta2,
      theta2Dot: simStore.state.omega2,
    };
    const wasRunning = simStore.isRunning;

    // 暂停当前仿真（若正在运行）
    if (wasRunning) {
      simStore.setRunning(false);
    }

    // 标记全部验证为运行中
    setValidationRunning(true);
    setAllPassed(false);
    for (const test of ALL_TESTS) {
      setValidationResult(test, "running");
    }

    // 异步在 Worker 中依次运行三项验证
    runAllValidations((test, result) => {
      setValidationResult(test, result.passed ? "passed" : "failed");
      setValidationDetail(test, result.detail);
    })
      .then((results) => {
        const allOk = results.every((r) => r.passed);
        setAllPassed(allOk);
        setValidationRunning(false);

        // 验证完成后恢复仿真参数和运行状态
        restoreSimulation(simStore, cachedParams, cachedIC, wasRunning);
      })
      .catch((err) => {
        console.error("[useLabValidation] 验证异常:", err);
        setValidationRunning(false);
        // 将错误信息展示在验证详情中
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
    handleRunValidation,
  };
}

/** 恢复仿真参数和运行状态（安全包装，防止二次异常） */
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
