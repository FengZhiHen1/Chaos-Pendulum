import { useState, useCallback } from "react";
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
            {initError ? (
              "启动失败"
            ) : !workersReady ? (
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

      {/* 单视口 + A/B 切换（所有平台统一，避免双 WebGL context 导致 GPU 资源耗尽） */}
      <div
        className={cn(
          "flex-1 relative min-h-0",
          isFullyDecoupled && "animate-alert-edge",
        )}
      >
        <div className="relative w-full h-full">
          {/* 侧边标签 + A/B 切换 */}
          <div className="absolute top-3 left-4 z-10 flex gap-2">
            <button
              type="button"
              onClick={switchToA}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-bold transition-all",
                activeSide === "A"
                  ? "text-amber-300 bg-black/70 ring-1 ring-amber-500/50"
                  : "text-amber-300/50 bg-black/30",
              )}
            >
              摆 A — δ=0
            </button>
            <button
              type="button"
              onClick={switchToB}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-bold transition-all",
                activeSide === "B"
                  ? "text-purple-300 bg-black/70 ring-1 ring-purple-500/50"
                  : "text-purple-300/50 bg-black/30",
              )}
            >
              摆 B — δ={butterflyDelta}°
            </button>
          </div>

          {/* 分离度指示器（替代暗色裂隙） */}
          {isFullyDecoupled && (
            <div className="absolute top-3 right-4 z-10 px-2 py-0.5 rounded text-[10px] font-bold text-separation-alert bg-black/70 ring-1 ring-separation-alert/50">
              |Δθ| = {(separationRad * 180 / Math.PI).toFixed(1)}°
            </div>
          )}

          <Scene3D
            ballColor={activeSide === "A" ? BALL_COLOR_A : BALL_COLOR_B}
            environment="dark-lab"
            showGrid
            enableShadows
            className="w-full h-full"
            butterflySide={activeSide}
          />
        </div>

        {/* 分离警报 */}
        <SeparationAlert
          triggered={isFullyDecoupled}
          separationRad={separationRad}
        />
      </div>
    </div>
  );
}
