import { useEffect, useRef, useState } from "react";
import { useSimulationStore } from "@/features/simulation/store";
import { useExploreStore } from "@/features/explore/store";
import { LONG_RUNNING_CONFIG } from "../constants";
import { notify } from "../notify";

interface UseLongRunningDetectorOptions {
  enabled?: boolean;
}

/**
 * 检测仿真连续运行时长，超过阈值时自动触发降级。
 */
export function useLongRunningDetector(
  options: UseLongRunningDetectorOptions = {},
): { isDegraded: boolean; elapsedMs: number } {
  const { enabled = true } = options;
  const [isDegraded, setIsDegraded] = useState(false);
  const elapsedRef = useRef(0);
  const warnedRef = useRef(false);
  const prevSimTimeRef = useRef<number | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;

    const intervalId = setInterval(() => {
      try {
        const store = useSimulationStore.getState();

        // 防御：页面后台时不累加
        if (!isVisibleRef.current) return;

        // 检测重置：simTime 倒退说明仿真被重置
        const currentSimTime = store.t;
        if (
          prevSimTimeRef.current !== null &&
          currentSimTime < prevSimTimeRef.current - 1
        ) {
          elapsedRef.current = 0;
          warnedRef.current = false;
          setIsDegraded(false);
        }
        prevSimTimeRef.current = currentSimTime;

        // 仅运行中累加
        if (!store.isRunning) return;

        elapsedRef.current += LONG_RUNNING_CONFIG.CHECK_INTERVAL_MS;

        // 预警
        const warnThreshold =
          LONG_RUNNING_CONFIG.THRESHOLD_MS -
          LONG_RUNNING_CONFIG.WARNING_BEFORE_MS;
        if (elapsedRef.current >= warnThreshold && !warnedRef.current) {
          warnedRef.current = true;
          notify({
            title: "长效运行提示",
            description: `仿真已运行 ${Math.floor(warnThreshold / 60000)} 分钟，1 分钟后将自动降低精度以节省资源`,
            variant: "warning",
            durationMs: 8000,
          });
        }

        // 触发降级
        if (elapsedRef.current >= LONG_RUNNING_CONFIG.THRESHOLD_MS && !isDegraded) {
          setIsDegraded(true);
          useSimulationStore.getState().setDt(LONG_RUNNING_CONFIG.DEGRADED_DT);
          useExploreStore.getState().setMaxTrailLength(
            LONG_RUNNING_CONFIG.DEGRADED_TRAIL_LENGTH,
          );
          notify({
            title: "已进入长效运行模式",
            description: `积分精度已降低至 Δt=${LONG_RUNNING_CONFIG.DEGRADED_DT.toFixed(3)}s，尾迹长度已缩短至 ${LONG_RUNNING_CONFIG.DEGRADED_TRAIL_LENGTH} 步`,
            variant: "info",
            durationMs: 5000,
          });
        }
      } catch {
        /* 静默跳过本次检查 */
      }
    }, LONG_RUNNING_CONFIG.CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [enabled, isDegraded]);

  // 同步 visibilitychange
  useEffect(() => {
    const handler = () => {
      isVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return { isDegraded, elapsedMs: elapsedRef.current };
}
