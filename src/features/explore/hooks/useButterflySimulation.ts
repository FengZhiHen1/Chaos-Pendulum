import { useEffect, useRef, useCallback } from "react";
import { useSimulationStore } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import { useRootStore } from "@/stores/rootStore";
import { ButterflyScheduler } from "../butterfly-scheduler";

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

  // Delta 变化时重建
  const prevDeltaRef = useRef(butterflyDelta);
  useEffect(() => {
    if (prevDeltaRef.current === butterflyDelta) return;
    prevDeltaRef.current = butterflyDelta;

    const simStore = useSimulationStore.getState();
    useRootStore.getState().reset();
    schedulerRef.current.reset();
    schedulerRef.current.start(simStore.params, simStore.state, butterflyDelta);
  }, [butterflyDelta]);

  // 卸载清理
  useEffect(() => {
    return () => {
      destroyScheduler();
    };
  }, []);

  // 控制回调
  const handlePlay = useCallback(() => schedulerRef.current.play(), []);
  const handlePause = useCallback(() => schedulerRef.current.pause(), []);
  const handleReset = useCallback(() => {
    const simStore = useSimulationStore.getState();
    useRootStore.getState().reset();
    schedulerRef.current.reset();
    schedulerRef.current.start(simStore.params, simStore.state, butterflyDelta);
  }, [butterflyDelta]);

  const handleDeltaChange = useCallback(
    (deltaDeg: number) => {
      const clamped = Math.max(0, Math.min(10.0, deltaDeg));
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
