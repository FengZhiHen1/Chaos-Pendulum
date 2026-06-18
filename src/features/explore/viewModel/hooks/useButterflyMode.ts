import { useState, useCallback, useMemo } from "react";
import { useSimulationStore, getScheduler } from "@/features/simulation";

export interface UseButterflyModeAPI {
  butterflyActive: boolean;
  enterButterfly: () => void;
  exitButterfly: () => void;
  disabled: boolean;
}

export function useButterflyMode(): UseButterflyModeAPI {
  const [butterflyActive, setButterflyActive] = useState(false);

  const engineError = useSimulationStore((s) => s.engineError);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const enterButterfly = useCallback(() => {
    const store = useSimulationStore.getState();
    if (store.isRunning) {
      getScheduler().pause();
    }
    // 延迟一帧再挂载蝴蝶视图，确保主 Scene3D 的 WebGL context 被浏览器释放，
    // 避免新旧 Canvas 同时存在导致 GPU 资源超限 → context lost → 反复重挂载
    requestAnimationFrame(() => {
      setButterflyActive(true);
    });
  }, []);

  const exitButterfly = useCallback(() => {
    setButterflyActive(false);
    const store = useSimulationStore.getState();
    if (!store.isRunning) {
      getScheduler().resume();
    }
  }, []);

  const disabled = useMemo(
    () => engineError !== null && !isRunning,
    [engineError, isRunning],
  );

  return {
    butterflyActive,
    enterButterfly,
    exitButterfly,
    disabled,
  };
}
