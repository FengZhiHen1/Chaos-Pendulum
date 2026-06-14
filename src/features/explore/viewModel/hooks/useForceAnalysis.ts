import { useCallback, useRef } from "react";
import { useSimulationControls } from "@/features/simulation/hooks/useSimulationControls";
import { useSimulationStore } from "@/features/simulation/store";
import { useLabStore } from "@/features/lab/store";
import { getScheduler } from "@/features/simulation/infrastructure/worker/scheduler-factory";

/**
 * 受力分析模式的 ViewModel Hook。
 *
 * 将受力分析的开关逻辑封装在 Hook 中，避免 View 组件直接调用 scheduler。
 * 进入受力分析时自动暂停仿真，退出时恢复之前的运行状态。
 */
export interface UseForceAnalysisAPI {
  /** 受力分析是否激活 */
  forceActive: boolean;
  /** 切换受力分析开关 */
  toggle: () => void;
  /** 关闭受力分析 */
  exit: () => void;
}

export function useForceAnalysis(): UseForceAnalysisAPI {
  const { setRunning } = useSimulationControls();
  const forceActive = useLabStore((s) => s.forceDecomposition.active);
  const setForceActive = useLabStore((s) => s.setForceActive);
  const wasRunningRef = useRef(false);

  const toggle = useCallback(() => {
    const currentActive = useLabStore.getState().forceDecomposition.active;

    if (!currentActive) {
      const wasRunning = useSimulationStore.getState().isRunning;
      wasRunningRef.current = wasRunning;
      if (wasRunning) {
        setRunning(false);
      }
      setForceActive(true);
      getScheduler().setComputeForces(true);
    } else {
      setForceActive(false);
      getScheduler().setComputeForces(false);
      if (wasRunningRef.current) {
        setRunning(true);
      }
    }
  }, [setRunning, setForceActive]);

  const exit = useCallback(() => {
    if (!useLabStore.getState().forceDecomposition.active) return;

    setForceActive(false);
    getScheduler().setComputeForces(false);
  }, [setForceActive]);

  return {
    forceActive,
    toggle,
    exit,
  };
}
