import { type ReactNode } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useKeyboardShortcuts } from "@/shared/hooks/useKeyboardShortcuts";
import { useSimulationBridge } from "@/shared/hooks/useSimulationBridge";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import type { AppMode } from "@/shared/types";
import { MODE_REGISTRY } from "@/shared/types";
import { GlobalNavBar } from "./GlobalNavBar";
import { ModeErrorBoundary } from "./ModeErrorBoundary";

interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const activeMode = useAppStore((s) => s.activeMode);
  const deviceType = useAppStore((s) => s.deviceType);
  const isDesktop = deviceType === "desktop";

  useKeyboardShortcuts();
  useSimulationBridge();

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
      <div className="h-screen w-screen flex flex-col bg-surface text-on-surface overflow-hidden">
        {/* 桌面端顶部导航 48px — surface-container-lowest, no border */}
        {isDesktop && (
          <nav className="h-12 flex items-center px-6 bg-surface-container-lowest shrink-0 animate-appshell-panel select-none">
            <span className="text-sm font-semibold tracking-wider text-on-surface mr-8 shrink-0">
              双摆混沌实验室
            </span>
            <GlobalNavBar />
          </nav>
        )}

        {/* 主内容区：各模式页面自行管理内部布局 */}
        <main className="flex-1 overflow-hidden relative">
          <ModeErrorBoundary>
            {/* 模式切换时的淡入淡出 — 中央 stage 保持静态 */}
            <div key={activeMode} className="w-full h-full animate-mode-enter">
              {activeContent ?? (
                <div className="h-full flex items-center justify-center text-on-surface-variant">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center">
                      <span className="text-xl text-on-surface-variant">?</span>
                    </div>
                    <p className="text-lg">模式「{activeMode}」— 待实现</p>
                  </div>
                </div>
              )}
            </div>
          </ModeErrorBoundary>
        </main>

        {/* 平板/手机端底部导航 */}
        {!isDesktop && (
          <nav
            className="h-12 flex items-center bg-surface-container-lowest shrink-0 animate-appshell-panel select-none"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 20px)" }}
          >
            <GlobalNavBar />
          </nav>
        )}
      </div>
    </TooltipProvider>
  );
}
