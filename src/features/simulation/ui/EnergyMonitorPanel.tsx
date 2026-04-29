import { useEnergyMonitor } from "../hooks/useEnergyMonitor";
import { EnergyCanvas } from "./EnergyCanvas";
import { cn } from "@/shared/lib/cn";

interface EnergyMonitorPanelProps {
  width?: number;
  height?: number;
  timeWindow?: number;
  showComponents?: boolean;
}

export function EnergyMonitorPanel({
  width = 296,
  height = 150,
  timeWindow = 30,
  showComponents = true,
}: EnergyMonitorPanelProps) {
  const {
    driftPercent,
    showAlarm,
    showClearButton,
    driftColorClass,
    energyRange,
    isActive,
    dampingActive,
    handleClear,
  } = useEnergyMonitor();

  const showCanvas = width >= 100;

  return (
    <div className="flex flex-col border-t border-white/5 bg-surface-container-low">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-semibold text-on-surface tracking-wider">
          能量监控
        </span>
        {isActive ? (
          showAlarm ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-separation-alert/15 text-separation-alert animate-pulse">
              超阈值
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary-container text-primary">
              正常
            </span>
          )
        ) : (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-surface-container text-on-surface-variant">
            待机
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 pb-1 text-xs flex-wrap">
        <span className="text-on-surface-variant shrink-0">漂移:</span>
        <span className={cn("font-mono tabular-nums text-xs", driftColorClass)}>
          {driftPercent}%
        </span>

        {showClearButton && (
          <button
            onClick={handleClear}
            className="text-[10px] text-on-surface-variant hover:text-on-surface underline shrink-0"
          >
            清除
          </button>
        )}

        {dampingActive && (
          <span className="text-[10px] text-on-surface-variant shrink-0">
            (阻尼开启)
          </span>
        )}

        <span className="text-[10px] text-on-surface-variant ml-auto">
          {energyRange}
        </span>
      </div>

      {showCanvas && (
        <div className="px-1 pb-2">
          <EnergyCanvas
            width={width}
            height={height}
            timeWindow={timeWindow}
            showComponents={showComponents}
          />
        </div>
      )}
    </div>
  );
}
