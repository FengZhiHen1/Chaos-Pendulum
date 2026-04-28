import { useEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { ParamPanel } from "@/features/simulation";
import { setupSimulationBridge } from "@/features/simulation";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { NavBar } from "./NavBar";

export function AppShell() {
  const currentMode = useAppStore((s) => s.currentMode);

  // 建立 Store → Worker bridge（仅一次）
  useEffect(() => {
    const cleanup = setupSimulationBridge();
    return cleanup;
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen w-screen flex flex-col bg-lab-dark text-white">
        <NavBar />

        <div className="flex-1 flex overflow-hidden">
          {/* 主内容区 */}
          <main className="flex-1 relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-lab-border">
              <p className="text-lg">模式「{currentMode}」— 待实现</p>
            </div>
          </main>

          {/* 参数控制侧栏 — 桌面端固定 */}
          <aside className="hidden lg:block w-72 shrink-0">
            <ParamPanel />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
