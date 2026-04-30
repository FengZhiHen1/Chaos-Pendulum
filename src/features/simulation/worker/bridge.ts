import type { PendulumParams, InitialConditions, IntegratorMethod } from "@/shared/types";
import { useSimulationStore } from "../store";
import { useAnalyzeStore } from "@/features/analyze/store";
import { getScheduler } from "./scheduler";

let workerReady = false;
const pendingCommands: Array<{ type: string; data: unknown }> = [];

// ─── 防抖 ──────────────────────────────────────

let updateParamsTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUpdateDiff: Partial<PendulumParams> = {};

let resetTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResetIC: InitialConditions | null = null;

/** 参数更新去抖窗口 ≈ 1 帧 @60fps（1/60 ≈ 16.7ms） */
const DEBOUNCE_MS = 16;

// ─── 追踪上次同步值 ────────────────────────────

let lastSyncedParams: PendulumParams = { ...useSimulationStore.getState().params };
let lastRunning = false;
/** 标记 scheduler 下次启动时是否需要发送 init（首次启动 / reset 后为 true） */
let needsInit = true;
let lastActiveView = useAnalyzeStore.getState().activeView;
let lastPoincareCondition = useAnalyzeStore.getState().poincareSection.condition;
let lastPoincareIsActive = useAnalyzeStore.getState().poincareSection.isActive;

// ─── Worker 就绪标记 ───────────────────────────

export function setWorkerReady(): void {
  workerReady = true;
  useSimulationStore.setState({ isWorkerReady: true });
  flushPending();
}

export function setWorkerNotReady(): void {
  workerReady = false;
  useSimulationStore.setState({ isWorkerReady: false });
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

// ─── 同步庞加莱截面条件 ────────────────────────

function syncPoincareCondition(): void {
  const sched = getScheduler();
  const analyze = useAnalyzeStore.getState();
  const active = analyze.activeView === "poincare" && analyze.poincareSection.isActive;
  const cond = active ? analyze.poincareSection.condition : null;
  sched.setPoincareCondition(cond);
}

// ─── Store 订阅 ────────────────────────────────

export function setupSimulationBridge(): () => void {
  const sched = getScheduler();

  // 启用外部 tick 模式：数据消费由 Scene3D 的 useFrame 驱动，与渲染严格同步
  sched.enableExternalTick();

  // Worker ready → 清空待发送队列
  sched.onReady(() => setWorkerReady());

  // 庞加莱截面点到达 → 写入分析 store
  const unsubPoincare = sched.onPoincarePoints((pts) => {
    useAnalyzeStore.getState().poincareSection.addPoints(pts);
  });

  const unsubSim = useSimulationStore.subscribe((state, prevState) => {
    // 本次订阅触发是否包含 resetTrigger 递增（意味着 resetToDefaults / injectParams）
    const isResetAction = state.resetTrigger !== prevState.resetTrigger;

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
    // 若 resetTrigger 同时递增，由 resetTrigger 分支统一处理，此处跳过防抖
    if (state.initialConditions !== prevState.initialConditions && !isResetAction) {
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

    // ── resetTrigger 递增 → 完整重启仿真 ──
    // 必须在 isRunning 之前执行。覆盖两种场景：
    //   A) 暂停中点击重置 → isRunning 变为 true，后续 isRunning 分支补充 start()（no-op）
    //   B) 运行中点击重置 → isRunning 未变，isRunning 分支不触发，此处显式 start()
    if (isResetAction) {
      // 取消任何待处理的 IC 防抖（由本次重置全权处理）
      if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
      pendingResetIC = null;
      const s = getScheduler();
      if (s.isRunning) s.pause();
      s.reset(state.initialConditions);
      useAnalyzeStore.getState().poincareSection.clearPoints();
      needsInit = true;
      // 显式启动：pause() 已将 running 置 false，start() 的 if-guard 会通过
      if (state.isRunning) {
        s.start(state.params, state.initialConditions, state.method);
        needsInit = false;
      }
    }

    // ── isRunning 变更 ──
    if (state.isRunning !== lastRunning) {
      lastRunning = state.isRunning;
      const s = getScheduler();
      if (state.isRunning && !s.isRunning) {
        if (needsInit) {
          s.start(state.params, state.initialConditions, state.method);
          needsInit = false;
        } else {
          s.resume();
        }
      } else if (!state.isRunning && s.isRunning) {
        s.pause();
      }
    }
  });

  // 初始同步庞加莱条件
  syncPoincareCondition();

  // 分析 store 订阅：视图切换 / 条件变更 / 采集开关 → 同步庞加莱条件
  const unsubAnalyze = useAnalyzeStore.subscribe((state) => {
    const poincare = state.poincareSection;
    let needSync = false;

    if (state.activeView !== lastActiveView) {
      lastActiveView = state.activeView;
      needSync = true;
    }

    if (poincare.isActive !== lastPoincareIsActive) {
      lastPoincareIsActive = poincare.isActive;
      needSync = true;
    }

    // 通过字段比较条件是否实质变化
    if (
      poincare.condition.variable !== lastPoincareCondition.variable ||
      poincare.condition.targetValue !== lastPoincareCondition.targetValue ||
      poincare.condition.direction !== lastPoincareCondition.direction
    ) {
      lastPoincareCondition = { ...poincare.condition };
      needSync = true;
    }

    if (needSync) {
      syncPoincareCondition();
    }
  });

  return () => {
    unsubSim();
    unsubAnalyze();
    unsubPoincare();
    if (updateParamsTimer) clearTimeout(updateParamsTimer);
    if (resetTimer) clearTimeout(resetTimer);
  };
}
