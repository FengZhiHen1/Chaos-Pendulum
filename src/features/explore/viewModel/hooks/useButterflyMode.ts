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
    // 双 rAF + setTimeout 兜底：延迟两帧确保主 Scene3D 的 WebGL context
    // 被浏览器完全释放，避免新旧 Canvas 同时存在导致 GPU 资源超限。
    // 第二层 rAF 在首帧可能因标签页后台/GPU 竞争被跳过；
    // setTimeout 100ms 兜底确保蝴蝶视图最终一定能激活。
    let activated = false;
    const activate = () => {
      if (activated) return;
      activated = true;
      setButterflyActive(true);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(activate);
    });
    setTimeout(activate, 100);
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
