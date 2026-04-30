import { useCallback, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, GitCompare, X, Eye } from "lucide-react";
import { Scene3D } from "./components/Scene3D";
import { TimeReversal } from "./components/TimeReversal";
import { TimeReversalTrajectoryOverlay } from "./components/TimeReversalTrajectory";
import { SonificationToggle } from "./components/SonificationToggle";
import { ButterflySplit } from "./components/ButterflySplit";
import { TrailControls } from "./components/TrailControls";
import { ChaosIndicator } from "./components/ChaosIndicator";
import { useChaosUpdater } from "./hooks/useChaosUpdater";
import { ParamPanel, EnergyMonitorPanel, PhaseSpacePanel } from "@/features/simulation";
import { useSimulationStore } from "@/features/simulation/store";
import { useSimulationControls } from "@/features/simulation/hooks/useSimulationControls";
import { useButterflyMode } from "./hooks/useButterflyMode";
import { useAppStore } from "@/stores/useAppStore";
import { useLabStore } from "@/features/lab/store";
import { getScheduler } from "@/features/simulation/worker/scheduler";
import { DecompositionPanel } from "@/features/lab/components/DecompositionPanel";
import { Button } from "@/shared/components/ui/button";

export function ExplorePage() {
  const {
    butterflyActive,
    enterButterfly,
    exitButterfly,
  } = useButterflyMode();

  useChaosUpdater();

  const {
    isRunning,
    disabled,
    setRunning,
    resetToDefaults,
  } = useSimulationControls();

  const isDesktop = useAppStore((s) => s.deviceType === "desktop");

  // 受力分析模式（LAB-01）
  const forceActive = useLabStore((s) => s.forceDecomposition.active);
  const setForceActive = useLabStore((s) => s.setForceActive);
  const wasRunningRef = useRef(false);

  const toggleForceAnalysis = useCallback(() => {
    const wasRunning = useSimulationStore.getState().isRunning;
    const currentActive = useLabStore.getState().forceDecomposition.active;

    if (!currentActive) {
      wasRunningRef.current = wasRunning;
      if (wasRunning) {
        setRunning(false);
      }
      setForceActive(true);
      getScheduler().setComputeForces(true);
    } else {
      setForceActive(false);
      getScheduler().setComputeForces(false);
      if (wasRunningRef.current) {
        setRunning(true);
      }
    }
  }, [setRunning, setForceActive]);

  const exitForceAnalysis = useCallback(() => {
    if (useLabStore.getState().forceDecomposition.active) {
      setForceActive(false);
      getScheduler().setComputeForces(false);
    }
  }, [setForceActive]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggleForceAnalysis();
      } else if (e.key === "Escape") {
        exitForceAnalysis();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleForceAnalysis, exitForceAnalysis]);

  if (butterflyActive) {
    return (
      <div className="w-full h-full relative">
        <ButterflySplit className="w-full h-full" />
        <button
          type="button"
          onClick={exitButterfly}
          className="absolute top-3 right-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-separation-alert/20 text-separation-alert hover:bg-separation-alert/30 border border-separation-alert/30 transition-all"
        >
          <X className="w-3.5 h-3.5" />
          退出蝴蝶效应
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧控制面板 (280px) — 桌面端 */}
        {isDesktop && (
          <aside className="w-[280px] shrink-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <ParamPanel />
            </div>
            <div className="shrink-0 border-t border-on-surface-variant/10 p-3">
              <TrailControls />
            </div>
          </aside>
        )}

        {/* 中部 3D 场景 */}
        <section className="flex-1 relative overflow-hidden bg-surface">
          <Scene3D
            pendulumMaterial="metal"
            environment="dark-lab"
            showGrid
            enableShadows
            canvasChildren={<TimeReversalTrajectoryOverlay />}
          />

          {/* 叠加控件 */}
          <SonificationToggle className="absolute top-3 left-3 z-20" />
          <ChaosIndicator className="absolute top-12 left-3 z-20" />
          <TimeReversal />

          {/* 蝴蝶效应入口 */}
          <button
            type="button"
            onClick={enterButterfly}
            className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30 transition-all"
          >
            <GitCompare className="w-3.5 h-3.5" />
            蝴蝶效应
          </button>
        </section>

        {/* 右侧图表面板 (300px) — 桌面端；受力分析激活时替换为分解面板 */}
        {isDesktop && (
          forceActive ? (
            <DecompositionPanel />
          ) : (
            <aside className="w-[300px] shrink-0 flex flex-col overflow-y-auto bg-surface-container-low">
              <EnergyMonitorPanel width={284} height={160} />
              <PhaseSpacePanel size={284} />
            </aside>
          )
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="h-10 shrink-0 flex items-center justify-center gap-3 bg-surface-container-lowest border-t border-on-surface-variant/10 px-4">
        <Button
          variant={isRunning ? "secondary" : "primary"}
          size="sm"
          disabled={disabled}
          onClick={() => setRunning(!isRunning)}
        >
          {isRunning ? (
            <><Pause className="h-3.5 w-3.5 mr-1" />暂停</>
          ) : (
            <><Play className="h-3.5 w-3.5 mr-1" />播放</>
          )}
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          onClick={resetToDefaults}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          重置
        </Button>
        <Button
          variant={forceActive ? "secondary" : "tertiary"}
          size="sm"
          onClick={toggleForceAnalysis}
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          {forceActive ? "关闭受力分析" : "受力分析"}
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          onClick={enterButterfly}
        >
          <GitCompare className="h-3.5 w-3.5 mr-1" />
          蝴蝶效应
        </Button>
      </div>

      {/* 平板 / 手机：控制面板以底部 Sheet 形式 (占位) */}
      {!isDesktop && (
        <div className="h-10 shrink-0 flex items-center justify-center bg-surface-container-low border-t border-on-surface-variant/10 text-xs text-on-surface-variant">
          参数控制面板 (上滑展开) — 平板适配开发中
        </div>
      )}
    </div>
  );
}
