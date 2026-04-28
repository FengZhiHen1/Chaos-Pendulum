import { LyapunovHeatmap } from "./LyapunovHeatmap";

const DATA_PATHS = {
  lyapunov_max: "/assets/lyapunov_max-a1b3f2e8.json",
  lyapunov_min: "/assets/lyapunov_min-a1b3f2e8.json",
  energy_curvature: "/assets/energy_curvature-a1b3f2e8.json",
};

export function AnalyzeModePage() {
  return (
    <div className="h-full w-full flex flex-col p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-white">李雅普诺夫指数谱</h2>
        <p className="text-xs text-lab-border">点击热力图格点可切换仿真参数</p>
      </div>
      <div className="flex-1 min-h-0">
        <LyapunovHeatmap dataPaths={DATA_PATHS} />
      </div>
    </div>
  );
}
