import { useState, useCallback } from "react";
import { GitCompare, X } from "lucide-react";
import { Scene3D } from "./components/Scene3D";
import { TimeReversal } from "./components/TimeReversal";
import { TimeReversalTrajectoryOverlay } from "./components/TimeReversalTrajectory";
import { SonificationToggle } from "./components/SonificationToggle";
import { ButterflySplit } from "./components/ButterflySplit";
import { TrailControls } from "./components/TrailControls";
import { useSimulationStore, getScheduler } from "@/features/simulation";

/**
 * 探索模式根页面。
 *
 * 包含：
 * - EXP-01: 3D 仿真场景（主视觉区）
 * - EXP-02: 运动尾迹渲染（Scene3D 内集成）
 * - EXP-04: 蝴蝶效应对比器（分屏双摆对比 + DeltaPanel）
 * - EXP-05: 时间反演实验（控制栏 + 漂移曲线 + 教学注释 + 3D 轨迹叠加）
 */
export function ExplorePage() {
  const [butterflyActive, setButterflyActive] = useState(false);

  const enterButterfly = useCallback(() => {
    // 暂停主仿真，让蝴蝶效应的独立 Worker 接管
    const store = useSimulationStore.getState();
    if (store.isRunning) {
      getScheduler().pause();
    }
    setButterflyActive(true);
  }, []);

  const exitButterfly = useCallback(() => {
    setButterflyActive(false);
    // 恢复主仿真（如果之前在运行）
    const store = useSimulationStore.getState();
    if (!store.isRunning) {
      getScheduler().resume();
    }
  }, []);

  return (
    <div className="w-full h-full relative">
      {butterflyActive ? (
        <>
          <ButterflySplit className="w-full h-full" />
          {/* 退出蝴蝶效应按钮 */}
          <button
            type="button"
            onClick={exitButterfly}
            className="absolute top-3 right-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            退出蝴蝶效应
          </button>
        </>
      ) : (
        <>
          <Scene3D
            pendulumMaterial="metal"
            environment="dark-lab"
            showGrid
            enableShadows
            canvasChildren={<TimeReversalTrajectoryOverlay />}
          />
          <TrailControls />
          <TimeReversal />
          {/* 声音化开关 */}
          <SonificationToggle className="absolute top-3 left-3 z-20" />
          {/* 蝴蝶效应入口按钮 */}
          <button
            type="button"
            onClick={enterButterfly}
            className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 transition-all"
          >
            <GitCompare className="w-3.5 h-3.5" />
            蝴蝶效应
          </button>
        </>
      )}
    </div>
  );
}
