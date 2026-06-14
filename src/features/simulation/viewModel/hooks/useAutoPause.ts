import { useState, useCallback } from "react";
import { useSimulationStore } from "@/features/simulation/store";
import { useExploreStore } from "@/features/explore/store";
import { useVisibilityChange } from "@/shared/viewModel/hooks/useVisibilityChange";
import { notificationPort } from "@/shared/infrastructure/adapters";

/**
 * 组合 hook：后台时自动暂停仿真 + 声音化；切回时显示"点击继续"Toast。
 * 供 EXP-01（3D 场景）和 EXP-03（声音化引擎）消费。
 */
export function useAutoPause(): { isAutoPaused: boolean; resume: () => void } {
  const [isAutoPaused, setIsAutoPaused] = useState(false);

  const resume = useCallback(() => {
    try {
      useSimulationStore.getState().play();
    } catch {
      /* 静默降级 */
    }
    setIsAutoPaused(false);
  }, []);

  useVisibilityChange({
    onHidden: () => {
      try {
        const store = useSimulationStore.getState();
        if (store.isRunning) {
          store.pause();
          setIsAutoPaused(true);
        }
        // 暂停声音化
        useExploreStore.getState().setSonificationEnabled(false);
      } catch {
        /* 静默降级 */
      }
    },
    onVisible: () => {
      if (isAutoPaused) {
        notificationPort.notify({
          title: "已暂停",
          description: "浏览器切回前台，仿真已自动暂停",
          variant: "info",
          durationMs: 0,
          action: {
            label: "继续",
            onClick: resume,
          },
        });
      }
    },
  });

  return { isAutoPaused, resume };
}
