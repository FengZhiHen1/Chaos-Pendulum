/**
 * 模块: analyze.view.pages.AnalyzeModePage
 * 职责: 分析模式主页面——Web 桌面端「DynamicsTerminal」视觉落地。
 *       严格对齐 docs/pages/Stitch-Design/分析模式/ 设计稿：
 *       280px 左侧控制面板 + 页头/文件夹式 Tabs + 发光图表舞台。
 * 边界:
 *   - 仅导入 analyze ViewModel Hook 与共享 UI 组件
 *   - 子组件通过 Props 接收数据
 */

import { useEffect, useState } from "react";
import { useAnalysisView } from "../viewModel/hooks/useAnalysisView";
import { useAnalyzeStore } from "../store";
import type { DampingSlice } from "../types";
import { AnalysisControls } from "./AnalysisControls";
import { LyapunovHeatmap } from "./LyapunovHeatmap";
import { BifurcationPlot } from "./BifurcationPlot";
import { PoincareSection } from "./PoincareSection";
import { EnergyLandscape } from "./EnergyLandscape";
import { BarChart3, Activity, ScatterChart, Mountain } from "lucide-react";

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

const VIEW_TABS = [
  { id: "lyapunov", label: "Lyapunov 热力图", icon: BarChart3 },
  { id: "bifurcation", label: "分岔图", icon: Activity },
  { id: "poincare", label: "庞加莱截面", icon: ScatterChart },
  { id: "energy-landscape", label: "能量景观", icon: Mountain },
] as const;

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
        // manifest 缺失时使用 fallback（首次运行或预计算未完成）
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

  const dampingSlices = manifest?.lyapunov_max_dampingSlices
    ?? manifest?.lyapunov_min_dampingSlices
    ?? manifest?.energy_curvature_dampingSlices
    ?? [];

  return { lyapunovPaths, dampingSlices, bifurcationPath, ready };
}

export function AnalyzeModePage() {
  const { activeView, setActiveView } = useAnalysisView();
  const { lyapunovPaths, dampingSlices, bifurcationPath, ready } = useLayerManifest();

  const activeLayer = useAnalyzeStore((s) => s.activeLayer);
  const setActiveLayer = useAnalyzeStore((s) => s.setActiveLayer);
  const activeDamping = useAnalyzeStore((s) => s.activeDamping);
  const setActiveDamping = useAnalyzeStore((s) => s.setActiveDamping);
  const loadStatus = useAnalyzeStore((s) => s.loadStatus);
  const layerCacheStatus = useAnalyzeStore((s) => s.layerCacheStatus);

  const availableLayers = new Set(
    (Object.keys(lyapunovPaths) as Array<keyof typeof lyapunovPaths>).filter(
      (k) => !lyapunovPaths[k].endsWith("-missing.json"),
    ),
  );

  return (
    <div className="h-full w-full flex bg-surface overflow-hidden">
      {/* 左侧控制面板 */}
      <aside className="w-[280px] shrink-0 h-full overflow-y-auto bg-surface-container-lowest">
        <AnalysisControls
          activeView={activeView}
          activeLayer={activeLayer}
          onLayerChange={setActiveLayer}
          availableLayers={availableLayers}
          dampingSlices={dampingSlices}
          activeDamping={activeDamping}
          onDampingChange={setActiveDamping}
          loadStatus={loadStatus}
          layerCacheStatus={layerCacheStatus}
        />
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 min-w-0 flex flex-col h-full p-6 gap-4">
        {/* 页头 */}
        <header className="shrink-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary shadow-sm">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-headline-lg font-semibold text-on-surface">分析模式</h1>
            <p className="text-body-md text-on-surface-variant">非线性动力学诊断终端</p>
          </div>
        </header>

        {/* 视图 Tabs — 文件夹式 */}
        <nav className="shrink-0 flex items-end gap-1" aria-label="分析视图">
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-quick
                  ${isActive
                    ? "bg-surface-container-low text-primary rounded-t-lg shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-t-lg"
                  }
                `}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* 图表舞台 */}
        <div className="flex-1 min-h-0 bg-surface-container-low rounded-xl rounded-tl-none shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col">
          {/* 顶部径向微光 */}
          <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full h-[400px] bg-[radial-gradient(circle_at_50%_0%,rgba(75,159,255,0.06),transparent_60%)] z-0" />

          {!ready && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-on-surface-variant">正在加载预计算数据索引…</span>
            </div>
          )}

          {ready && (
            <div className="relative z-10 flex-1 min-h-0">
              {activeView === "lyapunov" && (
                <LyapunovHeatmap
                  dataPaths={lyapunovPaths}
                  dampingSlices={dampingSlices}
                  activeLayer={activeLayer}
                  activeDamping={activeDamping}
                />
              )}
              {activeView === "bifurcation" && <BifurcationPlot dataPath={bifurcationPath} />}
              {activeView === "poincare" && <PoincareSection />}
              {activeView === "energy-landscape" && <EnergyLandscape />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
