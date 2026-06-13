import { cn } from "@/shared/infrastructure/cn";
import { useExploreStore } from "../store";

type TrailLength = 50 | 200 | 1000 | 0 | -1;

const OPTIONS: { value: TrailLength; label: string; hint: string }[] = [
  { value: 50, label: "短", hint: "50 帧 (~0.8s)" },
  { value: 200, label: "中", hint: "200 帧 (~3.3s)" },
  { value: 1000, label: "长", hint: "1000 帧 (~16.7s)" },
  { value: 0, label: "无限", hint: "持续累积不清除" },
  { value: -1, label: "周期", hint: "检测到完整周期后循环覆盖" },
];

export function TrailControls() {
  const trailLength = useExploreStore((s) => s.trailLength);
  const setTrailLength = useExploreStore((s) => s.setTrailLength);

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-on-surface-variant mr-1 shrink-0">尾迹</span>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTrailLength(opt.value)}
          title={opt.hint}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded transition-colors",
            trailLength === opt.value
              ? "bg-primary-container text-primary border border-primary/30"
              : "text-on-surface-variant hover:text-on-surface hover:bg-white/5 border border-transparent",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
