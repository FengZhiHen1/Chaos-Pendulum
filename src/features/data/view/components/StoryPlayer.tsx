/**
 * StoryPlayer — 故事脚本播放器。
 *
 * 播放/暂停/继续/停止控制 + 进度条 + 底部电影式字幕。
 * 播放期间禁用模式切换（由 StoryScriptEngine 锁定导航栏）。
 *
 * 边界:
 *   - 依赖: useStoryViewModel (ViewModel Hook)
 * 禁止: import application/domain/infrastructure
 */

import { useEffect, useRef } from "react";
import type { StoryPlayerProps } from "../contracts/StoryPlayer.contract";

/** 进度条动画过渡时长 (ms) */
const PROGRESS_TRANSITION_MS = 200;

/** 阶段标签 */
const STAGE_LABELS = [
  "单摆可预测", "双摆不可预测", "蝴蝶效应",
  "听见混沌", "结构中的复杂性", "不可逆性",
  "确定性随机",
];

export function StoryPlayer({ viewModel }: StoryPlayerProps) {
  const {
    playback, isLoading, error,
    play, pause, resume, stop, clearError,
  } = viewModel;

  const { isPlaying, isInterrupted, currentStage, totalStages, progress, currentSubtitle } = playback;
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  // 字幕淡入淡出
  useEffect(() => {
    if (subtitleRef.current) {
      subtitleRef.current.classList.remove("opacity-0", "translate-y-2");
      void subtitleRef.current.offsetWidth; // 触发重排
      subtitleRef.current.classList.add("opacity-0", "translate-y-2");
      requestAnimationFrame(() => {
        subtitleRef.current?.classList.remove("opacity-0", "translate-y-2");
      });
    }
  }, [currentSubtitle]);

  const hasError = error !== null;
  const canPlay = !isPlaying && !isLoading;
  const canResume = isInterrupted && !isPlaying;

  return (
    <div className="rounded-lg bg-surface-container-low p-5 space-y-5">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="text-on-surface font-semibold text-sm">故事模式</h2>
        <span className="text-on-surface-variant text-xs font-mono">
          {currentStage + 1} / {totalStages} · {
            STAGE_LABELS[currentStage] ?? `阶段 ${currentStage + 1}`
          }
        </span>
      </div>

      {/* 进度条 */}
      <div className="space-y-1.5">
        <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${progress * 100}%`,
              transitionDuration: `${PROGRESS_TRANSITION_MS}ms`,
            }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-variant text-[10px] font-mono">
            {Math.floor(progress * 210)}s
          </span>
          <span className="text-on-surface-variant text-[10px] font-mono">3:30</span>
        </div>
      </div>

      {/* 字幕条 */}
      <div className="min-h-[3rem] flex items-center justify-center
                      rounded-md bg-surface-container px-4 py-3">
        <p
          ref={subtitleRef}
          className="text-on-surface text-sm text-center leading-relaxed
                     tracking-wide transition-all duration-300"
          style={{ letterSpacing: "0.02em" }}
        >
          {currentSubtitle}
        </p>
      </div>

      {/* 错误提示 */}
      {hasError && (
        <div className="rounded-md bg-red-900/20 px-3 py-2 flex items-start justify-between">
          <span className="text-xs text-red-300">{error.message}</span>
          <button type="button" onClick={clearError}
            className="text-red-400 hover:text-red-300 text-xs ml-2">✕</button>
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex items-center justify-center gap-3">
        {/* 停止 */}
        <button
          type="button"
          onClick={stop}
          disabled={!isPlaying && !isInterrupted}
          className="w-10 h-10 rounded-lg flex items-center justify-center
                     bg-surface-container text-on-surface-variant
                     hover:text-on-surface transition-colors
                     disabled:opacity-30 disabled:cursor-not-allowed"
          title="停止"
        >
          <span className="text-lg leading-none">■</span>
        </button>

        {/* 播放/暂停/继续 */}
        {(canPlay || canResume) ? (
          <button
            type="button"
            onClick={canResume ? resume : play}
            disabled={isLoading}
            className="w-14 h-14 rounded-xl flex items-center justify-center
                       bg-primary text-on-surface shadow-lg shadow-primary/20
                       hover:bg-primary-hover transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
            title={canResume ? "继续" : "播放"}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-on-surface border-t-transparent
                               rounded-full animate-spin" />
            ) : (
              <span className="text-2xl leading-none ml-0.5">
                {canResume ? "▶" : "▶"}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={pause}
            className="w-14 h-14 rounded-xl flex items-center justify-center
                       bg-primary-container text-primary
                       hover:bg-primary hover:text-on-surface transition-all"
            title="暂停"
          >
            <span className="text-xl leading-none">⏸</span>
          </button>
        )}
      </div>
    </div>
  );
}
