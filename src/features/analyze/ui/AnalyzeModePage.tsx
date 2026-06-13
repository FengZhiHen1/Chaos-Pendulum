import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/view/components/ui/tabs";
import { useAnalysisView } from "../hooks/useAnalysisView";
import type { DampingSlice } from "../types";
import { LyapunovHeatmap } from "./LyapunovHeatmap";
import { BifurcationPlot } from "./BifurcationPlot";
import { PoincareSection } from "./PoincareSection";
import { EnergyLandscape } from "./EnergyLandscape";
import { AnalysisControls } from "./AnalysisControls";
import { BarChart3, Activity, ScatterChart, Mountain } from "lucide-react";

// 预计算数据路径清单。由 scripts/precompute/ 各脚本维护，
// 前端启动时 fetch 获取含 gridHash 的实际文件名。
const MANIFEST_PATH = "./assets/layer_manifest.json";

interface LayerManifest {
  lyapunov_max?: string;
  lyapunov_min?: string;
  energy_curvature?: string;
  bifurcation?: string;
  lyapunov_max_dampingSlices?: DampingSlice[];
  lyapunov_min_dampingSlices?: DampingSlice[];
  energy_curvature_dampingSlices?: DampingSlice[];
}

const FALLBACK_PATHS = {
  lyapunov_max: "./assets/lyapunov_max-missing.json",
  lyapunov_min: "./assets/lyapunov_min-missing.json",
  energy_curvature: "./assets/energy_curvature-missing.json",
};

const FALLBACK_BIFURCATION = "./assets/bifurcation-missing.json";

function useLayerManifest(): {
  lyapunovPaths: typeof FALLBACK_PATHS;
  dampingSlices: DampingSlice[];
  bifurcationPath: string;
  ready: boolean;
} {
  const [manifest, setManifest] = useState<LayerManifest | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_PATH)
      .then((r) => r.json())
      .then((m: LayerManifest) => {
        if (!cancelled) setManifest(m);
      })
      .catch(() => {
        // manifest 不存在时使用 fallback（首次运行或预计算未完成）
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const lyapunovPaths = {
    lyapunov_max: manifest?.lyapunov_max
      ? `./assets/${manifest.lyapunov_max}`
      : FALLBACK_PATHS.lyapunov_max,
    lyapunov_min: manifest?.lyapunov_min
      ? `./assets/${manifest.lyapunov_min}`
      : FALLBACK_PATHS.lyapunov_min,
    energy_curvature: manifest?.energy_curvature
      ? `./assets/${manifest.energy_curvature}`
      : FALLBACK_PATHS.energy_curvature,
  };

  const bifurcationPath = manifest?.bifurcation
    ? `./assets/${manifest.bifurcation}`
    : FALLBACK_BIFURCATION;

  // 提取当前活动图层的阻尼切片
  const dampingSlices = manifest?.lyapunov_max_dampingSlices
    ?? manifest?.lyapunov_min_dampingSlices
    ?? manifest?.energy_curvature_dampingSlices
    ?? [];

  return { lyapunovPaths, dampingSlices, bifurcationPath, ready };
}

const VIEW_TABS = [
  { id: "lyapunov", label: "热力图", icon: BarChart3 },
  { id: "bifurcation", label: "分岔图", icon: Activity },
  { id: "poincare", label: "庞加莱截面", icon: ScatterChart },
  { id: "energy-landscape", label: "能量景观", icon: Mountain },
] as const;

export function AnalyzeModePage() {
  const { activeView, setActiveView, isDesktop } = useAnalysisView();
  const { lyapunovPaths, dampingSlices, bifurcationPath, ready } = useLayerManifest();

  return (
    <div className="h-full w-full flex">
      {/* 左侧分析控制面板 (260px) — 桌面端 */}
      {isDesktop && (
        <aside className="w-[260px] shrink-0 overflow-y-auto bg-surface-container-low border-r border-white/5">
          <AnalysisControls />
        </aside>
      )}

      {/* 图表区 */}
      <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
        {/* Tab 切换 — 无实线边框，仅用 tonal shift 区分 */}
        <Tabs
          value={activeView}
          onValueChange={(v) =>
            setActiveView(
              v as "lyapunov" | "bifurcation" | "poincare" | "energy-landscape",
            )
          }
        >
          <TabsList className="w-full justify-start bg-transparent gap-1">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeView === tab.id;
              const isDisabled = false;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  disabled={isDisabled}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    transition-all duration-200
                    ${isActive
                      ? "bg-surface-container-low text-on-surface"
                      : "text-on-surface-variant hover:text-on-surface"
                    }
                    ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* 图表内容区 — surface-container-low 背景，无边框 */}
        <div className="flex-1 min-h-0 rounded-lg bg-surface-container-low overflow-hidden relative">
          {!ready && (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-on-surface-variant">正在加载预计算数据…</span>
            </div>
          )}
          {ready && activeView === "lyapunov" && (
            <LyapunovHeatmap dataPaths={lyapunovPaths} dampingSlices={dampingSlices} />
          )}
          {ready && activeView === "bifurcation" && (
            <BifurcationPlot dataPath={bifurcationPath} />
          )}
          {activeView === "poincare" && <PoincareSection />}
          {activeView === "energy-landscape" && <EnergyLandscape />}
        </div>
      </div>

      {/* 平板/手机: 分析控制以折叠形式 (占位) */}
      {!isDesktop && (
        <div className="h-10 shrink-0 flex items-center justify-center bg-surface-container-low border-t border-white/5 text-xs text-on-surface-variant/70">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-on-surface-variant/40" />
            分析参数选择 — 点击展开
          </span>
        </div>
      )}
    </div>
  );
}
