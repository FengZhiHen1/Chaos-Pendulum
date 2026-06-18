/**
 * 模块: story.ui.StoryPage
 * 职责: 故事模式页面——7 阶段自动演示 + 电影式字幕 + 点击打断。
 *       消费 useStoryViewModel Hook，委托 StoryPlayer 渲染播放控件。
 * 边界:
 *   - 本文件仅处理 ViewModel 绑定、事件接线和 JSX 渲染
 *   - 引擎逻辑在 data/application/useCases/StoryScriptEngineImpl
 */

import { useEffect, useCallback } from "react";
import { Film, RefreshCw } from "lucide-react";
import { useStoryViewModel } from "@/features/data/viewModel/hooks/useStoryViewModel";
import { StoryPlayer } from "@/features/data/view/components/StoryPlayer";
import { useAppStore } from "@/stores/useAppStore";
import { useSimulationStore } from "@/features/simulation";
import { globalOrbitControlsAdapter } from "@/features/data/infrastructure/adapters/orbitControlsAdapterSingleton";
import type { CameraConfig } from "@/features/data/contracts";
import type { AppMode, PendulumParams } from "@/shared/domain/valueObjects";

/** 阶段事件 data 中携带的 stage 信息 */
interface StageEventData {
  stage: {
    targetMode: AppMode;
    subtitle: string;
    cameraConfig?: CameraConfig;
    params?: Partial<PendulumParams>;
  };
  index: number;
}

export function StoryPage() {
  const viewModel = useStoryViewModel();
  const { playback, play, pause, onEvent, offEvent } = viewModel;
  const { isPlaying, isInterrupted, isFinished } = (() => {
    const finished = !playback.isPlaying && !playback.isInterrupted && playback.progress >= 1;
    return {
      isPlaying: playback.isPlaying,
      isInterrupted: playback.isInterrupted,
      isFinished: finished,
    };
  })();

  // ── 故事事件 → 模式切换 + 相机 + 参数 + 导航锁定 ─
  const handleStoryEvent = useCallback((event: string, data?: unknown) => {
    const app = useAppStore.getState();

    switch (event) {
      case "storyStart":
        app.lockNavigation("故事播放中");
        break;

      case "stageEnter": {
        const d = data as StageEventData | undefined;
        const stage = d?.stage;
        if (!stage) break;

        // 1. 切换模式
        if (stage.targetMode) {
          app.setMode(stage.targetMode);
        }

        // 2. 相机姿态（仅在 explore 模式下有效）
        if (stage.cameraConfig) {
          const { azimuth, elevation, distance } = stage.cameraConfig;
          globalOrbitControlsAdapter.setCameraTarget(azimuth, elevation, distance);
        }

        // 3. 参数注入（当前仅在 explore 模式有 3D 场景时生效）
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
        break;
    }
  }, []);

  useEffect(() => {
    onEvent(handleStoryEvent);
    return () => {
      offEvent(handleStoryEvent);
    };
  }, [onEvent, offEvent, handleStoryEvent]);

  // ── 组件卸载时清理 ──────────────────────────────
  useEffect(() => {
    return () => {
      const app = useAppStore.getState();
      if (app.isNavigationLocked) {
        app.unlockNavigation();
      }
    };
  }, []);

  // ── 控件脉冲高亮 ────────────────────────────────
  // 根据当前阶段的 highlightedControls 数组，对带有
  // data-story-highlight="id" 属性的 DOM 元素添加/移除脉冲动画。
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

  // ── 点击任意位置打断 ────────────────────────────
  const handleOverlayClick = () => {
    if (isPlaying) {
      pause();
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-surface relative">
      {/* 播放中全屏点击拦截层 */}
      {isPlaying && (
        <div
          onClick={handleOverlayClick}
          className="absolute inset-0 z-20 cursor-pointer"
          title="点击任意位置暂停故事"
        />
      )}

      {/* 空闲状态 —— 播放按钮 + 介绍 */}
      {!isPlaying && !isInterrupted && !isFinished && (
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-violet-500/10 animate-pulse scale-150" />
            <div className="relative w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center border border-white/5">
              <Film className="w-8 h-8 text-violet-400" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-xl font-semibold text-on-surface tracking-wide">
              故事模式
            </h2>
            <p className="text-sm text-on-surface-variant max-w-md leading-relaxed">
              自动演示 7 阶段混沌叙事，从单摆稳定到蝴蝶效应的完整旅程。
              <br />
              总时长 3 分 30 秒，电影式字幕配合自动模式切换。
            </p>
          </div>

          <button
            onClick={play}
            className="px-8 py-3 rounded-xl bg-primary text-on-surface font-medium
                       shadow-lg shadow-primary/20 hover:bg-primary-hover
                       transition-all active:scale-95"
          >
            开始演示
          </button>
        </div>
      )}

      {/* 播放中 / 暂停中 / 已结束 —— 播放器 */}
      {(isPlaying || isInterrupted || isFinished) && (
        <div className="relative z-10 w-full max-w-lg px-4">
          <StoryPlayer viewModel={viewModel} />

          {/* 结束后操作 */}
          {isFinished && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={play}
                className="flex items-center gap-2 px-4 py-2 rounded-lg
                           bg-primary text-on-surface text-sm font-medium
                           hover:bg-primary-hover transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                重新播放
              </button>
            </div>
          )}
        </div>
      )}

      {/* 暂停中提示 */}
      {isInterrupted && !isPlaying && (
        <p className="relative z-10 mt-4 text-xs text-on-surface-variant/60">
          演示已暂停 — 点击"▶"继续，或手动探索后返回
        </p>
      )}
    </div>
  );
}
