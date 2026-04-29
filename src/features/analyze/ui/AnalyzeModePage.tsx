import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useAnalysisView } from "../hooks/useAnalysisView";
import { LyapunovHeatmap } from "./LyapunovHeatmap";
import { BifurcationPlot } from "./BifurcationPlot";
import { PoincareSection } from "./PoincareSection";
import { AnalysisControls } from "./AnalysisControls";

const LYAPUNOV_PATHS = {
  lyapunov_max: "/assets/lyapunov_max-a1b3f2e8.json",
  lyapunov_min: "/assets/lyapunov_min-a1b3f2e8.json",
  energy_curvature: "/assets/energy_curvature-a1b3f2e8.json",
};

const BIFURCATION_PATH = "/assets/bifurcation-a1b3f2e8.json";

export function AnalyzeModePage() {
  const { activeView, setActiveView, isDesktop } =
    useAnalysisView();

  return (
    <div className="h-full w-full flex">
      {/* 左侧分析控制面板 (260px) — 桌面端 */}
      {isDesktop && (
        <aside className="w-[260px] shrink-0 overflow-y-auto">
          <AnalysisControls />
        </aside>
      )}

      {/* 图表区 */}
      <div className="flex-1 flex flex-col min-w-0 p-4">
        <Tabs
          value={activeView}
          onValueChange={(v) =>
            setActiveView(
              v as "lyapunov" | "bifurcation" | "poincare" | "energy-landscape",
            )
          }
        >
          <TabsList className="w-full justify-start mb-3">
            <TabsTrigger value="lyapunov">李雅普诺夫热力图</TabsTrigger>
            <TabsTrigger value="bifurcation">参数空间分岔图</TabsTrigger>
            <TabsTrigger value="poincare">庞加莱截面</TabsTrigger>
            <TabsTrigger value="energy-landscape" disabled>
              能量景观
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 min-h-0">
          {activeView === "lyapunov" && (
            <LyapunovHeatmap dataPaths={LYAPUNOV_PATHS} />
          )}
          {activeView === "bifurcation" && (
            <BifurcationPlot dataPath={BIFURCATION_PATH} />
          )}
          {activeView === "poincare" && <PoincareSection />}
          {activeView === "energy-landscape" && (
            <div className="h-full flex items-center justify-center text-on-surface-variant">
              <p>能量景观 — 待实现 (P2)</p>
            </div>
          )}
        </div>
      </div>

      {/* 平板/手机: 分析控制以折叠形式 (占位) */}
      {!isDesktop && (
        <div className="h-10 shrink-0 flex items-center justify-center bg-surface-container-low border-t border-white/5 text-xs text-on-surface-variant">
          分析参数选择 — 折叠面板适配开发中
        </div>
      )}
    </div>
  );
}
