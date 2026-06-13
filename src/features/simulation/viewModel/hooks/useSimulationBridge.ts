/**
 * 仿真桥接 Hook。
 *
 * 在应用初始化时调用一次，连接 Zustand Store 与 Simulation Worker。
 * Phase 2 产物——从 shared/hooks/useSimulationBridge.ts 迁移而来。
 */

import { useEffect } from "react";
import { setupSimulationBridge } from "@/features/simulation";

/**
 * 挂载仿真桥接（一次性 effect）。
 * 在 AppShell 或顶层布局组件中调用。
 */
export function useSimulationBridge(): void {
  useEffect(() => {
    const cleanup = setupSimulationBridge();
    return cleanup;
  }, []);
}
