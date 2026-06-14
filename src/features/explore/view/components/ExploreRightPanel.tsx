import { EnergyMonitorPanel, PhaseSpacePanel } from "@/features/simulation";
import { DecompositionPanel } from "@/features/lab/view/components/DecompositionPanel";

interface ExploreRightPanelProps {
  forceActive: boolean;
}

/**
 * 探索模式右侧面板。
 *
 * - 受力分析激活时显示力分解面板
 * - 否则显示能量监控 + 相空间图
 */
export function ExploreRightPanel({ forceActive }: ExploreRightPanelProps) {
  if (forceActive) {
    return (
      <aside
        data-ui-controls
        data-chart-container
        className="w-80 shrink-0 h-full overflow-hidden bg-surface-container-low"
      >
        <DecompositionPanel />
      </aside>
    );
  }

  return (
    <aside
      data-ui-controls
      data-chart-container
      className="w-80 shrink-0 h-full overflow-y-auto overflow-x-hidden bg-surface-container-low flex flex-col"
    >
      <EnergyMonitorPanel width={304} height={160} />
      <PhaseSpacePanel size={304} />
    </aside>
  );
}
