import { useRef, useCallback } from "react";
import { useSimulationStore } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import { useRootStore } from "@/stores/rootStore";
import { ButterflySimulator } from "../../butterfly-simulator";
import { BUTTERFLY_DEFAULTS } from "../../contracts";

// ─── 全局单例 ──────────────────────────────

let globalSimulator: ButterflySimulator | null = null;

function getOrCreateSimulator(): ButterflySimulator {
  if (!globalSimulator) {
    globalSimulator = new ButterflySimulator();
  }
  return globalSimulator;
}

function destroySimulator(): void {
  if (globalSimulator) {
    globalSimulator.destroy();
    globalSimulator = null;
  }
}

// ─── Hook ─────────────────────────────────

export interface UseButterflySimulationAPI {
  handlePlay: () => void;
  handlePause: () => void;
  handleReset: () => void;
  handleDeltaChange: (deltaDeg: number) => void;
}

export function useButterflySimulation(): UseButterflySimulationAPI {
  const butterflyDelta = useExploreStore((s) => s.butterflyDelta);
  const setButterflyDelta = useExploreStore((s) => s.setButterflyDelta);
  const simRef = useRef(getOrCreateSimulator());

  // ═══ 暴力验证：注释掉所有初始化，隔离 Zustand 更新链 ═══
  // const initializedRef = useRef(false);
  // useEffect(() => {
  //   if (initializedRef.current) return;
  //   initializedRef.current = true;
  //   try {
  //     const simStore = useSimulationStore.getState();
  //     useRootStore.getState().init(simStore.params, simStore.state, butterflyDelta);
  //     simRef.current.start(simStore.params, simStore.state, butterflyDelta);
  //   } catch (err) {
  //     console.error("ButterflyEffect: 初始化失败", err);
  //     notificationPort.notify({...});
  //   }
  // }, [butterflyDelta]);

  // ═══ 暴力验证：注释掉 ═══
  // const prevDeltaRef = useRef(butterflyDelta);
  // useEffect(() => {
  //   if (prevDeltaRef.current === butterflyDelta) return;
  //   prevDeltaRef.current = butterflyDelta;
  //   simRef.current.setDelta(butterflyDelta);
  // }, [butterflyDelta]);

  // // 卸载清理
  // useEffect(() => () => { destroySimulator(); }, []);

  const handlePlay = useCallback(() => simRef.current.play(), []);
  const handlePause = useCallback(() => simRef.current.pause(), []);

  const handleReset = useCallback(() => {
    const simStore = useSimulationStore.getState();
    useRootStore.getState().reset();
    simRef.current.reset();
    simRef.current.start(simStore.params, simStore.state, butterflyDelta);
  }, [butterflyDelta]);

  const handleDeltaChange = useCallback((deltaDeg: number) => {
    setButterflyDelta(Math.max(BUTTERFLY_DEFAULTS.minDeltaDeg,
      Math.min(BUTTERFLY_DEFAULTS.maxDeltaDeg, deltaDeg)));
  }, [setButterflyDelta]);

  return { handlePlay, handlePause, handleReset, handleDeltaChange };
}
