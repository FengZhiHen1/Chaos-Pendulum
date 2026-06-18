import { useState } from "react";
import { ChevronDown, Maximize2, Map, Target } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/view/components/ui/select";
import { useExploreStore } from "../../store";
import type { ViewPreset } from "../../contracts";
import type { EnvironmentPreset } from "./Scene3D";

type TrailLength = 50 | 200 | 1000 | 0 | -1;

interface TrailControlsProps {
  environment: EnvironmentPreset;
  onEnvironmentChange: (environment: EnvironmentPreset) => void;
}

const VIEW_OPTIONS: { value: ViewPreset; label: string; icon: React.ElementType }[] = [
  { value: "side", label: "侧视", icon: Maximize2 },
  { value: "top", label: "俯视", icon: Map },
  { value: "chaos", label: "跟随", icon: Target },
];

const ENVIRONMENT_OPTIONS: { value: EnvironmentPreset; label: string }[] = [
  { value: "dark-lab", label: "暗室聚光" },
  { value: "white-teaching", label: "纯白教学" },
];

const TRAIL_OPTIONS: { value: TrailLength; label: string; hint: string }[] = [
  { value: 50, label: "短", hint: "50 帧 (~0.8s)" },
  { value: 200, label: "中", hint: "200 帧 (~3.3s)" },
  { value: 1000, label: "长", hint: "1000 帧 (~16.7s)" },
  { value: 0, label: "无限", hint: "持续累积不清除" },
  { value: -1, label: "周期", hint: "检测到完整周期后循环覆盖" },
];

/**
 * 尾迹与视图控制 —— 可折叠面板。
 *
 * 包含：3D 视角预设、环境背景、尾迹持久度。
 */
export function TrailControls({
  environment,
  onEnvironmentChange,
}: TrailControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const viewPreset = useExploreStore((s) => s.viewPreset);
  const setViewPreset = useExploreStore((s) => s.setViewPreset);
  const trailLength = useExploreStore((s) => s.trailLength);
  const setTrailLength = useExploreStore((s) => s.setTrailLength);

  return (
    <div className="rounded-lg bg-surface-container-lowest/50 border border-white/5 overflow-hidden">
      {/* 折叠头 */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-on-surface hover:text-on-surface transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span>尾迹与视图</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-on-surface-variant transition-transform duration-quick",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          {/* 视角预设 */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-on-surface-variant/70">视角预设</span>
            <div className="flex gap-1">
              {VIEW_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = viewPreset === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setViewPreset(opt.value)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] transition-colors",
                      isActive
                        ? "bg-primary-container text-primary border border-primary/30"
                        : "bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-transparent",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 环境背景 */}
          <div className="space-y-1">
            <span className="text-[10px] text-on-surface-variant/70">环境背景</span>
              <Select
                value={environment}
                onValueChange={(v) => onEnvironmentChange(v as EnvironmentPreset)}
              >
                <SelectTrigger className="h-7 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-[10px]">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>

          {/* 尾迹持久度 */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-on-surface-variant/70">尾迹持久度</span>
            <div className="flex gap-1">
              {TRAIL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  onClick={() => setTrailLength(opt.value)}
                  className={cn(
                    "flex-1 py-1 rounded text-[10px] transition-colors",
                    trailLength === opt.value
                      ? "bg-primary-container text-primary border border-primary/30"
                      : "bg-surface-container-low text-on-surface-variant hover:text-on-surface border border-transparent",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
