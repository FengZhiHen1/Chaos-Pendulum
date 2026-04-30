import { useState, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../butterfly-store";
import { useButterflySimulation } from "../hooks/useButterflySimulation";
import { Scene3D } from "./Scene3D";
import { SeparationAlert, DeltaPanel } from "./ButterflyUI";

const PULSE_STYLE = `
@keyframes pulse-alert {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1.0; transform: scale(1.03); }
}
`;

const BALL_COLOR_A = "#f0c040"; // 金色
const BALL_COLOR_B = "#a855f7"; // 紫色

interface ButterflySplitProps {
  className?: string;
}

export function ButterflySplit({ className = "w-full h-full" }: ButterflySplitProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);

  const store = useButterflyStore();
  const { handlePlay, handlePause, handleReset, handleDeltaChange } =
    useButterflySimulation();

  const isDesktop = deviceType === "desktop";

  // ── 非桌面端：活跃视口切换 ──
  const [activeSide, setActiveSide] = useState<"A" | "B">("A");

  const switchToA = useCallback(() => setActiveSide("A"), []);
  const switchToB = useCallback(() => setActiveSide("B"), []);

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
                ballColor={BALL_COLOR_A}
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
                ballColor={BALL_COLOR_B}
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
                onClick={switchToA}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-opacity ${
                  activeSide === "A"
                    ? "text-amber-300 bg-black/70 ring-1 ring-amber-500/50"
                    : "text-amber-300/50 bg-black/30"
                }`}
              >
                摆 A
              </button>
              <button
                type="button"
                onClick={switchToB}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-opacity ${
                  activeSide === "B"
                    ? "text-purple-300 bg-black/70 ring-1 ring-purple-500/50"
                    : "text-purple-300/50 bg-black/30"
                }`}
              >
                摆 B
              </button>
            </div>
            <Scene3D
              pendulumMaterial="metal"
              ballColor={activeSide === "A" ? BALL_COLOR_A : BALL_COLOR_B}
              environment="dark-lab"
              showGrid
              enableShadows
              className="w-full h-full"
              butterflySide={activeSide}
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
