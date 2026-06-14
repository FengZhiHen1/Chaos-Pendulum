import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/shared/infrastructure/cn";

interface SonificationToggleProps {
  /** 声音化是否激活 */
  isActive: boolean;
  /** 切换回调 */
  onToggle: () => void;
  /** 是否为桌面端（非桌面端不渲染） */
  isDesktop: boolean;
  className?: string;
  size?: "sm" | "md";
}

/**
 * 声效开关 —— 仅渲染为图标按钮的展示组件。
 *
 * 状态数据与切换回调由父组件通过 Props 注入。
 */
export function SonificationToggle({
  isActive,
  onToggle,
  isDesktop,
  className = "",
  size = "md",
}: SonificationToggleProps) {
  if (!isDesktop) return null;

  const isSmall = size === "sm";

  return (
    <button
      type="button"
      onClick={onToggle}
      title={isActive ? "关闭物理声效" : "开启物理声效"}
      className={cn(
        "flex items-center justify-center rounded-full border transition-all duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus-glow",
        isActive
          ? "bg-primary-container border-primary/30 text-primary"
          : "bg-surface/90 backdrop-blur border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/30",
        isSmall ? "w-8 h-8" : "w-10 h-10",
        className,
      )}
    >
      {isActive ? (
        <Volume2 className={isSmall ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : (
        <VolumeX className={isSmall ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
    </button>
  );
}
