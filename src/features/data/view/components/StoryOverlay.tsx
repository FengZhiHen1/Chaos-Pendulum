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
import type { AppMode, PendulumParams } from "@/shared/domain/valueObjects";
import { RefreshCw } from "lucide-react";

interface StageEventData {
  stage: {
    targetMode: AppMode;
    subtitle: string;
    cameraConfig?: CameraConfig;
    params?: Partial<PendulumParams>;
  };
  index: number;
}

export function StoryOverlay() {
  const viewModel = useStoryViewModel();
  const { playback, play, pause, onEvent, offEvent } = viewModel;
  const [visible, setVisible] = useState(false);

  // 监听 playback 状态，控制覆盖层可见性
  useEffect(() => {
    setVisible(playback.isPlaying || playback.isInterrupted || playback.progress >= 1);
  }, [playback.isPlaying, playback.isInterrupted, playback.progress]);

  // 故事事件 → 模式切换 + 相机 + 参数 + 导航锁定
  const handleStoryEvent = useCallback((event: string, data?: unknown) => {
    const app = useAppStore.getState();

    switch (event) {
      case "storyStart":
        app.lockNavigation("故事播放中");
        setVisible(true);
        break;

      case "stageEnter": {
        const d = data as StageEventData | undefined;
        const stage = d?.stage;
        if (!stage) break;

        if (stage.targetMode) {
          app.setMode(stage.targetMode);
        }

        if (stage.cameraConfig) {
          const { azimuth, elevation, distance } = stage.cameraConfig;
          globalOrbitControlsAdapter.setCameraTarget(azimuth, elevation, distance);
        }

        if (stage.params) {
          const params = stage.params;
          const newParams: Partial<PendulumParams> = {};
          const newIC: Record<string, number> = {};
          const IC_KEYS = new Set(["theta1", "theta2", "theta1Dot", "theta2Dot"]);
          for (const [k, v] of Object.entries(params)) {
            if (v === undefined) continue;
            if (IC_KEYS.has(k)) {
              newIC[k] = v as number;
            } else {
              (newParams as Record<string, number>)[k] = v as number;
            }
          }
          if (Object.keys(newParams).length > 0 || Object.keys(newIC).length > 0) {
            const simStore = useSimulationStore.getState();
            simStore.injectParams(newParams, newIC as Record<string, number>);
          }
        }
        break;
      }

      case "storyEnd":
      case "storyInterrupted":
        app.unlockNavigation();
        if (event === "storyEnd") setVisible(false);
        break;
    }
  }, []);

  useEffect(() => {
    onEvent(handleStoryEvent);
    return () => { offEvent(handleStoryEvent); };
  }, [onEvent, offEvent, handleStoryEvent]);

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
