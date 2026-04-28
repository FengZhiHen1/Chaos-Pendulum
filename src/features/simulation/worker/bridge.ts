import type { PendulumParams, InitialConditions, IntegratorMethod } from "@/shared/types";
import { useSimulationStore } from "../store";
import { getScheduler } from "./scheduler";

let workerReady = false;
const pendingCommands: Array<{ type: string; data: unknown }> = [];

// ─── 防抖 ──────────────────────────────────────

let updateParamsTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUpdateDiff: Partial<PendulumParams> = {};

let resetTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResetIC: InitialConditions | null = null;

const DEBOUNCE_MS = 16;

// ─── 追踪上次同步值 ────────────────────────────

let lastSyncedParams: PendulumParams = { ...useSimulationStore.getState().params };
let lastRunning = false;

// ─── Worker 就绪标记 ───────────────────────────

export function setWorkerReady(): void {
  workerReady = true;
  flushPending();
}

export function setWorkerNotReady(): void {
  workerReady = false;
}

function flushPending(): void {
  const seen = new Set<string>();
  const deduped: typeof pendingCommands = [];
  for (let i = pendingCommands.length - 1; i >= 0; i--) {
    const c = pendingCommands[i]!;
    if (!seen.has(c.type)) {
      seen.add(c.type);
      deduped.unshift(c);
    }
  }

  const sched = getScheduler();
  for (const c of deduped) {
    if (c.type === "updateParams") {
      sched.updateParams(c.data as Partial<PendulumParams>);
    } else if (c.type === "reset") {
      sched.reset(c.data as InitialConditions);
    } else if (c.type === "setMethod") {
      sched.setMethod(c.data as IntegratorMethod);
    }
  }
  pendingCommands.length = 0;
}

function enqueue(type: string, data: unknown): void {
  pendingCommands.push({ type, data });
}

// ─── Store 订阅（监听全量 state，手动 diff） ──────

export function setupSimulationBridge(): () => void {
  // 注册 Worker ready 回调 → 清空待发送队列
  getScheduler().onReady(() => {
    setWorkerReady();
  });

  const unsub = useSimulationStore.subscribe((state, prevState) => {
    // ── params 变更 ──
    if (state.params !== prevState.params) {
      const diff: Partial<PendulumParams> = {};
      for (const k of Object.keys(state.params) as (keyof PendulumParams)[]) {
        if (state.params[k] !== lastSyncedParams[k]) {
          diff[k] = state.params[k];
        }
      }
      if (Object.keys(diff).length > 0) {
        Object.assign(pendingUpdateDiff, diff);
        if (updateParamsTimer) clearTimeout(updateParamsTimer);
        updateParamsTimer = setTimeout(() => {
          const d = { ...pendingUpdateDiff };
          pendingUpdateDiff = {};
          if (Object.keys(d).length === 0) return;
          lastSyncedParams = { ...useSimulationStore.getState().params };
          if (workerReady) {
            getScheduler().updateParams(d);
          } else {
            enqueue("updateParams", d);
          }
        }, DEBOUNCE_MS);
      }
    }

    // ── initialConditions 变更 → Worker reset ──
    if (state.initialConditions !== prevState.initialConditions) {
      pendingResetIC = state.initialConditions;
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        const ic = pendingResetIC;
        pendingResetIC = null;
        if (!ic) return;
        if (workerReady) {
          getScheduler().reset(ic);
        } else {
          enqueue("reset", ic);
        }
      }, 100);
    }

    // ── method 变更 ──
    if (state.method !== prevState.method) {
      if (workerReady) {
        getScheduler().setMethod(state.method);
      } else {
        enqueue("setMethod", state.method);
      }
    }

    // ── isRunning 变更 ──
    if (state.isRunning !== lastRunning) {
      lastRunning = state.isRunning;
      const sched = getScheduler();
      if (state.isRunning && !sched.isRunning) {
        sched.start(state.params, state.initialConditions, state.method);
      } else if (!state.isRunning && sched.isRunning) {
        sched.pause();
      }
    }
  });

  return () => {
    unsub();
    if (updateParamsTimer) clearTimeout(updateParamsTimer);
    if (resetTimer) clearTimeout(resetTimer);
  };
}
