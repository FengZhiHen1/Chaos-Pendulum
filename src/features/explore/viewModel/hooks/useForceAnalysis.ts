import { useCallback, useRef } from "react";
import { useSimulationControls } from "@/features/simulation";
import { useSimulationStore } from "@/features/simulation/store";
import { useLabStore } from "@/features/lab/store";
import { getScheduler } from "@/features/simulation/infrastructure/worker/scheduler-factory";

/**
 * 受力分析模式的 ViewModel Hook。
 *
 * 将受力分析的开关逻辑封装在 Hook 中，避免 View 组件直接调用 scheduler。
 * 进入受力分析时保持仿真运行（若未运行则自动启动）以实时产生力数据，
 * 退出时恢复进入前的运行状态。
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
      // 进入受力分析模式：保持仿真运行以实时产生力数据
      const wasRunning = useSimulationStore.getState().isRunning;
      wasRunningRef.current = wasRunning;
      setForceActive(true);
      getScheduler().setComputeForces(true);
      // 若仿真未运行则自动启动，确保力数据立即开始计算
      if (!wasRunning) {
        setRunning(true);
      }
    } else {
      // 退出受力分析模式：关闭力计算，恢复进入前的运行状态
      setForceActive(false);
      getScheduler().setComputeForces(false);
      if (!wasRunningRef.current) {
        setRunning(false);
      }
    }
  }, [setRunning, setForceActive]);

  const exit = useCallback(() => {
    if (!useLabStore.getState().forceDecomposition.active) return;

    setForceActive(false);
    getScheduler().setComputeForces(false);
    // 恢复进入前的运行状态
    if (!wasRunningRef.current) {
      setRunning(false);
    }
  }, [setForceActive, setRunning]);

  return {
    forceActive,
    toggle,
    exit,
  };
}
