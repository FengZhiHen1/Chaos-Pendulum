import { useCallback, useEffect, useState } from "react";
import { X, ChevronUp } from "lucide-react";
import { Scene3D } from "../components/Scene3D";
import { TimeReversal } from "../components/TimeReversal";
import { TimeReversalTrajectoryOverlay } from "../components/TimeReversalTrajectory";
import { TrailControls } from "../components/TrailControls";
import { ButterflySplit } from "../components/ButterflySplit";
import { ExploreStageOverlay } from "../components/ExploreStageOverlay";
import { ExploreRightPanel } from "../components/ExploreRightPanel";
import { ExploreBottomToolbar } from "../components/ExploreBottomToolbar";
import { useChaosUpdater } from "../../viewModel/hooks/useChaosUpdater";
import { useButterflyMode } from "../../viewModel/hooks/useButterflyMode";
import { useForceAnalysis } from "../../viewModel/hooks/useForceAnalysis";
import { useSonification } from "../../viewModel/hooks/useSonification";
import { ParamPanel, EnergyMonitorPanel, PhaseSpacePanel } from "@/features/simulation";
import { useSimulationControls } from "@/features/simulation";
import { useSimulationStore } from "@/features/simulation/store";
import { useAppStore } from "@/stores/useAppStore";
import { Tabs, TabsList, TabsTrigger } from "@/shared/view/components/ui/tabs";
import type { PendulumMaterialType, EnvironmentPreset } from "../components/Scene3D";

/** 平板/手机底部可展开面板 —— Tab 切换参数/能量/相空间 */
function TabletBottomPanel() {
  const deviceType = useAppStore((s) => s.deviceType);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<string>("params");

  if (deviceType === "mobile") {
    return (
      <div className="h-10 shrink-0 flex items-center justify-center gap-2 bg-surface-container-low border-t border-white/5 text-[10px] text-on-surface-variant/60">
        <button
          type="button"
          onClick={() => { setExpanded(true); setTab("params"); }}
          className="px-2 py-1 rounded hover:bg-white/5 transition-colors"
        >
          <ChevronUp className="h-3 w-3 inline mr-1" />参数
        </button>
        {expanded && (
          <div className="absolute bottom-10 left-0 right-0 bg-surface-container-low border-t border-white/10 p-3 max-h-[50vh] overflow-y-auto z-50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold">
                {tab === "params" ? "参数" : tab === "energy" ? "能量" : "相空间"}
              </span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-on-surface-variant/50 hover:text-on-surface"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1 mb-2">
              {["params", "energy", "phase"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-2 py-0.5 text-[10px] rounded ${
                    tab === t ? "bg-primary/20 text-primary" : "text-on-surface-variant"
                  }`}
                >
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

  return (
    <div className="shrink-0 bg-surface-container-low border-t border-white/5">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full h-10 flex items-center justify-center gap-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
        >
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
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-2 p-1 rounded hover:bg-white/10"
            >
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
  useChaosUpdater();

  const { butterflyActive, enterButterfly, exitButterfly } = useButterflyMode();
  const { isRunning, disabled, setRunning, resetToDefaults } = useSimulationControls();
  const { forceActive, toggle: toggleForce, exit: exitForce } = useForceAnalysis();
  const { isActive: sonificationActive, toggle: toggleSonification } = useSonification();

  const deviceType = useAppStore((s) => s.deviceType);
  const isDesktop = deviceType === "desktop";

  const lyapunovExponent = useSimulationStore((s) => s.lyapunovExponent);
  const isSimulationActive = useSimulationStore((s) => s.isSimulationActive);
  const simulationTime = useSimulationStore((s) => s.t);

  // GUI 视觉状态：摆体材质、环境、时间反演面板显隐
  const [pendulumMaterial, setPendulumMaterial] = useState<PendulumMaterialType>("metal");
  const [environment, setEnvironment] = useState<EnvironmentPreset>("bright-stage");
  const [timeReversalOpen, setTimeReversalOpen] = useState(false);

  // 键盘快捷键：空格切换受力分析，Esc 关闭受力/蝴蝶/反演面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggleForce();
      } else if (e.key === "Escape") {
        exitForce();
        if (butterflyActive) {
          exitButterfly();
        }
        setTimeReversalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleForce, exitForce, butterflyActive, exitButterfly]);

  const handleReset = useCallback(() => {
    resetToDefaults();
  }, [resetToDefaults]);

  const handleToggleRunning = useCallback(() => {
    setRunning(!isRunning);
  }, [isRunning, setRunning]);

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
    <div className="w-full h-full flex flex-col bg-surface">
      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden gap-panel-gap p-panel-gap pb-0">
        {/* 左侧控制面板 (280px) — 桌面端 */}
        {isDesktop && (
          <aside
            data-ui-controls
            data-panel-left
            className="w-[280px] shrink-0 flex flex-col overflow-hidden rounded-lg bg-surface-container-low"
          >
            <div className="flex-1 overflow-y-auto min-h-0">
              <ParamPanel hideGlobalControls />
            </div>
            <div className="shrink-0 p-3 border-t border-white/5">
              <TrailControls
                material={pendulumMaterial}
                environment={environment}
                onMaterialChange={setPendulumMaterial}
                onEnvironmentChange={setEnvironment}
              />
            </div>
          </aside>
        )}

        {/* 中部 3D 舞台 — 唯一明亮区域 */}
        <section data-stage-container className="flex-1 relative overflow-hidden rounded-lg bg-stage">
          <Scene3D
            pendulumMaterial={pendulumMaterial}
            environment={environment}
            showGrid
            enableShadows
            canvasChildren={<TimeReversalTrajectoryOverlay />}
          />

          <ExploreStageOverlay
            isSonificationActive={sonificationActive}
            onSonificationToggle={toggleSonification}
            isDesktop={isDesktop}
            lyapunovExponent={lyapunovExponent}
            isRunning={isRunning}
            isSimulationActive={isSimulationActive}
          />

          {/* 时间反演控制面板 */}
          <TimeReversal
            className={timeReversalOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"}
          />
        </section>

        {/* 右侧面板 (320px) — 桌面端 */}
        {isDesktop && <ExploreRightPanel forceActive={forceActive} />}
      </div>

      {/* 底部工具栏 */}
      <ExploreBottomToolbar
        isRunning={isRunning}
        disabled={disabled}
        onToggleRunning={handleToggleRunning}
        onReset={handleReset}
        forceActive={forceActive}
        onToggleForce={toggleForce}
        onEnterButterfly={enterButterfly}
        timeReversalOpen={timeReversalOpen}
        onToggleTimeReversal={() => setTimeReversalOpen((v) => !v)}
        elapsedSeconds={simulationTime}
        data-ui-controls
        data-panel-bottom
      />

      {/* 平板：可展开底部面板 */}
      {!isDesktop && <TabletBottomPanel />}
    </div>
  );
}
