import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import * as THREE from "three";
import { useExploreStore } from "@/features/explore";
import { useButterflyStore } from "../../store";
import { useButterflySimulation } from "../../viewModel/hooks/useButterflySimulation";
import { SceneContent } from "./Scene3D";
import { SeparationAlert, DeltaPanel } from "./ButterflyUI";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/view/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

const BALL_COLOR_A = "#FBBF24";
const BALL_COLOR_B = "#A78BFA";

interface ButterflySplitProps {
  className?: string;
}

/**
 * 蝴蝶效应分屏对比器 — 单 Canvas 双 View 实现。
 *
 * 使用 @react-three/drei 的 View 组件在单个 WebGL context 内渲染两个独立
 * 视口（左侧摆 A / 右侧摆 B），避免双 Canvas 导致的 GPU 资源耗尽。
 */
export function ButterflySplit({ className = "w-full h-full" }: ButterflySplitProps) {
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

  const viewportARef = useRef<HTMLDivElement>(null);
  const viewportBRef = useRef<HTMLDivElement>(null);

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

      {/* 双视口区域：DOM 层两个 div 定位左右，Canvas 层用 View track 到 div */}
      <div
        className={cn(
          "flex-1 relative min-h-0",
          isFullyDecoupled && "animate-alert-edge",
        )}
      >
        {/* DOM 锚点：Canvas 通过 View.track 将渲染裁剪到这些 div */}
        <div className="absolute inset-0 flex">
          <div ref={viewportARef} className="relative flex-1 min-w-0">
            <div className="absolute top-3 left-4 z-10 px-2 py-0.5 rounded text-xs font-bold text-amber-300 bg-black/50 backdrop-blur pointer-events-none">
              摆 A — δ=0
            </div>
          </div>
          <div
            className={cn(
              "shrink-0 bg-surface transition-all duration-dramatic",
              isFullyDecoupled ? "w-3" : "w-1",
            )}
          />
          <div ref={viewportBRef} className="relative flex-1 min-w-0">
            <div className="absolute top-3 left-4 z-10 px-2 py-0.5 rounded text-xs font-bold text-purple-300 bg-black/50 backdrop-blur pointer-events-none">
              摆 B — δ={butterflyDelta}°
            </div>
            {isFullyDecoupled && (
              <div className="absolute top-3 right-4 z-10 px-2 py-0.5 rounded text-[10px] font-bold text-separation-alert bg-black/70 ring-1 ring-separation-alert/50">
                |Δθ| = {(separationRad * 180 / Math.PI).toFixed(1)}°
              </div>
            )}
          </div>
        </div>

        {/* 单个 Canvas，通过 View 拆分到两个 DOM 区域 */}
        <Canvas
          shadows
          camera={{ fov: 45, position: [3.0, 0.6, 2.2] }}
          frameloop="always"
          style={{ position: "absolute", inset: 0, background: "#1A1D22" }}
          onCreated={({ gl }) => { gl.shadowMap.type = THREE.PCFShadowMap; }}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <View track={viewportARef as any}>
            <SceneContent
              environment="dark-lab"
              enableShadows
              showGrid
              sphereSegments={64}
              cylinderSegments={32}
              butterflySide="A"
              ballColor={BALL_COLOR_A}
              onParamChange={() => {}}
              onNanTrigger={() => {}}
            />
          </View>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <View track={viewportBRef as any}>
            <SceneContent
              environment="dark-lab"
              enableShadows
              showGrid
              sphereSegments={64}
              cylinderSegments={32}
              butterflySide="B"
              ballColor={BALL_COLOR_B}
              onParamChange={() => {}}
              onNanTrigger={() => {}}
            />
          </View>
        </Canvas>

        {/* 分离警报 */}
        <SeparationAlert
          triggered={isFullyDecoupled}
          separationRad={separationRad}
        />
      </div>
    </div>
  );
}
