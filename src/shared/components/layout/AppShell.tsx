import { useEffect, useCallback, type ReactNode } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { ParamPanel, EnergyMonitorPanel, PhaseSpacePanel } from "@/features/simulation";
import { setupSimulationBridge } from "@/features/simulation";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import type { AppMode } from "@/shared/types";
import { MODE_REGISTRY } from "@/shared/types";
import { GlobalNavBar } from "./GlobalNavBar";
import { ModeErrorBoundary } from "./ModeErrorBoundary";

interface AppShellProps {
  children?: ReactNode;
}

const SHORTCUT_MAP: Record<string, AppMode> = {
  "1": "explore",
  "2": "analyze",
  "3": "lab",
  "4": "story",
};

export function AppShell({ children }: AppShellProps) {
  const activeMode = useAppStore((s) => s.activeMode);
  const deviceType = useAppStore((s) => s.deviceType);
  const setMode = useAppStore((s) => s.setMode);
  const isDesktop = deviceType === "desktop";

  useEffect(() => {
    const cleanup = setupSimulationBridge();
    return cleanup;
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const mode = SHORTCUT_MAP[e.key];
      if (mode) setMode(mode);
    },
    [setMode],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const childrenArray = children != null ? Array.from({ length: 4 }, (_, i) => {
    if (Array.isArray(children)) return children[i];
    if (i === 0) return children;
    return undefined;
  }) : [];

  const modeContentMap: Partial<Record<AppMode, ReactNode>> = {};
  MODE_REGISTRY.forEach((m, i) => {
    modeContentMap[m.id] = childrenArray[i];
  });

  const activeContent = modeContentMap[activeMode];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen w-screen flex flex-col bg-lab-dark text-white">
        {isDesktop && (
          <nav className="h-12 flex items-center px-4 border-b border-lab-border bg-lab-panel shrink-0">
            <span className="text-sm font-mono tracking-wider text-lab-accent mr-6 shrink-0">
              双摆混沌实验室
            </span>
            <GlobalNavBar />
          </nav>
        )}

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 relative overflow-hidden">
            <ModeErrorBoundary>
              {activeContent ?? (
                <div className="absolute inset-0 flex items-center justify-center text-lab-border">
                  <p className="text-lg">模式「{activeMode}」— 待实现</p>
                </div>
              )}
            </ModeErrorBoundary>
          </main>

          {isDesktop && (
            <aside className="w-72 shrink-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <ParamPanel />
              </div>
              <div className="shrink-0">
                <EnergyMonitorPanel />
                <PhaseSpacePanel />
              </div>
            </aside>
          )}
        </div>

        {!isDesktop && (
          <nav className="h-12 flex items-center border-t border-lab-border bg-lab-panel shrink-0"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <GlobalNavBar />
          </nav>
        )}
      </div>
    </TooltipProvider>
  );
}
