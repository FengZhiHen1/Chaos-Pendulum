import { Play, Pause, RotateCcw, Eye, GitCompare, Hourglass } from "lucide-react";
import { Button } from "@/shared/view/components/ui/button";

interface ExploreBottomToolbarProps {
  isRunning: boolean;
  disabled: boolean;
  onToggleRunning: () => void;
  onReset: () => void;
  forceActive: boolean;
  onToggleForce: () => void;
  onEnterButterfly: () => void;
  timeReversalOpen: boolean;
  onToggleTimeReversal: () => void;
  className?: string;
}

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
  timeReversalOpen,
  onToggleTimeReversal,
  className = "",
}: ExploreBottomToolbarProps) {
  return (
    <footer
      className={`h-12 shrink-0 w-full bg-surface-container-lowest flex items-center justify-between px-4 select-none ${className}`}
    >
      {/* 左侧：播放控制 */}
      <div className="flex items-center gap-2">
        <Button
          variant={isRunning ? "secondary" : "primary"}
          size="sm"
          disabled={disabled}
          onClick={onToggleRunning}
          title={isRunning ? "暂停仿真" : "启动仿真"}
        >
          {isRunning ? (
            <Pause className="h-3.5 w-3.5 mr-1" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1" />
          )}
          {isRunning ? "暂停" : "播放"}
        </Button>

        <Button
          variant="tertiary"
          size="sm"
          onClick={onReset}
          title="以当前面板参数重置仿真"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          重置
        </Button>
      </div>

      {/* 右侧：实验入口 */}
      <div className="flex items-center gap-2">
        <Button
          variant={forceActive ? "secondary" : "tertiary"}
          size="sm"
          onClick={onToggleForce}
          title="空格键切换受力分析"
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          {forceActive ? "关闭受力" : "受力分析"}
        </Button>

        <Button
          variant={timeReversalOpen ? "secondary" : "tertiary"}
          size="sm"
          onClick={onToggleTimeReversal}
          title="时间反演实验"
        >
          <Hourglass className="h-3.5 w-3.5 mr-1" />
          {timeReversalOpen ? "关闭反演" : "时间反演"}
        </Button>

        <Button
          variant="tertiary"
          size="sm"
          onClick={onEnterButterfly}
          title="进入蝴蝶效应分屏对比"
        >
          <GitCompare className="h-3.5 w-3.5 mr-1" />
          蝴蝶效应
        </Button>
      </div>
    </footer>
  );
}
