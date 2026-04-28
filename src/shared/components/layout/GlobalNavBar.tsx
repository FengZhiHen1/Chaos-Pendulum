import { Compass, BarChart3, FlaskConical, Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useAppStore } from "@/stores/useAppStore";
import type { AppMode, ModeDefinition } from "@/shared/types";

const ICON_MAP: Record<ModeDefinition["iconName"], LucideIcon> = {
  Compass,
  BarChart3,
  FlaskConical,
  Play,
};

/** 模式 → 指示条颜色 */
const INDICATOR_COLORS: Record<AppMode, string> = {
  explore: "bg-blue-500",
  analyze: "bg-emerald-500",
  lab: "bg-amber-500",
  story: "bg-violet-500",
};

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
            ? "gap-1"
            : "w-full justify-around gap-0"
        }
      >
        {modeRegistry.map((mode) => {
          const Icon = ICON_MAP[mode.iconName];
          const isActive = mode.id === activeMode;

          return (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
              className="relative gap-1.5 transition-all duration-200 data-[state=active]:text-white"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isDesktop ? mode.label : mode.shortLabel}
              </span>

              {/* 激活态底部色条 */}
              {isActive && (
                <span
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full ${INDICATOR_COLORS[mode.id]} transition-all duration-200`}
                />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
