import { useAppStore } from "@/stores/useAppStore";
import type { AppMode } from "@/shared/types";
import { ModeSwitch } from "./ModeSwitch";

const modes: { id: AppMode; label: string }[] = [
  { id: "explore", label: "探索" },
  { id: "analyze", label: "分析" },
  { id: "lab", label: "实验" },
  { id: "story", label: "故事" },
];

export function NavBar() {
  const currentMode = useAppStore((s) => s.currentMode);
  const setMode = useAppStore((s) => s.setMode);

  return (
    <nav className="h-12 flex items-center justify-between px-4 border-b border-lab-border bg-lab-panel shrink-0">
      <span className="text-sm font-mono tracking-wider text-lab-accent">
        双摆混沌实验室
      </span>

      <ModeSwitch modes={modes} active={currentMode} onChange={setMode} />

      <div className="w-20" />
    </nav>
  );
}
