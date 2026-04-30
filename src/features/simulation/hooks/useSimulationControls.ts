import { useCallback, useMemo } from "react";
import { useSimulationStore } from "../store";

export interface UseSimulationControlsAPI {
  isRunning: boolean;
  isWorkerReady: boolean;
  engineError: string | null;
  isSceneFrozen: boolean;
  paramsDirty: boolean;
  disabled: boolean;
  setRunning: (v: boolean) => void;
  resetToDefaults: () => void;
  applyCurrentSettings: () => void;
}

export function useSimulationControls(): UseSimulationControlsAPI {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isWorkerReady = useSimulationStore((s) => s.isWorkerReady);
  const engineError = useSimulationStore((s) => s.engineError);
  const isSceneFrozen = useSimulationStore((s) => s.isSceneFrozen);
  const paramsDirty = useSimulationStore((s) => s.paramsDirty);
  const setRunning = useSimulationStore((s) => s.setRunning);
  const resetToDefaults = useSimulationStore((s) => s.resetToDefaults);
  const applyCurrentSettings = useSimulationStore((s) => s.applyCurrentSettings);

  const disabled = useMemo(
    () => engineError !== null && !isRunning,
    [engineError, isRunning],
  );

  const handleSetRunning = useCallback(
    (v: boolean) => setRunning(v),
    [setRunning],
  );

  return {
    isRunning,
    isWorkerReady,
    engineError,
    isSceneFrozen,
    paramsDirty,
    disabled,
    setRunning: handleSetRunning,
    resetToDefaults,
    applyCurrentSettings,
  };
}
