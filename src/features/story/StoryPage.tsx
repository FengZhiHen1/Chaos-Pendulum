/**
 * StoryPage — 故事模式入口页面。
 *
 * 职责：展示故事模式简介 + 开始按钮。
 * 播放期间的 StoryPlayer 由 StoryOverlay 在 AppShell 层级常驻渲染，
 * 不随故事引擎的模式切换（story→explore→analyze）而卸载。
 */

import { useCallback, useEffect } from "react";
import { Film } from "lucide-react";
import { useStoryViewModel } from "@/features/data/viewModel/hooks/useStoryViewModel";
import { useAppStore } from "@/stores/useAppStore";

export function StoryPage() {
  const viewModel = useStoryViewModel();
  const { playback, play } = viewModel;
  const { isPlaying, isInterrupted, isFinished } = (() => {
    const finished = !playback.isPlaying && !playback.isInterrupted && playback.progress >= 1;
    return {
      isPlaying: playback.isPlaying,
      isInterrupted: playback.isInterrupted,
      isFinished: finished,
    };
  })();

  // 组件卸载时清理导航锁
  useEffect(() => {
    return () => {
      const app = useAppStore.getState();
      if (app.isNavigationLocked) {
        app.unlockNavigation();
      }
    };
  }, []);

  // 控件脉冲高亮（与 StoryOverlay 协作）
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

  const handleStart = useCallback(() => {
    play();
  }, [play]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-surface relative">
      {/* 空闲状态 — 播放按钮 + 介绍 */}
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
            onClick={handleStart}
            className="px-8 py-3 rounded-xl bg-primary text-on-surface font-medium
                       shadow-lg shadow-primary/20 hover:bg-primary-hover
                       transition-all active:scale-95"
          >
            开始演示
          </button>
        </div>
      )}

      {/* 播放中/暂停中/已结束 — StoryPlayer 由 StoryOverlay 渲染，
          此页面仅作静态背景过渡 */}
      {(isPlaying || isInterrupted || isFinished) && (
        <div className="flex flex-col items-center gap-4 text-on-surface-variant/40">
          <Film className="w-12 h-12 opacity-20" />
          <p className="text-sm">
            {isFinished ? "演示已结束" : isInterrupted ? "演示已暂停" : "演示进行中…"}
          </p>
        </div>
      )}
    </div>
  );
}
