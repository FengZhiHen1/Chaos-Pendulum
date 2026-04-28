import { useEffect, useRef, useState, useCallback } from "react";
import type { RefObject } from "react";
import { useSimulationStore } from "@/features/simulation/store";
import { getScheduler } from "@/features/simulation/worker/scheduler";
import { createOdeWorker } from "@/features/simulation/worker/createOdeWorker";
import type { WorkerRecoverConfig } from "../types";
import { notify } from "../notify";

const DEFAULT_CONFIG: WorkerRecoverConfig = {
  maxAutoRecovery: 3,
  retryDelayMs: 500,
  autoResumeAfterRecovery: true,
};

/**
 * Worker 崩溃恢复编排 hook。
 *
 * 若传入 `workerRef`，直接监听 worker.onerror 并编排重建。
 * 若未传入（当前 SIM-01 由 SimulationScheduler 内部管理 Worker），
 * 则通过监听 useSimulationStore 的 engineError / engineEvent 状态来展示 Toast 通知，
 * 并提供手动 recover 入口。
 */
export function useWorkerRecovery(
  workerRef?: RefObject<Worker | null>,
  config?: Partial<WorkerRecoverConfig>,
): { recoveryCount: number; recover: () => Promise<void> } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [recoveryCount, setRecoveryCount] = useState(0);
  const recoveryCountRef = useRef(0);
  const lastEventRef = useRef<string | null>(null);

  // 直接监听 workerRef（设计文档指定 API）
  useEffect(() => {
    const worker = workerRef?.current;
    if (!worker) return;

    const handleCrash = async () => {
      if (recoveryCountRef.current >= cfg.maxAutoRecovery) {
        notify({
          title: "仿真引擎无法自动恢复",
          description: `已尝试 ${recoveryCountRef.current} 次自动恢复，均失败。请刷新页面`,
          variant: "error",
          durationMs: 0,
        });
        return;
      }

      recoveryCountRef.current++;
      setRecoveryCount(recoveryCountRef.current);

      notify({
        title: "仿真引擎崩溃",
        description: `正在自动恢复（第 ${recoveryCountRef.current} 次）...`,
        variant: "loading",
        id: "worker-recovery",
      });

      const store = useSimulationStore.getState();
      const params = { ...store.params };
      const initialConditions = { ...store.initialConditions };

      await new Promise((r) => setTimeout(r, cfg.retryDelayMs));

      workerRef.current?.terminate();

      const newWorker = createOdeWorker();
      newWorker.postMessage({
        type: "init",
        params,
        initialConditions,
      });

      if (workerRef) {
        (workerRef as React.MutableRefObject<Worker | null>).current = newWorker;
      }

      notify({
        title: "仿真引擎已恢复",
        description: cfg.autoResumeAfterRecovery
          ? "已自动继续仿真"
          : "已恢复，点击继续仿真",
        variant: "success",
        id: "worker-recovery",
        durationMs: 3000,
        action: cfg.autoResumeAfterRecovery
          ? undefined
          : {
              label: "继续",
              onClick: () => useSimulationStore.getState().play(),
            },
      });

      if (cfg.autoResumeAfterRecovery) {
        useSimulationStore.getState().play();
      }
    };

    worker.onerror = handleCrash;
    return () => {
      worker.onerror = null;
    };
  }, [workerRef, cfg.maxAutoRecovery, cfg.retryDelayMs, cfg.autoResumeAfterRecovery]);

  // 监听 SimulationScheduler 内部触发的状态变化（当前架构主路径）
  useEffect(() => {
    const unsub = useSimulationStore.subscribe((state) => {
      // engineEvent: recovered
      if (state.engineEvent && state.engineEvent.type === "recovered") {
        const key = `recovered-${state.engineEvent.message}`;
        if (lastEventRef.current !== key) {
          lastEventRef.current = key;
          notify({
            title: "仿真引擎已恢复",
            description: state.engineEvent.message,
            variant: "success",
            durationMs: 3000,
          });
        }
      }

      // engineError: 崩溃且无法恢复
      if (state.engineError && state.engineError.includes("崩溃")) {
        const key = `error-${state.engineError}`;
        if (lastEventRef.current !== key) {
          lastEventRef.current = key;
          notify({
            title: "仿真引擎错误",
            description: state.engineError,
            variant: "error",
            durationMs: 8000,
          });
        }
      }
    });

    return () => unsub();
  }, []);

  const recover = useCallback(async () => {
    if (recoveryCountRef.current >= cfg.maxAutoRecovery) {
      notify({
        title: "仿真引擎无法自动恢复",
        description: `已尝试 ${recoveryCountRef.current} 次自动恢复，均失败。请刷新页面`,
        variant: "error",
        durationMs: 0,
      });
      return;
    }

    try {
      const store = useSimulationStore.getState();
      const sched = getScheduler();
      sched.destroy();
      sched.start(store.params, store.initialConditions, store.method);

      recoveryCountRef.current++;
      setRecoveryCount(recoveryCountRef.current);

      notify({
        title: "仿真引擎已恢复",
        description: cfg.autoResumeAfterRecovery
          ? "已自动继续仿真"
          : "已恢复，点击继续仿真",
        variant: "success",
        id: "worker-recovery",
        durationMs: 3000,
      });

      if (cfg.autoResumeAfterRecovery) {
        store.play();
      }
    } catch (e) {
      notify({
        title: "恢复失败",
        description: String(e),
        variant: "error",
        durationMs: 5000,
      });
    }
  }, [cfg.autoResumeAfterRecovery, cfg.maxAutoRecovery]);

  return { recoveryCount, recover };
}
