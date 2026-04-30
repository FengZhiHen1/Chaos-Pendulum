import { useEffect, useRef } from "react";
import { useSimulationStore } from "@/features/simulation";
import { useExploreStore } from "../store";

const WINDOW_SIZE = 300; // 5 秒 @ 60fps

export function useChaosUpdater() {
  const historyRef = useRef(new Float64Array(WINDOW_SIZE));
  const cursorRef = useRef(0);
  const countRef = useRef(0);

  useEffect(() => {
    let running = true;

    function tick() {
      if (!running) return;

      const store = useSimulationStore.getState();

      if (store.isRunning && !isNaN(store.state.omega2) && isFinite(store.state.omega2)) {
        const buf = historyRef.current;
        buf[cursorRef.current] = store.state.omega2;
        cursorRef.current = (cursorRef.current + 1) % WINDOW_SIZE;
        if (countRef.current < WINDOW_SIZE) countRef.current++;

        const n = countRef.current;
        if (n >= 2) {
          let sum = 0;
          for (let i = 0; i < n; i++) sum += buf[i]!;
          const mean = sum / n;
          let sumSq = 0;
          for (let i = 0; i < n; i++) {
            const diff = buf[i]! - mean;
            sumSq += diff * diff;
          }
          useExploreStore.getState().setChaosState(sumSq / n);
        }
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return () => { running = false; };
  }, []);

  // 重置时清空窗口
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);
  useEffect(() => {
    historyRef.current.fill(0);
    cursorRef.current = 0;
    countRef.current = 0;
    useExploreStore.getState().setChaosState(0);
  }, [resetTrigger]);
}
