import { Compass, BarChart3, FlaskConical, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/view/components/ui/tabs";
import { useAppStore } from "@/stores/useAppStore";
import type { AppMode, ModeDefinition } from "@/shared/domain/valueObjects";

const ICON_MAP: Record<ModeDefinition["iconName"], LucideIcon> = {
  Compass,
  BarChart3,
  FlaskConical,
  Play,
};

const INDICATOR_COLORS: Record<AppMode, string> = {
  explore: "bg-primary",
  analyze: "bg-emerald-500",
  lab: "bg-amber-500",
  story: "bg-violet-500",
};

const MODE_LABELS: Record<AppMode, string> = {
  explore: "探索",
  analyze: "分析",
  lab: "实验",
  story: "故事",
};

/**
 * 全局导航栏 — 4 个模式切换。
 *
 * 设计规范：
 * - 桌面端：顶部水平 Tabs，48px 高度
 * - 移动端：底部水平 Tabs，含 safe-area
 * - Active mode: primary 文字 + 底部彩色指示条
 * - 故事模式按钮非激活时带脉冲动画（首次引导）
 */
export function GlobalNavBar() {
  const activeMode = useAppStore((s) => s.activeMode);
  const modeRegistry = useAppStore((s) => s.modeRegistry);
  const deviceType = useAppStore((s) => s.deviceType);
  const setMode = useAppStore((s) => s.setMode);

  const isDesktop = deviceType === "desktop";

  return (
    <Tabs
      value={activeMode}
      onValueChange={(v) => setMode(v as AppMode)}
    >
      <TabsList
        className={
          isDesktop
            ? "gap-1 bg-transparent"
            : "w-full justify-around gap-0 bg-transparent"
        }
      >
        {modeRegistry.map((mode) => {
          const Icon = ICON_MAP[mode.iconName];
          const isActive = mode.id === activeMode;
          const isStory = mode.id === "story";

          return (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
              className={`
                relative gap-1.5 transition-all duration-quick
                data-[state=active]:text-primary
                data-[state=inactive]:text-on-surface-variant
                data-[state=inactive]:hover:text-on-surface
                ${isStory && !isActive ? "animate-pulse-glow rounded-lg" : ""}
              `}
              title={`${MODE_LABELS[mode.id]}模式 (快捷键 ${mode.shortcut})`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline text-[13px] font-medium">
                {isDesktop ? mode.label : mode.shortLabel}
              </span>

              {/* 激活态指示条 — 底部彩色下划线 */}
              {isActive && (
                <span
                  className={`
                    absolute -bottom-[2px] left-1/2 -translate-x-1/2
                    h-0.5 w-6 rounded-full ${INDICATOR_COLORS[mode.id]}
                    transition-all duration-smooth
                  `}
                />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
