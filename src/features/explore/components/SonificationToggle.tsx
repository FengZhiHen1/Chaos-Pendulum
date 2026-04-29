import { useAppStore } from "@/stores/useAppStore";
import { useSonification } from "../hooks/useSonification";

// ─── 类型 ──────────────────────────────────────────

interface SonificationToggleProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * 声音化开关按钮。
 *
 * 仅桌面端渲染。平板/手机自动隐藏。
 * 点击后通过浏览器自动播放策略验证，激活 Web Audio 引擎。
 */
export function SonificationToggle({
  className = "",
  size = "md",
}: SonificationToggleProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const { isActive, toggle } = useSonification();

  // 非桌面端不渲染
  if (deviceType !== "desktop") return null;

  const isSmall = size === "sm";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`rounded font-medium transition-colors ${className} ${
        isActive
          ? "border-green-500/60 text-green-300 bg-green-500/10 hover:bg-green-500/20"
          : "border-gray-500/50 text-gray-400 bg-transparent hover:text-gray-200 hover:border-gray-400"
      } ${isSmall ? "px-2 py-0.5 text-xs h-[32px]" : "px-3 py-1 text-sm h-[40px]"}`}
      style={{ border: "1px solid" }}
    >
      {isActive ? "🔊 关闭物理声效" : "🔇 开启物理声效"}
    </button>
  );
}
