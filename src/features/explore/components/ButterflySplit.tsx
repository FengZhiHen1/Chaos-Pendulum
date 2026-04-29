import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useSimulationStore } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../butterfly-store";
import { ButterflyScheduler } from "../butterfly-scheduler";
import { Scene3D } from "./Scene3D";
import { SeparationAlert, DeltaPanel } from "./ButterflyUI";

// ─── 全局调度器（组件卸载时销毁） ─────────────────

let globalButterflyScheduler: ButterflyScheduler | null = null;

function getButterflyScheduler(): ButterflyScheduler {
  if (!globalButterflyScheduler) {
    globalButterflyScheduler = new ButterflyScheduler();
  }
  return globalButterflyScheduler;
}

// ─── CSS 动画注入 ────────────────────────────────

const PULSE_STYLE = `
@keyframes pulse-alert {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1.0; transform: scale(1.03); }
}
`;

// ─── 主组件 ──────────────────────────────────────

interface ButterflySplitProps {
  className?: string;
}

export function ButterflySplit({ className = "w-full h-full" }: ButterflySplitProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);
  const setButterflyDelta = useExploreStore((s) => s.setButterflyDelta);

  const store = useButterflyStore();
  const schedulerRef = useRef(getButterflyScheduler());

  // ── 初始化 ──
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const simStore = useSimulationStore.getState();
    const baseParams = simStore.params;
    const baseState = simStore.state;

    schedulerRef.current.start(baseParams, baseState, butterflyDelta);
  }, [butterflyDelta]);

  // ── Delta 变化时重建 ──
  const prevDeltaRef = useRef(butterflyDelta);
  useEffect(() => {
    if (prevDeltaRef.current === butterflyDelta) return;
    prevDeltaRef.current = butterflyDelta;

    const simStore = useSimulationStore.getState();
    schedulerRef.current.reset(simStore.params, simStore.state, butterflyDelta);
  }, [butterflyDelta]);

  // ── 卸载清理 ──
  useEffect(() => {
    return () => {
      schedulerRef.current.destroy();
      globalButterflyScheduler = null;
    };
  }, []);

  // ── 控制回调 ──
  const handlePlay = useCallback(() => schedulerRef.current.play(), []);
  const handlePause = useCallback(() => schedulerRef.current.pause(), []);
  const handleReset = useCallback(() => {
    const simStore = useSimulationStore.getState();
    schedulerRef.current.reset(simStore.params, simStore.state, butterflyDelta);
  }, [butterflyDelta]);

  const handleDeltaChange = useCallback(
    (deltaDeg: number) => {
      const clamped = Math.max(0, Math.min(10.0, deltaDeg));
      setButterflyDelta(clamped);
    },
    [setButterflyDelta],
  );

  const isDesktop = deviceType === "desktop";

  return (
    <div className={`relative ${className} flex flex-col`}>
      {/* 注入脉冲动画 */}
      <style>{PULSE_STYLE}</style>

      {/* 工具栏 */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ background: "#0a0a14", borderBottom: "1px solid #1a1a2e" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={store.isRunning ? handlePause : handlePlay}
            className="px-3 py-1 rounded text-sm font-medium transition-colors bg-primary text-[#0D1117] hover:opacity-90"
          >
            {store.isRunning ? "暂停" : "播放"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1 rounded text-sm font-medium transition-colors bg-gray-700 text-gray-200 hover:bg-gray-600"
          >
            重置
          </button>
        </div>

        <DeltaPanel
          editMode={store.editMode}
          onEditModeChange={store.setEditMode}
          onDeltaChange={handleDeltaChange}
          deltaDeg={butterflyDelta}
        />
      </div>

      {/* 分屏区域 */}
      <div className="flex-1 relative min-h-0">
        {isDesktop ? (
          <div className="flex w-full h-full">
            {/* 摆 A */}
            <div className="relative flex-1 border-r" style={{ borderColor: "#2A2D34" }}>
              <div className="absolute top-2 left-4 z-10 px-2 py-0.5 rounded text-xs font-bold text-amber-300 bg-black/50">
                摆 A — δ=0
              </div>
              <Scene3D
                pendulumMaterial="metal"
                environment="dark-lab"
                showGrid
                enableShadows
                className="w-full h-full"
                butterflySide="A"
              />
            </div>

            {/* 摆 B */}
            <div className="relative flex-1 border-l" style={{ borderColor: "#2A2D34" }}>
              <div className="absolute top-2 left-4 z-10 px-2 py-0.5 rounded text-xs font-bold text-purple-300 bg-black/50">
                摆 B — δ={butterflyDelta}°
              </div>
              <Scene3D
                pendulumMaterial="metal"
                environment="dark-lab"
                showGrid
                enableShadows
                className="w-full h-full"
                butterflySide="B"
              />
            </div>
          </div>
        ) : (
          /* 非桌面端：单视口 + A/B 切换 */
          <div className="relative w-full h-full">
            <div className="absolute top-2 left-4 z-10 flex gap-2">
              <button
                type="button"
                onClick={() => {}}
                className="px-2 py-0.5 rounded text-xs font-bold text-amber-300 bg-black/50"
              >
                摆 A
              </button>
              <button
                type="button"
                onClick={() => {}}
                className="px-2 py-0.5 rounded text-xs font-bold text-purple-300 bg-black/50"
              >
                摆 B
              </button>
            </div>
            <Scene3D
              pendulumMaterial="metal"
              environment="dark-lab"
              showGrid
              enableShadows
              className="w-full h-full"
            />
          </div>
        )}

        {/* 分离警报 */}
        <SeparationAlert
          triggered={store.separation.isFullyDecoupled}
          separationRad={store.separation.currentSeparation}
        />
      </div>
    </div>
  );
}
