import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, GitCompare, X, Eye, ChevronUp } from "lucide-react";
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
import { getScheduler } from "@/features/simulation/infrastructure/worker/scheduler-factory";
import { DecompositionPanel } from "@/features/lab/components/DecompositionPanel";
import { Button } from "@/shared/view/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/view/components/ui/tabs";

/** 平板/手机底部可展开面板——Tab 切换参数/能量/相空间 */
function TabletBottomPanel() {
  const deviceType = useAppStore((s) => s.deviceType);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<string>("params");

  // 手机端仅显示收起状态的基本信息
  if (deviceType === "mobile") {
    return (
      <div className="h-10 shrink-0 flex items-center justify-center gap-2 bg-surface-container-low border-t border-white/5 text-[10px] text-on-surface-variant/60">
        <button onClick={() => { setExpanded(true); setTab("params"); }}
          className="px-2 py-1 rounded hover:bg-white/5 transition-colors">
          <ChevronUp className="h-3 w-3 inline mr-1" />参数
        </button>
        {expanded && (
          <div className="absolute bottom-10 left-0 right-0 bg-surface-container-low border-t border-white/10 p-3 max-h-[50vh] overflow-y-auto z-50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold">{
                tab === "params" ? "参数" : tab === "energy" ? "能量" : "相空间"
              }</span>
              <button onClick={() => setExpanded(false)} className="text-on-surface-variant/50 hover:text-on-surface">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1 mb-2">
              {["params","energy","phase"].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={"px-2 py-0.5 text-[10px] rounded " + (tab === t ? "bg-primary/20 text-primary" : "text-on-surface-variant")}>
                  {t === "params" ? "参数" : t === "energy" ? "能量" : "相空间"}
                </button>
              ))}
            </div>
            {tab === "params" && <ParamPanel />}
            {tab === "energy" && <EnergyMonitorPanel width={window.innerWidth - 32} height={140} />}
            {tab === "phase" && <PhaseSpacePanel size={Math.min(window.innerWidth - 32, 280)} />}
          </div>
        )}
      </div>
    );
  }

  // 平板端
  return (
    <div className="shrink-0 bg-surface-container-low border-t border-white/5">
      {!expanded ? (
        <button onClick={() => setExpanded(true)}
          className="w-full h-10 flex items-center justify-center gap-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors">
          <ChevronUp className="h-3 w-3" />
          参数控制面板
        </button>
      ) : (
        <div className="max-h-[45vh] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="w-full grid grid-cols-3 h-8">
                <TabsTrigger value="params" className="text-[11px]">参数</TabsTrigger>
                <TabsTrigger value="energy" className="text-[11px]">能量</TabsTrigger>
                <TabsTrigger value="phase" className="text-[11px]">相空间</TabsTrigger>
              </TabsList>
            </Tabs>
            <button onClick={() => setExpanded(false)} className="ml-2 p-1 rounded hover:bg-white/10">
              <ChevronUp className="h-4 w-4 rotate-180 text-on-surface-variant" />
            </button>
          </div>
          <div className="px-2 py-2">
            {tab === "params" && <ParamPanel />}
            {tab === "energy" && <EnergyMonitorPanel width={700} height={140} />}
            {tab === "phase" && <PhaseSpacePanel size={280} />}
          </div>
        </div>
      )}
    </div>
  );
}

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

  // 蝴蝶效应分屏状态
  if (butterflyActive) {
    return (
      <div className="w-full h-full relative">
        <ButterflySplit className="w-full h-full" />
        <button
          type="button"
          onClick={exitButterfly}
          className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-separation-alert/15 text-separation-alert hover:bg-separation-alert/25
                     border border-separation-alert/20 transition-all duration-200"
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
          <aside className="w-[280px] shrink-0 flex flex-col overflow-hidden bg-surface-container-low">
            <div className="flex-1 overflow-y-auto">
              <ParamPanel />
            </div>
            <div className="shrink-0 p-3 border-t border-white/5">
              <TrailControls />
            </div>
          </aside>
        )}

        {/* 中部 3D 场景 — 唯一明亮的舞台区域 */}
        <section className="flex-1 relative overflow-hidden bg-surface">
          <Scene3D
            pendulumMaterial="metal"
            environment="dark-lab"
            showGrid
            enableShadows
            canvasChildren={<TimeReversalTrajectoryOverlay />}
          />

          {/* Canvas 上方覆盖层（DOM 层，z-10~20）*/}
          <SonificationToggle className="absolute top-3 left-3 z-20" />
          <ChaosIndicator className="absolute top-12 left-3 z-20" />
          <TimeReversal />

          {/* 蝴蝶效应入口 — 右上角 */}
          <button
            type="button"
            onClick={enterButterfly}
            className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-violet-500/15 text-violet-300 hover:bg-violet-500/25
                       border border-violet-500/20 transition-all duration-200"
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

      {/* 底部工具栏 — surface-container-lowest, 无实线边框 */}
      <div className="h-10 shrink-0 flex items-center justify-center gap-3 bg-surface-container-lowest px-4">
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

      {/* 平板：可展开底部面板（参数/能量/相空间 Tab 切换） */}
      {!isDesktop && (
        <TabletBottomPanel />
      )}
    </div>
  );
}
