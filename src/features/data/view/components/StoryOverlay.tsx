/**
 * StoryOverlay — 故事模式全局覆盖层。
 *
 * 独立于模式切换之外（挂载在 AppShell 层级），确保故事播放期间
 * 模式切换（story→explore→analyze）不会卸载 StoryPlayer 控件。
 */

import { useCallback, useEffect, useState } from "react";
import { useStoryViewModel } from "../../viewModel/hooks/useStoryViewModel";
import { useAppStore } from "@/stores/useAppStore";
import { useSimulationStore } from "@/features/simulation";
import { globalOrbitControlsAdapter } from "../../infrastructure/adapters/orbitControlsAdapterSingleton";
import { StoryPlayer } from "./StoryPlayer";
import type { CameraConfig } from "../../contracts";
import type { AppMode, PendulumParams, InitialConditions } from "@/shared/domain/valueObjects";
import { RefreshCw } from "lucide-react";

interface StageEventData {
  stage: {
    targetMode: AppMode;
    subtitle: string;
    cameraConfig?: CameraConfig;
    params?: Partial<PendulumParams & InitialConditions>;
  };
  index: number;
}

export function StoryOverlay() {
  const viewModel = useStoryViewModel();
  const { playback, play, pause, sync, onEvent, offEvent } = viewModel;
  const [visible, setVisible] = useState(false);

  // 监听 playback 状态，控制覆盖层可见性（不包含 storyEnd 的 setVisible，消除闪烁）
  useEffect(() => {
    setVisible(playback.isPlaying || playback.isInterrupted || playback.progress >= 1);
  }, [playback.isPlaying, playback.isInterrupted, playback.progress]);

  // 控件脉冲高亮——跨模式持久（StoryPage 会随模式切换卸载，此处才是正确的宿主）
  useEffect(() => {
    const ids = playback.highlightedControls;
    if (ids.length === 0) return;

    const elements: Element[] = [];
    for (const id of ids) {
      const els = document.querySelectorAll(`[data-story-highlight="${id}"]`);
      els.forEach((el) => {
        el.classList.add("animate-pulse-glow");
        elements.push(el);
      });
    }

    return () => {
      for (const el of elements) {
        el.classList.remove("animate-pulse-glow");
      }
    };
  }, [playback.highlightedControls]);

  // 故事事件 → 模式切换 + 相机 + 参数 + 导航锁定
  // 修复：storyStart 不再锁定导航（避免阻塞首个 stageEnter 的模式切换）。
  //       锁定移至 stageEnter——在 setMode 成功后锁定，确保故事内部切换不被自锁。
  //       stageEnter 采用"临时解锁→切换→重新锁定"模式，兼容正常推进/首次播放/暂停恢复三种场景。
  const handleStoryEvent = useCallback((event: string, data?: unknown) => {
    switch (event) {
      case "storyStart":
        sync(); // 强制同步引擎状态（play() 在 StoryPage 实例中调用，本实例状态陈旧）
        setVisible(true);
        break;

      case "stageEnter": {
        const d = data as StageEventData | undefined;
        const stage = d?.stage;
        if (!stage) break;

        // ── 步骤 1: 先注入参数 + 同步 store 的 state 字段 ──
        // 必须在 setMode 之前完成——确保 ExplorePage 挂载时 3D 场景读到正确的初始姿态
        if (stage.params) {
          const newParams: Partial<PendulumParams> = {};
          const newIC: Partial<InitialConditions> = {};
          const IC_KEYS = new Set(["theta1", "theta2", "theta1Dot", "theta2Dot"]);
          for (const [k, v] of Object.entries(stage.params)) {
            if (v === undefined) continue;
            if (IC_KEYS.has(k)) {
              (newIC as Record<string, number>)[k] = v as number;
            } else {
              (newParams as Record<string, number>)[k] = v as number;
            }
          }
          if (Object.keys(newParams).length > 0 || Object.keys(newIC).length > 0) {
            const prev = useSimulationStore.getState();
            prev.injectParams(newParams, newIC);
            // 同步 store 的 3D 姿态字段——injectParams 仅更新 initialConditions，
            // 不更新 theta1/theta2/x1/y1/x2/y2/state，Scene3D 渲染的是这些字段
            if (Object.keys(newIC).length > 0) {
              const t1 = newIC.theta1 ?? prev.theta1;
              const t2 = newIC.theta2 ?? prev.theta2;
              const L1 = prev.params.L1;
              const L2 = prev.params.L2;
              const x1 = L1 * Math.sin(t1);
              const y1 = -L1 * Math.cos(t1);
              const x2 = x1 + L2 * Math.sin(t1 + t2);
              const y2 = y1 - L2 * Math.cos(t1 + t2);
              useSimulationStore.setState({
                theta1: t1, theta1Dot: 0,
                theta2: t2, theta2Dot: 0,
                x1, y1, x2, y2,
                kineticEnergy: 0, potentialEnergy: 0, totalEnergy: 0,
                state: { theta1: t1, omega1: 0, theta2: t2, omega2: 0 },
              });
            }
          }
        }

        // ── 步骤 2: 启动仿真 ──
        {
          const sim = useSimulationStore.getState();
          if (!sim.isRunning) sim.setRunning(true);
        }

        // ── 步骤 3: 模式切换（3D 场景此时挂载，读到步骤 1 的姿态） ──
        if (stage.targetMode) {
          const app = useAppStore.getState();
          if (app.isNavigationLocked) app.unlockNavigation();
          app.setMode(stage.targetMode);
          app.lockNavigation("故事播放中");
        }

        if (stage.cameraConfig) {
          const { azimuth, elevation, distance } = stage.cameraConfig;
          globalOrbitControlsAdapter.setCameraTarget(azimuth, elevation, distance);
        }

        sync();
        break;
      }

      case "storyEnd":
      case "storyInterrupted":
        useAppStore.getState().unlockNavigation();
        break;
    }
  }, []);

  useEffect(() => {
    onEvent(handleStoryEvent);
    return () => { offEvent(handleStoryEvent); };
  }, [onEvent, offEvent, handleStoryEvent]);

  // 仿真健康看门狗——故事播放中若仿真意外停止（如 RKF45 数值发散），自动恢复
  useEffect(() => {
    if (!playback.isPlaying) return;
    const interval = setInterval(() => {
      const sim = useSimulationStore.getState();
      if (!sim.isRunning && !sim.isPendulumStopped) {
        sim.resetToDefaults();
        // resetToDefaults 触发 bridge 的 reset + resetTrigger 递增；
        // store 内 isRunning 被设为 false，等待 reset 完成后重新启动
        setTimeout(() => {
          const s = useSimulationStore.getState();
          if (!s.isRunning) s.setRunning(true);
        }, 150);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [playback.isPlaying]);

  if (!visible) return null;

  const isPlaying = playback.isPlaying;
  const isInterrupted = playback.isInterrupted;
  const isFinished = !playback.isPlaying && !playback.isInterrupted && playback.progress >= 1;

  return (
    <div className="absolute inset-0 z-story-overlay pointer-events-none">
      {/* 播放中全屏点击拦截 */}
      {isPlaying && (
        <div
          onClick={() => pause()}
          className="absolute inset-0 cursor-pointer pointer-events-auto"
          title="点击任意位置暂停故事"
        />
      )}

      {/* 底部播放器 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pointer-events-auto">
        <StoryPlayer viewModel={viewModel} />

        {isFinished && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={play}
              className="flex items-center gap-2 px-5 py-2 rounded-xl
                         bg-primary text-on-surface text-sm font-medium
                         hover:bg-primary-hover transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              重新播放
            </button>
          </div>
        )}

        {isInterrupted && !isPlaying && (
          <p className="text-center mt-3 text-xs text-on-surface-variant/60">
            演示已暂停 — 点击「▶」继续，或手动探索后返回
          </p>
        )}
      </div>
    </div>
  );
}
