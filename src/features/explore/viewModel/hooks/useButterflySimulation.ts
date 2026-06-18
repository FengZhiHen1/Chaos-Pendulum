import { useEffect, useRef, useCallback } from "react";
import { useSimulationStore } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import { useRootStore } from "@/stores/rootStore";
import { ButterflyScheduler } from "../../butterfly-scheduler";
import { BUTTERFLY_DEFAULTS } from "../../contracts";
import { notificationPort } from "@/shared/infrastructure/adapters";

// ─── 全局单例管理 ──────────────────────────────

let globalScheduler: ButterflyScheduler | null = null;

function getOrCreateScheduler(): ButterflyScheduler {
  if (!globalScheduler) {
    globalScheduler = new ButterflyScheduler();
  }
  return globalScheduler;
}

function destroyScheduler(): void {
  if (globalScheduler) {
    globalScheduler.destroy();
    globalScheduler = null;
  }
}

// ─── Hook ─────────────────────────────────────

export interface UseButterflySimulationAPI {
  scheduler: ButterflyScheduler;
  handlePlay: () => void;
  handlePause: () => void;
  handleReset: () => void;
  handleDeltaChange: (deltaDeg: number) => void;
}

export function useButterflySimulation(): UseButterflySimulationAPI {
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);
  const setButterflyDelta = useExploreStore((s) => s.setButterflyDelta);
  const schedulerRef = useRef(getOrCreateScheduler());

  // 初始化
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const simStore = useSimulationStore.getState();
    useRootStore.getState().init(simStore.params, simStore.state, butterflyDelta);
    schedulerRef.current.start(simStore.params, simStore.state, butterflyDelta);
  }, [butterflyDelta]);

  // Delta 变化时平滑更新（仅 reset 摆 B 的初始条件，不销毁 Worker）
  const prevDeltaRef = useRef(butterflyDelta);
  useEffect(() => {
    if (prevDeltaRef.current === butterflyDelta) return;
    prevDeltaRef.current = butterflyDelta;
    schedulerRef.current.setDelta(butterflyDelta);
  }, [butterflyDelta]);

  // 卸载清理
  useEffect(() => {
    return () => {
      destroyScheduler();
    };
  }, []);

  // 控制回调
  const handlePlay = useCallback(() => {
    try {
      schedulerRef.current.play();
    } catch (err) {
      notificationPort.notify({
        title: "蝴蝶效应启动失败",
        description: err instanceof Error ? err.message : "仿真引擎初始化异常，请重试",
        variant: "error",
        durationMs: 5000,
      });
    }
  }, []);
  const handlePause = useCallback(() => schedulerRef.current.pause(), []);
  const handleReset = useCallback(() => {
    try {
      const simStore = useSimulationStore.getState();
      useRootStore.getState().reset();
      schedulerRef.current.reset();
      schedulerRef.current.start(simStore.params, simStore.state, butterflyDelta);
    } catch (err) {
      notificationPort.notify({
        title: "蝴蝶效应重置失败",
        description: err instanceof Error ? err.message : "请退出后重试",
        variant: "error",
        durationMs: 5000,
      });
    }
  }, [butterflyDelta]);

  const handleDeltaChange = useCallback(
    (deltaDeg: number) => {
      const clamped = Math.max(
        BUTTERFLY_DEFAULTS.minDeltaDeg,
        Math.min(BUTTERFLY_DEFAULTS.maxDeltaDeg, deltaDeg),
      );
      setButterflyDelta(clamped);
    },
    [setButterflyDelta],
  );

  return {
    scheduler: schedulerRef.current,
    handlePlay,
    handlePause,
    handleReset,
    handleDeltaChange,
  };
}
