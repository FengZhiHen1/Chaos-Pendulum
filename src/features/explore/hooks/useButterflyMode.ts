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
    setButterflyActive(true);
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
