import { useState, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../../store";
import { useButterflySimulation } from "../../viewModel/hooks/useButterflySimulation";
import { Scene3D } from "./Scene3D";
import { SeparationAlert, DeltaPanel } from "./ButterflyUI";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

// DESIGN: Pendulum A gold-tinted trail #FBBF24 / Pendulum B violet-tinted trail #A78BFA
const BALL_COLOR_A = "#FBBF24"; // 金色摆
const BALL_COLOR_B = "#A78BFA"; // 紫色摆

interface ButterflySplitProps {
  className?: string;
}

/**
 * 蝴蝶效应分屏对比器。
 *
 * 桌面端：左右两个 3D 视口，中央暗色裂隙。
 * 非桌面端：单视口 + A/B 切换。
 */
export function ButterflySplit({ className = "w-full h-full" }: ButterflySplitProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);
  // 使用精确选择器，避免每帧 store 更新触发整个组件树重渲染
  const isBfRunning = useButterflyStore((s) => s.isRunning);
  const isFullyDecoupled = useButterflyStore((s) => s.separation.isFullyDecoupled);
  const separationRad = useButterflyStore((s) => s.separation.currentSeparation);
  const sideAWorkerReady = useButterflyStore((s) => s.sideA.workerReady);
  const sideBWorkerReady = useButterflyStore((s) => s.sideB.workerReady);
  const editMode = useButterflyStore((s) => s.editMode);
  const bfSetEditMode = useButterflyStore((s) => s.setEditMode);
  const { handlePlay, handlePause, handleReset, handleDeltaChange, initError } = useButterflySimulation();

  const isDesktop = deviceType === "desktop";
  const workersReady = sideAWorkerReady && sideBWorkerReady;

  const [activeSide, setActiveSide] = useState<"A" | "B">("A");
  const switchToA = useCallback(() => setActiveSide("A"), []);
  const switchToB = useCallback(() => setActiveSide("B"), []);

  return (
    <div className={cn("relative flex flex-col", className)}>
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-surface-container-lowest border-b border-white/5">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!workersReady && !initError}
            onClick={isBfRunning ? handlePause : handlePlay}
            title={initError ? "仿真引擎启动失败" : !workersReady ? "仿真引擎初始化中…" : undefined}
          >
            {!workersReady ? (
              <span className="h-3.5 w-3.5 mr-1 inline-block border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isBfRunning ? (
              <Pause className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1" />
            )}
            {initError ? "启动失败" : !workersReady ? "初始化…" : isBfRunning ? "暂停" : "播放"}
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重置
          </Button>
        </div>

        <DeltaPanel
          editMode={editMode}
          onEditModeChange={bfSetEditMode}
          onDeltaChange={handleDeltaChange}
          deltaDeg={butterflyDelta}
        />
      </div>

      {/* 分屏区域 */}
      <div
        className={cn(
          "flex-1 relative min-h-0",
          isFullyDecoupled && "animate-alert-edge",
        )}
      >
        {isDesktop ? (
          <div className="flex w-full h-full">
            {/* 摆 A */}
            <div className="relative flex-1 min-w-0">
              <div className="absolute top-3 left-4 z-10 px-2 py-0.5 rounded text-xs font-bold text-amber-300 bg-black/50 backdrop-blur">
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

            {/* 暗色裂隙 */}
            <div
              className={cn(
                "shrink-0 bg-surface transition-all duration-dramatic",
                isFullyDecoupled ? "w-3" : "w-1",
              )}
            />

            {/* 摆 B */}
            <div className="relative flex-1 min-w-0">
              <div className="absolute top-3 left-4 z-10 px-2 py-0.5 rounded text-xs font-bold text-purple-300 bg-black/50 backdrop-blur">
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
          <div className="relative w-full h-full">
            <div className="absolute top-3 left-4 z-10 flex gap-2">
              <button
                type="button"
                onClick={switchToA}
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold transition-opacity",
                  activeSide === "A"
                    ? "text-amber-300 bg-black/70 ring-1 ring-amber-500/50"
                    : "text-amber-300/50 bg-black/30",
                )}
              >
                摆 A
              </button>
              <button
                type="button"
                onClick={switchToB}
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold transition-opacity",
                  activeSide === "B"
                    ? "text-purple-300 bg-black/70 ring-1 ring-purple-500/50"
                    : "text-purple-300/50 bg-black/30",
                )}
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
          triggered={isFullyDecoupled}
          separationRad={separationRad}
        />
      </div>
    </div>
  );
}
