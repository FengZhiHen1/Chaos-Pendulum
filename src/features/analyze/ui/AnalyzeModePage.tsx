import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useAnalysisView } from "../hooks/useAnalysisView";
import { LyapunovHeatmap } from "./LyapunovHeatmap";
import { BifurcationPlot } from "./BifurcationPlot";
import { PoincareSection } from "./PoincareSection";
import { AnalysisControls } from "./AnalysisControls";

// 预计算数据路径清单。由 scripts/precompute/ 各脚本维护，
// 前端启动时 fetch 获取含 gridHash 的实际文件名。
const MANIFEST_PATH = "/assets/layer_manifest.json";

interface LayerManifest {
  lyapunov_max?: string;
  lyapunov_min?: string;
  energy_curvature?: string;
  bifurcation?: string;
}

const FALLBACK_PATHS = {
  lyapunov_max: "/assets/lyapunov_max-missing.json",
  lyapunov_min: "/assets/lyapunov_min-missing.json",
  energy_curvature: "/assets/energy_curvature-missing.json",
};

const FALLBACK_BIFURCATION = "/assets/bifurcation-missing.json";

function useLayerManifest(): {
  lyapunovPaths: typeof FALLBACK_PATHS;
  bifurcationPath: string;
} {
  const [manifest, setManifest] = useState<LayerManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_PATH)
      .then((r) => r.json())
      .then((m: LayerManifest) => {
        if (!cancelled) setManifest(m);
      })
      .catch(() => {
        // manifest 不存在时使用 fallback（首次运行或预计算未完成）
      });
    return () => { cancelled = true; };
  }, []);

  const lyapunovPaths = {
    lyapunov_max: manifest?.lyapunov_max
      ? `/assets/${manifest.lyapunov_max}`
      : FALLBACK_PATHS.lyapunov_max,
    lyapunov_min: manifest?.lyapunov_min
      ? `/assets/${manifest.lyapunov_min}`
      : FALLBACK_PATHS.lyapunov_min,
    energy_curvature: manifest?.energy_curvature
      ? `/assets/${manifest.energy_curvature}`
      : FALLBACK_PATHS.energy_curvature,
  };

  const bifurcationPath = manifest?.bifurcation
    ? `/assets/${manifest.bifurcation}`
    : FALLBACK_BIFURCATION;

  return { lyapunovPaths, bifurcationPath };
}

export function AnalyzeModePage() {
  const { activeView, setActiveView, isDesktop } = useAnalysisView();
  const { lyapunovPaths, bifurcationPath } = useLayerManifest();

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
            <LyapunovHeatmap dataPaths={lyapunovPaths} />
          )}
          {activeView === "bifurcation" && (
            <BifurcationPlot dataPath={bifurcationPath} />
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
