import { useAppStore } from "@/stores/useAppStore";
import { NavBar } from "./NavBar";

export function AppShell() {
  const currentMode = useAppStore((s) => s.currentMode);

  return (
    <div className="h-screen w-screen flex flex-col bg-lab-dark text-white">
      <NavBar />

      <main className="flex-1 relative overflow-hidden">
        {/* Mode content renders here based on currentMode */}
        <div className="absolute inset-0 flex items-center justify-center text-lab-border">
          <p className="text-lg">模式「{currentMode}」— 待实现</p>
        </div>
      </main>
    </div>
  );
}
