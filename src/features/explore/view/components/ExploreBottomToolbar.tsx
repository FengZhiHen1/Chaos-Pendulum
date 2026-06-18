import { Play, Pause, RotateCcw, Eye, GitCompare, Hourglass } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface ExploreBottomToolbarProps {
  isRunning: boolean;
  disabled: boolean;
  onToggleRunning: () => void;
  onReset: () => void;
  forceActive: boolean;
  onToggleForce: () => void;
  onEnterButterfly: () => void;
  historyFrames: number;
  onStartTimeReversal: () => void;
  /** 当前仿真时间（秒），用于左侧时间读数 */
  elapsedSeconds?: number;
  className?: string;
}

const toolbarButtonBase =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow";

/**
 * 探索模式底部工具栏。
 *
 * 职责：全局播放控制 + 受力分析 + 蝴蝶效应 + 时间反演入口。
 * 样式：48px 高，surface-container-lowest 背景，无实线边框。
 */
export function ExploreBottomToolbar({
  isRunning,
  disabled,
  onToggleRunning,
  onReset,
  forceActive,
  onToggleForce,
  onEnterButterfly,
  historyFrames,
  onStartTimeReversal,
  elapsedSeconds = 0,
  className = "",
}: ExploreBottomToolbarProps) {
  return (
    <footer
      data-ui-controls
      data-panel-bottom
      data-story-highlight="sim-controls"
      className={cn(
        "h-12 shrink-0 w-full bg-surface-container-lowest flex items-center justify-between px-4 select-none",
        className,
      )}
    >
      {/* 左侧：播放 / 重置 / 仿真时间 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleRunning}
          disabled={disabled}
          title={isRunning ? "暂停仿真" : "启动仿真"}
          className={cn(
            "w-8 h-8 inline-flex items-center justify-center rounded-lg transition-all duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow disabled:opacity-40 disabled:cursor-not-allowed",
            isRunning
              ? "bg-surface-container text-on-surface hover:bg-surface-container-high"
              : "bg-primary text-on-primary hover:bg-primary-hover active:scale-[0.98]",
          )}
        >
          {isRunning ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          title="以当前面板参数重置仿真"
          className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <span className="ml-3 text-[11px] font-mono tabular-nums text-on-surface-variant/60">
          t = {elapsedSeconds.toFixed(2)}s
        </span>
      </div>

      {/* 右侧：实验入口（骨架顺序：受力分析 → 蝴蝶效应 → 时间反演） */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleForce}
          title="空格键切换受力分析"
          className={cn(
            toolbarButtonBase,
            forceActive
              ? "bg-surface-container text-primary border border-primary/30"
              : "bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-transparent hover:border-white/5",
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          受力分析
        </button>

        <button
          type="button"
          onClick={onEnterButterfly}
          data-story-highlight="butterfly-btn"
          title="进入蝴蝶效应分屏对比"
          className={cn(
            toolbarButtonBase,
            "bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-transparent hover:border-white/5",
          )}
        >
          <GitCompare className="h-3.5 w-3.5" />
          蝴蝶效应
        </button>

        <button
          type="button"
          onClick={onStartTimeReversal}
          disabled={historyFrames < 120}
          data-story-highlight="time-reversal"
          title={historyFrames < 120 ? `需要运行 2 秒后才能开始实验（当前 ${(historyFrames / 60).toFixed(1)} 秒）` : "开始时间反演实验 — 验证混沌的数值不可逆性"}
          className={cn(
            toolbarButtonBase,
            "bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-transparent hover:border-white/5",
            historyFrames < 120 && "opacity-40 cursor-not-allowed",
          )}
        >
          <Hourglass className="h-3.5 w-3.5" />
          时间反演
        </button>
      </div>
    </footer>
  );
}
