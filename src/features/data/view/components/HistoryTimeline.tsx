/**
 * HistoryTimeline — 历史回放时间轴。
 *
 * 可拖拽水平时间轴 + 分叉参数修改面板 + 幽灵尾迹图例。
 * 所有数据通过 useHistoryPlaybackViewModel 获取。
 *
 * 边界:
 *   - 依赖: useHistoryPlaybackViewModel (ViewModel Hook)
 * 禁止: import application/domain/infrastructure
 */

import { useState, useRef, useCallback } from "react";
import type { HistoryTimelineProps } from "../contracts/HistoryTimeline.contract";

/** 拖拽去抖间隔 (ms) */
const SEEK_DEBOUNCE_MS = 250;

/** 可修改的参数列表 */
const FORKABLE_PARAMS = [
  { key: "m1", label: "上摆质量", unit: "kg" },
  { key: "m2", label: "下摆质量", unit: "kg" },
  { key: "L1", label: "上摆杆长", unit: "m" },
  { key: "L2", label: "下摆杆长", unit: "m" },
  { key: "g", label: "重力加速度", unit: "m/s²" },
  { key: "damping", label: "阻尼系数", unit: "1/s" },
] as const;

export function HistoryTimeline({ viewModel }: HistoryTimelineProps) {
  const {
    playback, isSeeking, isForkActive, ghostTrail, isLoading, error,
    seekTo, step, goToLatest, fork, cancelFork, clearError,
  } = viewModel;

  const [isDragging, setIsDragging] = useState(false);
  const [showForkPanel, setShowForkPanel] = useState(false);
  const [forkParams, setForkParams] = useState<Record<string, number>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalTime = playback?.totalTime ?? 0;
  const currentTime = playback?.currentTime ?? 0;
  const progress = totalTime > 0 ? currentTime / totalTime : 0;
  const hasError = error !== null;

  /** 时间轴拖拽处理 */
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const updateFromEvent = (clientX: number) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = ratio * totalTime;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => seekTo(targetTime), SEEK_DEBOUNCE_MS);
    };
    updateFromEvent(e.clientX);
    setIsDragging(true);
    const handleMove = (me: MouseEvent) => updateFromEvent(me.clientX);
    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [totalTime, seekTo]);

  /** 分叉提交 */
  const handleForkSubmit = () => {
    fork(forkParams);
    setShowForkPanel(false);
    setForkParams({});
  };

  if (!playback) {
    return (
      <div className="rounded-lg bg-surface-container-low p-5">
        <p className="text-on-surface-variant text-xs text-center py-6">
          RingBuffer 未就绪——仿真启动后可用
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-surface-container-low p-5 space-y-5">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="text-on-surface font-semibold text-sm">历史回放</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => step(-1)}
            disabled={isLoading || currentTime <= 0}
            className="rounded-md bg-surface-container px-2.5 py-1 text-xs
                       text-on-surface-variant hover:text-on-surface transition-colors
                       disabled:opacity-30"
          >◀ 后退</button>
          <button type="button" onClick={() => step(1)}
            disabled={isLoading || currentTime >= totalTime}
            className="rounded-md bg-surface-container px-2.5 py-1 text-xs
                       text-on-surface-variant hover:text-on-surface transition-colors
                       disabled:opacity-30"
          >前进 ▶</button>
          <button type="button" onClick={goToLatest}
            disabled={!isSeeking || isLoading}
            className="rounded-md bg-primary-container px-2.5 py-1 text-xs
                       text-primary hover:text-on-surface transition-colors
                       disabled:opacity-30"
          >回到实时</button>
        </div>
      </div>

      {/* 时间轴 */}
      <div className="space-y-2">
        <div
          role="slider"
          aria-label="回放时间轴"
          aria-valuemin={0}
          aria-valuemax={totalTime}
          aria-valuenow={currentTime}
          tabIndex={0}
          className="relative w-full h-8 cursor-pointer group"
          onMouseDown={handleTimelineMouseDown}
        >
          {/* 轨道 */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-2
                          rounded-full bg-surface-container overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {/* 拖拽手柄 */}
          <div
            className={`
              absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full
              shadow-lg transition-all
              ${isDragging
                ? "bg-primary scale-125 ring-4 ring-primary/30"
                : "bg-surface-container-high ring-2 ring-primary/60 group-hover:scale-110"
              }
            `}
            style={{ left: `calc(${progress * 100}% - 8px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
          <span>{currentTime.toFixed(1)}s</span>
          <span>{totalTime.toFixed(1)}s</span>
        </div>
      </div>

      {/* 错误提示 */}
      {hasError && (
        <div className="rounded-md bg-red-900/20 px-3 py-2 flex items-start justify-between">
          <span className="text-xs text-red-300">{error.message}</span>
          <button type="button" onClick={clearError}
            className="text-red-400 hover:text-red-300 text-xs ml-2">✕</button>
        </div>
      )}

      {/* 分叉控制 */}
      <div className="space-y-3">
        {!isForkActive ? (
          <button
            type="button"
            onClick={() => setShowForkPanel(!showForkPanel)}
            disabled={!isSeeking || isLoading}
            className="w-full rounded-lg bg-surface-container px-4 py-2.5 text-sm
                       text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high
                       transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ⑂ 从当前位置分叉演化
          </button>
        ) : (
          <div className="space-y-3">
            {/* 幽灵尾迹图例 */}
            <div className="flex items-center gap-3 rounded-md bg-surface-container px-3 py-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  background: ghostTrail?.color ?? "#4488ff",
                  opacity: ghostTrail?.opacity ?? 0.3,
                }}
              />
              <span className="text-on-surface-variant text-xs">
                幽灵尾迹 — 原始轨迹对照
              </span>
            </div>
            <button
              type="button"
              onClick={cancelFork}
              disabled={isLoading}
              className="w-full rounded-lg bg-red-900/20 px-4 py-2.5 text-sm
                         text-red-300 hover:bg-red-900/30 transition-colors
                         disabled:opacity-30"
            >
              取消分叉
            </button>
          </div>
        )}

        {/* 分叉参数面板 */}
        {showForkPanel && (
          <div className="rounded-lg bg-surface-container p-4 space-y-3
                          animate-in fade-in slide-in-from-bottom-2">
            <h3 className="text-on-surface text-xs font-semibold">修改参数</h3>
            <div className="grid grid-cols-2 gap-2">
              {FORKABLE_PARAMS.map((p) => (
                <div key={p.key} className="space-y-1">
                  <label className="text-on-surface-variant text-[10px]">
                    {p.label} ({p.unit})
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    step="0.01"
                    className="w-full rounded-md bg-surface-container-low px-2 py-1.5
                               text-on-surface text-xs font-mono outline-none
                               focus:ring-1 focus:ring-primary/60 transition-all"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v)) {
                        setForkParams((prev) => ({ ...prev, [p.key]: v }));
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleForkSubmit}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold
                         text-on-surface hover:bg-primary-hover transition-colors"
            >
              确认分叉
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
