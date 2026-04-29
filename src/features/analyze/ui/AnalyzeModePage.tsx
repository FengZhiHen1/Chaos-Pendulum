import { useAnalyzeStore } from "../store";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useAppStore } from "@/stores/useAppStore";
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
  const activeView = useAnalyzeStore((s) => s.activeView);
  const setActiveView = useAnalyzeStore((s) => s.setActiveView);
  const loadStatus = useAnalyzeStore((s) => s.loadStatus);
  const isDesktop = useAppStore((s) => s.deviceType === "desktop");

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
          {/* 加载骨架屏 */}
          {loadStatus === "loading" && (
            <div className="h-full space-y-3 p-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-[60%] w-full" />
              <Skeleton className="h-4 w-64" />
            </div>
          )}

          {/* 加载失败降级 */}
          {loadStatus === "error" && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <p className="text-sm">离线模式：该分析功能需预计算数据支持</p>
              <p className="text-xs text-on-surface-variant/60">
                请检查网络连接后刷新页面
              </p>
            </div>
          )}

          {/* 图表内容 */}
          {(loadStatus === "ready" || loadStatus === "idle") && (
            <>
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
            </>
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
