import { useCallback } from "react";
import { useSimulationStore } from "../store";
import { EnergyCanvas } from "./EnergyCanvas";
import { cn } from "@/shared/lib/cn";

// ─── 类型 ──────────────────────────────────────

interface EnergyMonitorPanelProps {
  /** Canvas 宽度 (px)，默认 296（侧栏适配） */
  width?: number;
  /** Canvas 高度 (px)，默认 150 */
  height?: number;
  /** 时间窗口 (s)，默认 30 */
  timeWindow?: number;
  /** 是否显示动能/势能分项曲线，默认 true */
  showComponents?: boolean;
}

const DRIFT_THRESHOLD = 0.005;

// ─── 组件 ──────────────────────────────────────

export function EnergyMonitorPanel({
  width = 296,
  height = 150,
  timeWindow = 30,
  showComponents = true,
}: EnergyMonitorPanelProps) {
  const energyDrift = useSimulationStore((s) => s.energyDrift);
  const driftExceeded = useSimulationStore((s) => s.driftExceeded);
  const energyMin = useSimulationStore((s) => s.energyMin);
  const energyMax = useSimulationStore((s) => s.energyMax);
  const isSimulationActive = useSimulationStore((s) => s.isSimulationActive);
  const damping = useSimulationStore((s) => s.params.damping);
  const clearDriftAlarm = useSimulationStore((s) => s.clearDriftAlarm);

  const driftPercent = isSimulationActive
    ? isNaN(energyDrift)
      ? "--"
      : (energyDrift * 100).toFixed(3)
    : "--";

  // 阻尼 > 0 时始终豁免告警
  const showAlarm = damping === 0 && driftExceeded;
  const showClearButton = showAlarm && energyDrift < DRIFT_THRESHOLD;
  const driftColorClass =
    damping > 0 || !driftExceeded
      ? "text-emerald-400"
      : "text-red-400 font-bold";

  const handleClear = useCallback(() => {
    clearDriftAlarm();
  }, [clearDriftAlarm]);

  // width < 100 → 隐藏 Canvas，仅显示数字
  const showCanvas = width >= 100;

  return (
    <div className="flex flex-col border-t border-white/5 bg-surface-container-low">
      {/* 标题行 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-semibold text-on-surface tracking-wider">
          能量监控
        </span>
        {isSimulationActive ? (
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

      {/* 指标行 */}
      <div className="flex items-center gap-2 px-3 pb-1 text-xs flex-wrap">
        <span className="text-on-surface-variant shrink-0">漂移:</span>
        <span className={cn("font-mono tabular-nums text-xs", driftColorClass)}>
          {driftPercent}%
        </span>

        {showAlarm && (
          <>
            {showClearButton && (
              <button
                onClick={handleClear}
                className="text-[10px] text-on-surface-variant hover:text-on-surface underline shrink-0"
              >
                清除
              </button>
            )}
          </>
        )}

        {damping > 0 && (
          <span className="text-[10px] text-on-surface-variant shrink-0">
            (阻尼开启)
          </span>
        )}

        <span className="text-[10px] text-on-surface-variant ml-auto">
          {isSimulationActive
            ? `[${energyMin.toFixed(2)}, ${energyMax.toFixed(2)}] J`
            : "数据不可用"}
        </span>
      </div>

      {/* Canvas 图表 */}
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
