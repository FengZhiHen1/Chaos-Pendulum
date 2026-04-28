import { useAnalyzeStore } from "../store";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { LyapunovHeatmap } from "./LyapunovHeatmap";
import { BifurcationPlot } from "./BifurcationPlot";
import { PoincareSection } from "./PoincareSection";

const LYAPUNOV_PATHS = {
  lyapunov_max: "/assets/lyapunov_max-a1b3f2e8.json",
  lyapunov_min: "/assets/lyapunov_min-a1b3f2e8.json",
  energy_curvature: "/assets/energy_curvature-a1b3f2e8.json",
};

const BIFURCATION_PATH = "/assets/bifurcation-a1b3f2e8.json";

export function AnalyzeModePage() {
  const activeView = useAnalyzeStore((s) => s.activeView);
  const setActiveView = useAnalyzeStore((s) => s.setActiveView);

  return (
    <div className="h-full w-full flex flex-col p-4">
      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "lyapunov" | "bifurcation" | "poincare" | "energy-landscape")}>
        <TabsList className="w-full justify-start mb-2">
          <TabsTrigger value="lyapunov">李雅普诺夫指数谱</TabsTrigger>
          <TabsTrigger value="bifurcation">参数空间分岔图</TabsTrigger>
          <TabsTrigger value="poincare">庞加莱截面</TabsTrigger>
          <TabsTrigger value="energy-landscape" disabled>能量景观</TabsTrigger>
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
          <div className="h-full flex items-center justify-center text-lab-border">
            <p>模式「energy-landscape」— 待实现</p>
          </div>
        )}
      </div>
    </div>
  );
}
