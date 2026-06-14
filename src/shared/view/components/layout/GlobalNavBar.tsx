import { Compass, BarChart3, FlaskConical, Play, Eye, Volume2, VolumeX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/view/components/ui/tabs";
import { useAppStore } from "@/stores/useAppStore";
import { useExploreStore } from "@/features/explore";
import { useDemoModeViewModel } from "@/features/data/viewModel/hooks/useDemoModeViewModel";
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
 * 全局导航栏 — 4 个模式切换 + 演示模式入口 + 声效入口。
 *
 * 设计规范：
 * - 桌面端：顶部水平 Tabs，48px 高度
 * - 移动端：底部水平 Tabs，含 safe-area
 * - Active mode: primary 文字 + 底部彩色指示条
 * - 故事模式按钮非激活时带脉冲动画（首次引导）
 * - 桌面端右侧：声效开关、演示模式开关
 */
export function GlobalNavBar() {
  const activeMode = useAppStore((s) => s.activeMode);
  const modeRegistry = useAppStore((s) => s.modeRegistry);
  const deviceType = useAppStore((s) => s.deviceType);
  const setMode = useAppStore((s) => s.setMode);

  const isDesktop = deviceType === "desktop";

  // ── 声效状态（由 ExplorePage 中的 useSonification 监听并驱动引擎） ──
  const sonificationEnabled = useExploreStore((s) => s.sonificationEnabled);
  const setSonificationEnabled = useExploreStore((s) => s.setSonificationEnabled);

  // ── 演示模式状态 ──
  const {
    isActive: demoActive,
    isTransitioning: demoTransitioning,
    activate: activateDemo,
    deactivate: deactivateDemo,
  } = useDemoModeViewModel();

  const handleSonificationToggle = () => {
    if (!isDesktop) return;
    setSonificationEnabled(!sonificationEnabled);
  };

  const handleDemoToggle = () => {
    if (demoTransitioning) return;
    if (demoActive) {
      deactivateDemo();
    } else {
      activateDemo();
    }
  };

  return (
    <div className="flex items-center justify-between w-full">
      <Tabs value={activeMode} onValueChange={(v) => setMode(v as AppMode)}>
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

      {/* 桌面端右侧：声效入口 + 演示模式入口 */}
      {isDesktop && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSonificationToggle}
            title={sonificationEnabled ? "关闭物理声效" : "开启物理声效"}
            className={`
              flex items-center justify-center w-8 h-8 rounded-full border
              transition-all duration-quick
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow
              ${sonificationEnabled
                ? "bg-primary-container border-primary/30 text-primary"
                : "bg-surface/90 backdrop-blur border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/30"}
            `}
          >
            {sonificationEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDemoToggle}
            disabled={demoTransitioning}
            title={demoActive ? "退出演示模式" : "进入演示模式"}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-quick
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow
              disabled:opacity-50 disabled:cursor-not-allowed
              ${demoActive
                ? "bg-primary text-on-primary hover:bg-primary-hover"
                : "bg-surface/90 backdrop-blur border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/30 hover:bg-surface"}
            `}
          >
            <Eye className="h-3.5 w-3.5" />
            {demoActive ? "退出演示" : "演示模式"}
          </button>
        </div>
      )}
    </div>
  );
}
