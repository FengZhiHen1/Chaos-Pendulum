import { RotateCcw, Clock, Film, Sparkles } from "lucide-react";

const STORY_STAGES = [
  { id: "intro", label: "序章", desc: "单摆稳定", time: "0:00" },
  { id: "upgrade", label: "升级", desc: "混沌初现", time: "0:25" },
  { id: "butterfly", label: "蝴蝶", desc: "初始敏感", time: "0:50" },
  { id: "sonification", label: "声效", desc: "听见混沌", time: "1:30" },
  { id: "analysis", label: "分析", desc: "结构之美", time: "2:00" },
  { id: "timereversal", label: "反演", desc: "无法回头", time: "2:30" },
  { id: "climax", label: "终章", desc: "确定性混沌", time: "3:00" },
];

/**
 * 故事模式 — 占位页面（评审专用演示）。
 *
 * 完整功能包含：
 * - 7 阶段自动演示时间轴 (3 分 30 秒)
 * - 电影式字幕 (framer-motion 淡入淡出)
 * - 全屏点击拦截层 (任意位置点击=打断)
 * - 脉冲高亮控件 (蓝色光晕呼吸动画)
 *
 * 当前状态：评审专用演示功能开发中。
 */
export function StoryPage() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 bg-surface relative overflow-hidden">
      {/* 背景装饰 — 微弱网格 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* 脉冲 Logo */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-violet-500/10 animate-pulse scale-150" />
        <div className="absolute inset-0 rounded-full bg-violet-500/5 animate-ping" style={{ animationDuration: "3s" }} />
        <div className="relative w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center border border-white/5">
          <Film className="w-8 h-8 text-violet-400" />
        </div>
      </div>

      {/* 标题区 */}
      <div className="flex flex-col items-center gap-2 relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400/60" />
          <h2 className="text-xl font-semibold text-on-surface tracking-wide">
            故事模式
          </h2>
          <Sparkles className="w-4 h-4 text-violet-400/60" />
        </div>
        <p className="text-sm text-on-surface-variant max-w-md text-center leading-relaxed">
          自动演示 7 阶段混沌叙事，从单摆稳定到蝴蝶效应的完整旅程。
          <br />
          总时长 3 分 30 秒，电影式字幕配合自动模式切换。
        </p>
      </div>

      {/* 阶段时间轴预览 */}
      <div className="flex items-center gap-1 relative z-10">
        {STORY_STAGES.map((stage, i) => (
          <div key={stage.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5 px-2">
              <div className="relative">
                <div className="w-2.5 h-2.5 rounded-full bg-surface-container-high border border-white/[0.08]" />
                {i === 0 && (
                  <div className="absolute inset-0 rounded-full bg-violet-400/40 animate-pulse" />
                )}
              </div>
              <span className="text-[9px] text-on-surface-variant/50">{stage.time}</span>
              <span className="text-[10px] text-on-surface-variant/70 font-medium">{stage.label}</span>
            </div>
            {i < STORY_STAGES.length - 1 && (
              <div className="w-6 h-px bg-white/5 mb-4" />
            )}
          </div>
        ))}
      </div>

      {/* 功能特性预览 */}
      <div className="flex gap-4 relative z-10">
        {[
          { icon: Film, label: "电影字幕" },
          { icon: RotateCcw, label: "自动旋转" },
          { icon: Clock, label: "3分30秒" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-low border border-white/5"
          >
            <item.icon className="w-3 h-3 text-on-surface-variant/50" />
            <span className="text-[10px] text-on-surface-variant/60">{item.label}</span>
          </div>
        ))}
      </div>

      {/* 状态提示 */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="px-4 py-2 rounded-full bg-surface-container-low border border-white/5">
          <span className="text-xs text-on-surface-variant/70">
            评审专用演示 — 即将上线
          </span>
        </div>
        <p className="text-[10px] text-on-surface-variant/40">
          按数字键 4 可快速切换至故事模式预览
        </p>
      </div>
    </div>
  );
}
