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
  isStopped: boolean;
  handleClear: () => void;
  /** 最近批次能量投影校正量，格式化字符串 (e.g. "+0.032", "-0.001")，仅 damping=0 */
  correctionDisplay: string;
  /** 是否有校正量数据可供展示 */
  hasCorrection: boolean;
}

const DRIFT_THRESHOLD = 0.005;

export function useEnergyMonitor(): UseEnergyMonitorAPI {
  const energyDrift = useSimulationStore((s) => s.energyDrift);
  const driftExceeded = useSimulationStore((s) => s.driftExceeded);
  const energyMin = useSimulationStore((s) => s.energyMin);
  const energyMax = useSimulationStore((s) => s.energyMax);
  const isSimulationActive = useSimulationStore((s) => s.isSimulationActive);
  const damping = useSimulationStore((s) => s.params.damping);
  const isStopped = useSimulationStore((s) => s.isPendulumStopped);
  const clearDriftAlarm = useSimulationStore((s) => s.clearDriftAlarm);
  const energyCorrection = useSimulationStore((s) => s.energyCorrection);

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

  const correctionDisplay = useMemo(() => {
    if (damping > 0 || !isSimulationActive) return "";
    if (Math.abs(energyCorrection) < 1e-12) return "0";
    const sign = energyCorrection > 0 ? "+" : "";
    if (Math.abs(energyCorrection) < 0.001) {
      return `${sign}${(energyCorrection * 1e6).toFixed(1)} μJ`;
    }
    if (Math.abs(energyCorrection) < 1) {
      return `${sign}${(energyCorrection * 1e3).toFixed(2)} mJ`;
    }
    return `${sign}${energyCorrection.toFixed(4)} J`;
  }, [damping, isSimulationActive, energyCorrection]);

  const hasCorrection = damping === 0 && isSimulationActive;

  return {
    driftPercent,
    showAlarm,
    showClearButton,
    driftColorClass,
    energyRange,
    isActive: isSimulationActive,
    dampingActive: damping > 0,
    isStopped,
    handleClear,
    correctionDisplay,
    hasCorrection,
  };
}
