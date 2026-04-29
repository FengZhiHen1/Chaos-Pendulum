import { useCallback, useMemo } from "react";
import { useSimulationStore } from "../store";
import { cn } from "@/shared/lib/cn";

export interface UseEnergyMonitorAPI {
  driftPercent: string;
  showAlarm: boolean;
  showClearButton: boolean;
  driftColorClass: string;
  energyRange: string;
  isActive: boolean;
  dampingActive: boolean;
  handleClear: () => void;
}

const DRIFT_THRESHOLD = 0.005;

export function useEnergyMonitor(): UseEnergyMonitorAPI {
  const energyDrift = useSimulationStore((s) => s.energyDrift);
  const driftExceeded = useSimulationStore((s) => s.driftExceeded);
  const energyMin = useSimulationStore((s) => s.energyMin);
  const energyMax = useSimulationStore((s) => s.energyMax);
  const isSimulationActive = useSimulationStore((s) => s.isSimulationActive);
  const damping = useSimulationStore((s) => s.params.damping);
  const clearDriftAlarm = useSimulationStore((s) => s.clearDriftAlarm);

  const driftPercent = useMemo(() => {
    if (!isSimulationActive) return "--";
    if (isNaN(energyDrift)) return "--";
    return (energyDrift * 100).toFixed(3);
  }, [isSimulationActive, energyDrift]);

  const showAlarm = useMemo(
    () => damping === 0 && driftExceeded,
    [damping, driftExceeded],
  );

  const showClearButton = useMemo(
    () => showAlarm && energyDrift < DRIFT_THRESHOLD,
    [showAlarm, energyDrift],
  );

  const driftColorClass = useMemo(
    () =>
      cn(
        damping > 0 || !driftExceeded
          ? "text-emerald-400"
          : "text-red-400 font-bold",
      ),
    [damping, driftExceeded],
  );

  const energyRange = useMemo(() => {
    if (!isSimulationActive) return "数据不可用";
    return `[${energyMin.toFixed(2)}, ${energyMax.toFixed(2)}] J`;
  }, [isSimulationActive, energyMin, energyMax]);

  const handleClear = useCallback(() => {
    clearDriftAlarm();
  }, [clearDriftAlarm]);

  return {
    driftPercent,
    showAlarm,
    showClearButton,
    driftColorClass,
    energyRange,
    isActive: isSimulationActive,
    dampingActive: damping > 0,
    handleClear,
  };
}
