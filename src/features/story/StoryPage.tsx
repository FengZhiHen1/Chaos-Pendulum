import { Play } from "lucide-react";

/**
 * 故事模式 — 占位页面。
 *
 * 完整功能包含：
 * - 7 阶段自动演示时间轴 (3 分 30 秒)
 * - 电影式字幕 (framer-motion 淡入淡出)
 * - 全屏点击拦截层 (任意位置点击=打断)
 * - 脉冲高亮控件 (蓝色光晕呼吸动画)
 * - 演示模式入口 (一键隐藏所有 UI)
 *
 * 当前状态：评审专用演示功能开发中。
 */
export function StoryPage() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-surface">
      {/* 脉冲 Logo */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-pulse scale-150" />
        <div className="relative w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center">
          <Play className="w-8 h-8 text-violet-400 ml-1" />
        </div>
      </div>

      {/* 标题区 */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-xl font-semibold text-on-surface tracking-wide">
          故事模式
        </h2>
        <p className="text-sm text-on-surface-variant max-w-md text-center leading-relaxed">
          自动演示 7 阶段混沌叙事，从单摆稳定到蝴蝶效应的完整旅程。
          评审专用，一键启动。
        </p>
      </div>

      {/* 阶段预览 */}
      <div className="flex gap-3 mt-2">
        {["intro", "upgrade", "butterfly", "sonification", "analysis", "timereversal", "climax"].map(
          (stage, i) => (
            <div
              key={stage}
              className="flex flex-col items-center gap-1"
            >
              <div className="w-2 h-2 rounded-full bg-surface-container-high" />
              <span className="text-[9px] text-on-surface-variant/60">
                {i + 1}
              </span>
            </div>
          ),
        )}
      </div>

      {/* 状态提示 */}
      <div className="mt-4 px-4 py-2 rounded-full bg-surface-container-low border border-white/5">
        <span className="text-xs text-on-surface-variant">
          评审专用演示 — 即将上线
        </span>
      </div>
    </div>
  );
}
