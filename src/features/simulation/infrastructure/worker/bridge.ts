import type { PendulumParams, InitialConditions, IntegratorMethod } from "@/shared/domain/valueObjects";
import { useRootStore } from "@/stores/rootStore";
import { commandBus } from "@/shared/infrastructure/commandBus";
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

let lastSyncedParams: PendulumParams = { ...useRootStore.getState().params };
let lastRunning = false;
/** 标记 scheduler 下次启动时是否需要发送 init（首次启动 / reset 后为 true） */
let needsInit = true;
let lastActiveView = useRootStore.getState().activeView;
let lastPoincareCondition = useRootStore.getState().poincareSection.condition;
let lastPoincareIsActive = useRootStore.getState().poincareSection.isActive;

// ─── Worker 就绪标记 ───────────────────────────

export function setWorkerReady(): void {
  workerReady = true;
  useRootStore.setState({ isWorkerReady: true });
  flushPending();
}

export function setWorkerNotReady(): void {
  workerReady = false;
  useRootStore.setState({ isWorkerReady: false });
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
  const root = useRootStore.getState();
  const active = root.activeView === "poincare" && root.poincareSection.isActive;
  const cond = active ? root.poincareSection.condition : null;
  sched.setPoincareCondition(cond);
}

// ─── Command Bus 处理器 ────────────────────────

function setupCommandBusHandlers(): () => void {
  const unsubBatchReady = commandBus.on("worker:batchReady", (payload) => {
    if (payload.energyCorrection !== undefined) {
      useRootStore.setState({ energyCorrection: payload.energyCorrection });
    }
    if (payload.lyapunovExponent !== undefined) {
      useRootStore.setState({ lyapunovExponent: payload.lyapunovExponent });
    }
  });

  const unsubError = commandBus.on("worker:error", (payload) => {
    useRootStore.setState({ engineError: payload.message });
    if (payload.code === "DIVERGED") {
      useRootStore.setState({ isRunning: false, runPhase: "idle" });
    }
  });

  const unsubCrash = commandBus.on("worker:crash", () => {
    useRootStore.setState({
      engineError: "仿真引擎崩溃，请刷新页面",
      isRunning: false,
      runPhase: "idle",
    });
  });

  const unsubRecovered = commandBus.on("engine:recovered", (payload) => {
    useRootStore.setState({
      engineError: null,
      engineEvent: { type: "recovered", message: payload.message },
    });
  });

  const unsubFrameConsume = commandBus.on("frame:consume", (payload) => {
    useRootStore.getState().consumeFrameFromBuffer(payload.buffer, payload.frameIndex);
  });

  const unsubHistoryPush = commandBus.on("history:push", (payload) => {
    useRootStore.getState().pushHistory(payload.state);
  });

  const unsubHistoryClear = commandBus.on("history:clear", () => {
    useRootStore.getState().clearHistory();
  });

  const unsubButterflyFrame = commandBus.on("butterfly:frame", (payload) => {
    useRootStore.getState()._updateSide(payload.side, payload.state, payload.energy, payload.derived);
  });

  const unsubButterflyWorkerReady = commandBus.on("butterfly:workerReady", (payload) => {
    useRootStore.getState()._setWorkerReady(payload.side, payload.ready);
  });

  const unsubButterflyPlay = commandBus.on("butterfly:play", () => {
    useRootStore.getState().play();
  });

  const unsubButterflyPause = commandBus.on("butterfly:pause", () => {
    useRootStore.getState().pause();
  });

  // Scheduler 控制命令（解耦 TimeReversal / Scene3D 的直接引用）
  const unsubRequestTick = commandBus.on("scheduler:requestTick", (payload) => {
    getScheduler().tickDelta(payload.delta);
  });

  const unsubSetDirection = commandBus.on("scheduler:setDirection", (payload) => {
    getScheduler().setDirection(payload.direction);
  });

  const unsubSchedPause = commandBus.on("scheduler:pause", () => {
    getScheduler().pause();
  });

  const unsubSchedResume = commandBus.on("scheduler:resume", () => {
    getScheduler().resume();
  });

  const unsubSchedReset = commandBus.on("scheduler:reset", (payload) => {
    getScheduler().reset(payload.initialConditions, payload.simTime);
  });

  const unsubPrefetchBatch = commandBus.on("scheduler:prefetchBatch", () => {
    getScheduler().prefetchBatch(() => {
      commandBus.emit({ type: "scheduler:prefetchReady" });
    });
  });

  const unsubSetRunning = commandBus.on("simulation:setRunning", (payload) => {
    useRootStore.getState().setRunning(payload.isRunning);
  });

  const unsubOverrideState = commandBus.on("simulation:overrideState", (payload) => {
    useRootStore.setState({ state: payload.state });
  });

  return () => {
    unsubBatchReady();
    unsubError();
    unsubCrash();
    unsubRecovered();
    unsubFrameConsume();
    unsubHistoryPush();
    unsubHistoryClear();
    unsubButterflyFrame();
    unsubButterflyWorkerReady();
    unsubButterflyPlay();
    unsubButterflyPause();
    unsubRequestTick();
    unsubSetDirection();
    unsubSchedPause();
    unsubSchedResume();
    unsubSchedReset();
    unsubPrefetchBatch();
    unsubSetRunning();
    unsubOverrideState();
  };
}

// ─── Store 订阅 ────────────────────────────────

export function setupSimulationBridge(): () => void {
  const sched = getScheduler();

  // 启用外部 tick 模式：数据消费由 Scene3D 的 useFrame 驱动，与渲染严格同步
  sched.enableExternalTick();

  // Worker ready → 清空待发送队列
  sched.onReady(() => setWorkerReady());

  // 庞加莱截面点到达 → 写入分析 store（保留回调以兼容 scheduler 内部的双缓冲延迟转发）
  const unsubPoincare = sched.onPoincarePoints((pts) => {
    useRootStore.getState().poincareSection.addPoints(pts);
  });

  // Command Bus 处理器
  const unsubCommands = setupCommandBusHandlers();

  const unsubRoot = useRootStore.subscribe((state, prevState) => {
    // 本次订阅触发是否包含 resetTrigger 递增（意味着 resetToDefaults / injectParams）
    const isResetAction = state.resetTrigger !== prevState.resetTrigger;

    // ── params 变更 ──
    // paramsDirty 时跳过即时同步，由 resetTrigger 分支在重置时统一应用
    if (state.params !== prevState.params && !state.paramsDirty) {
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
          lastSyncedParams = { ...useRootStore.getState().params };
          if (workerReady) {
            getScheduler().updateParams(d);
          } else {
            enqueue("updateParams", d);
          }
        }, DEBOUNCE_MS);
      }
    }

    // ── initialConditions 变更 → Worker reset ──
    // 若 resetTrigger 同时递增或处于 paramsDirty，由 resetTrigger 分支统一处理，此处跳过
    if (state.initialConditions !== prevState.initialConditions && !isResetAction && !state.paramsDirty) {
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
    // paramsDirty 时跳过即时同步
    if (state.method !== prevState.method && !state.paramsDirty) {
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
      useRootStore.getState().poincareSection.clearPoints();
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
  const unsubAnalyze = useRootStore.subscribe((state) => {
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
    unsubRoot();
    unsubAnalyze();
    unsubPoincare();
    unsubCommands();
    if (updateParamsTimer) clearTimeout(updateParamsTimer);
    if (resetTimer) clearTimeout(resetTimer);
  };
}
