import { useCallback, useMemo } from "react";
import { useSimulationStore } from "../store";

export interface UseSimulationControlsAPI {
  isRunning: boolean;
  engineError: string | null;
  isSceneFrozen: boolean;
  disabled: boolean;
  setRunning: (v: boolean) => void;
  resetToDefaults: () => void;
}

export function useSimulationControls(): UseSimulationControlsAPI {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const engineError = useSimulationStore((s) => s.engineError);
  const isSceneFrozen = useSimulationStore((s) => s.isSceneFrozen);
  const setRunning = useSimulationStore((s) => s.setRunning);
  const resetToDefaults = useSimulationStore((s) => s.resetToDefaults);

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
    engineError,
    isSceneFrozen,
    disabled,
    setRunning: handleSetRunning,
    resetToDefaults,
  };
}
