import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../../store";
import { useButterflySimulation } from "../../viewModel/hooks/useButterflySimulation";
import { SeparationAlert, DeltaPanel } from "./ButterflyUI";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { Play, Pause, RotateCcw, X } from "lucide-react";

interface ButterflySplitProps {
  activeSide: "A" | "B";
  onSwitchSide: (side: "A" | "B") => void;
  onExit: () => void;
  className?: string;
}

/**
 * 蝴蝶效应 DOM overlay — 复用主 Scene3D Canvas，零 WebGL context 迁移。
 *
 * 组件仅渲染工具栏（播放/暂停/重置/Delta）和分离警报，3D 渲染完全委托给
 * ExplorePage 中始终保持挂载的主 Scene3D Canvas 的 SceneContent（接收 butterflySide prop）。
 */
export function ButterflySplit({
  activeSide, onSwitchSide, onExit, className = "w-full h-full",
}: ButterflySplitProps) {
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);
  const isBfRunning = useButterflyStore((s) => s.isRunning);
  const isFullyDecoupled = useButterflyStore((s) => s.separation.isFullyDecoupled);
  const separationRad = useButterflyStore((s) => s.separation.currentSeparation);
  const sideAWorkerReady = useButterflyStore((s) => s.sideA.workerReady);
  const sideBWorkerReady = useButterflyStore((s) => s.sideB.workerReady);
  const editMode = useButterflyStore((s) => s.editMode);
  const bfSetEditMode = useButterflyStore((s) => s.setEditMode);
  const { handlePlay, handlePause, handleReset, handleDeltaChange, initError } = useButterflySimulation();

  const workersReady = sideAWorkerReady && sideBWorkerReady;

  return (
    <div className={cn("relative flex flex-col", className)}>
      {/* 顶部工具栏 — pointer-events-auto 使交互穿透 overlay */}
      <div className="pointer-events-auto shrink-0 flex items-center justify-between px-4 py-2
        bg-surface-container-lowest/90 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!workersReady && !initError}
            onClick={isBfRunning ? handlePause : handlePlay}
            title={initError ? "仿真引擎启动失败" : !workersReady ? "仿真引擎初始化中…" : undefined}
          >
            {initError ? "启动失败"
              : !workersReady ? "初始化…"
              : isBfRunning ? <><Pause className="h-3.5 w-3.5 mr-1" />暂停</>
              : <><Play className="h-3.5 w-3.5 mr-1" />播放</>}
          </Button>
          <Button variant="tertiary" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />重置
          </Button>

          <span className="text-outline-variant mx-1">|</span>

          {/* A/B 切换 */}
          <Button
            variant={activeSide === "A" ? "primary" : "tertiary"}
            size="sm"
            onClick={() => onSwitchSide("A")}
            className="text-xs"
          >
            摆 A
          </Button>
          <Button
            variant={activeSide === "B" ? "primary" : "tertiary"}
            size="sm"
            onClick={() => onSwitchSide("B")}
            className="text-xs"
          >
            摆 B — δ={butterflyDelta}°
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <DeltaPanel
            editMode={editMode}
            onEditModeChange={bfSetEditMode}
            onDeltaChange={handleDeltaChange}
            deltaDeg={butterflyDelta}
          />

          <Button variant="tertiary" size="sm" onClick={onExit}
            className="text-separation-alert hover:bg-separation-alert/10">
            <X className="h-3.5 w-3.5 mr-1" />退出
          </Button>
        </div>
      </div>

      {/* 分离警报 — 舞台中央 */}
      <SeparationAlert
        triggered={isFullyDecoupled}
        separationRad={separationRad}
      />

      {/* 分离度指示器 — 右上角 */}
      {isFullyDecoupled && (
        <div className="pointer-events-auto absolute top-14 right-4 z-10 px-2 py-0.5 rounded
          text-[10px] font-bold text-separation-alert bg-black/70 ring-1 ring-separation-alert/50">
          |Δθ| = {(separationRad * 180 / Math.PI).toFixed(1)}°
        </div>
      )}
    </div>
  );
}
