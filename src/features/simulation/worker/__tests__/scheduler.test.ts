import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SimulationScheduler } from "../scheduler";
import { useSimulationStore } from "../../store";
import { useLabStore } from "@/features/lab/store";
import { FRAMES_PER_BATCH, FRAME_STRIDE, FORCE_STRIDE, FORCE_BUFFER_LENGTH } from "@/shared/types";
import type { ForceExtrema, PoincarePoint } from "@/shared/types";

// ─── 全局 Worker mock（jsdom 中不可用）─────────────

const mockWorkerInstances: Array<{
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}> = [];

class MockWorkerGlobal {
  postMessage = vi.fn();
  terminate = vi.fn();
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor() {
    mockWorkerInstances.push(this);
  }
}

// 注入全局以便 createWorker 可用
(globalThis as Record<string, unknown>).Worker = MockWorkerGlobal;

// ─── Mock Worker ──────────────────────────────

interface PostedMessage {
  data: unknown;
  transfer?: Transferable[];
}

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posts: PostedMessage[] = [];
  terminated = false;

  postMessage(data: unknown, transfer?: Transferable[]): void {
    this.posts.push({ data, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  dispatchMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  dispatchError(message = "mock error"): void {
    if (this.onerror) {
      this.onerror(new ErrorEvent("error", { message }));
    }
  }

  lastPost() {
    return this.posts[this.posts.length - 1] ?? null;
  }

  clearPosts() {
    this.posts.length = 0;
  }
}

// ─── Helpers ──────────────────────────────────

function makeFrameBuffer(frameCount = FRAMES_PER_BATCH): Float64Array {
  const buf = new Float64Array(frameCount * FRAME_STRIDE);
  for (let i = 0; i < frameCount; i++) {
    const off = i * FRAME_STRIDE;
    buf[off + 0] = i / 60; // t
    buf[off + 1] = 0.5;    // theta1
    buf[off + 2] = 0.1;    // theta1Dot
    buf[off + 3] = 0.3;    // theta2
    buf[off + 4] = -0.1;   // theta2Dot
    buf[off + 5] = 0.48;   // x1
    buf[off + 6] = -0.88;  // y1
    buf[off + 7] = 0.77;   // x2
    buf[off + 8] = -1.73;  // y2
    buf[off + 9] = 1.5;    // kineticEnergy
    buf[off + 10] = -10.0; // potentialEnergy
    buf[off + 11] = -8.5;  // totalEnergy
    buf[off + 12] = -2.0;  // alpha1
    buf[off + 13] = 1.5;   // alpha2
  }
  return buf;
}

function makeForceBuffer(): Float64Array {
  const buf = new Float64Array(FORCE_BUFFER_LENGTH);
  for (let i = 0; i < FRAMES_PER_BATCH; i++) {
    const off = i * FORCE_STRIDE;
    buf[off + 0] = 9.81; buf[off + 1] = -Math.PI / 2; // Fg1
    buf[off + 2] = 12.0; buf[off + 3] = 2.0;          // T1
    buf[off + 4] = 1.5;  buf[off + 5] = 1.0;          // Fi1_t
    buf[off + 6] = 2.0;  buf[off + 7] = 2.5;          // Fi1_n
    buf[off + 8] = 9.81; buf[off + 9] = -Math.PI / 2; // Fg2
    buf[off + 10] = 8.0; buf[off + 11] = 2.2;         // T2
    buf[off + 12] = 1.0; buf[off + 13] = 1.3;         // Fi2_t
    buf[off + 14] = 1.8; buf[off + 15] = 2.8;         // Fi2_n
  }
  return buf;
}

function makeForceExtrema(): ForceExtrema {
  return {
    T1_max: { value: 15.0, time: 1.0 },
    T1_min: { value: 0.1, time: 2.0 },
    T2_max: { value: 10.0, time: 0.5 },
    T2_min: { value: 0.05, time: 1.5 },
  };
}

function initScheduler(mockWorker = new MockWorker()): { scheduler: SimulationScheduler; worker: MockWorker } {
  const scheduler = new SimulationScheduler();
  scheduler.injectWorker(mockWorker as unknown as Worker);
  // 使用外部 tick 模式避免 rAF 循环
  scheduler.enableExternalTick();
  return { scheduler, worker: mockWorker };
}

// ─── 生命周期管理 & 存储重置 ──────────────────

beforeEach(() => {
  // 清理 mock Worker 实例
  mockWorkerInstances.length = 0;

  // 重置所有涉及的 Zustand store
  useSimulationStore.setState({
    params: { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
    initialConditions: { theta1: Math.PI / 2, theta1Dot: 0, theta2: Math.PI / 2, theta2Dot: 0 },
    isRunning: false,
    engineError: null,
    engineEvent: null,
    resetTrigger: 0,
  });
  useLabStore.setState({
    forceDecomposition: {
      active: false,
      lastForceData: null,
      bufferIndex: 0,
      extrema: null,
      hovered: null,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. 启动流程 ──────────────────────────────

describe("SimulationScheduler 启动与初始化", () => {
  it("start() 向 Worker 发送 init 命令", () => {
    const { scheduler, worker } = initScheduler();

    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1.0, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    const initMsg = worker.lastPost();
    expect(initMsg).not.toBeNull();
    expect((initMsg!.data as Record<string, unknown>).type).toBe("init");
  });

  it("start() 在已运行时是空操作", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.clearPosts();

    scheduler.start(
      { m1: 2, m2: 2, L1: 2, L2: 2, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    expect(worker.posts.length).toBe(0);
  });

  it("Worker ready 响应触发 requestNextBatch", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.clearPosts();

    // Worker 发送 ready
    worker.dispatchMessage({ type: "ready" });

    const stepMsg = worker.lastPost();
    expect(stepMsg).not.toBeNull();
    expect((stepMsg!.data as Record<string, unknown>).type).toBe("step");
  });
});

// ─── 2. 批处理生命周期 ──────────────────────────

describe("SimulationScheduler 批处理生命周期", () => {
  it("batchReady 激活缓冲区，tick() 逐帧消费", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    // ready → requestNextBatch
    worker.dispatchMessage({ type: "ready" });
    // 确认 step 发送
    expect(worker.lastPost()).not.toBeNull();

    // batchReady 返回
    const buffer = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady",
      buffer,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
    });

    // 第一帧消费
    const consumed = scheduler.tick();
    expect(consumed).toBe(true);

    // 验证 store 被更新
    const store = useSimulationStore.getState();
    expect(store.t).toBeCloseTo(0, 0);
    expect(store.consumedFrameIndex).toBe(0);
  });

  it("消费完整个批次后释放缓冲区", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const buffer = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady",
      buffer,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
    });

    // 消费全部帧
    for (let i = 0; i < FRAMES_PER_BATCH; i++) {
      const r = scheduler.tick();
      expect(r).toBe(true);
    }

    // 第 121 帧：无活跃缓冲区，返回 false
    const r = scheduler.tick();
    expect(r).toBe(false);
  });

  it("当缓冲区为空且无 pending 时自动请求下一批", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });
    worker.clearPosts();

    // 消费 ready 触发的第一批
    const buffer = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady",
      buffer,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
    });

    // 消费完毕
    for (let i = 0; i < FRAMES_PER_BATCH; i++) scheduler.tick();

    // 确认请求了新批次
    const stepMsg = worker.lastPost();
    expect(stepMsg).not.toBeNull();
    expect((stepMsg!.data as Record<string, unknown>).type).toBe("step");
  });
});

// ─── 3. 双缓冲机制 ────────────────────────────

describe("SimulationScheduler 双缓冲", () => {
  it("batchReady 在 activeBuffer 未消费完时暂存到 nextBuffer", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    // 第一批到达
    const buf1 = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady",
      buffer: buf1,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
    });

    // 仅消费 10 帧
    for (let i = 0; i < 10; i++) {
      expect(scheduler.tick()).toBe(true);
    }

    // 第二批提前到达（在阈值 60 之前）
    const buf2 = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady",
      buffer: buf2,
      frameCount: FRAMES_PER_BATCH,
      simTime: 4.0,
    });

    // 继续消费第一批的剩余帧（应该在 buf1 上）
    for (let i = 0; i < FRAMES_PER_BATCH - 10; i++) {
      expect(scheduler.tick()).toBe(true);
    }

    // 第一批所有帧消费完毕，应自动切换到 buf2
    // buf2 的第 0 帧应可消费
    expect(scheduler.tick()).toBe(true);
  });

  it("第二批到达时若已有 pending next，旧 next 被释放", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const buf1 = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer: buf1, frameCount: FRAMES_PER_BATCH, simTime: 2.0,
    });

    // 消费 5 帧后连续两批到达
    for (let i = 0; i < 5; i++) scheduler.tick();

    const buf2 = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer: buf2, frameCount: FRAMES_PER_BATCH, simTime: 4.0,
    });

    const buf3 = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer: buf3, frameCount: FRAMES_PER_BATCH, simTime: 6.0,
    });

    // buf2 应被 buf3 替换（释放回池），不应崩溃
    // 消费完 buf1 → 提升 buf3
    for (let i = 0; i < FRAMES_PER_BATCH - 5; i++) scheduler.tick();
    expect(scheduler.tick()).toBe(true); // buf3 首帧
  });
});

// ─── 4. Float64Pool 池耗尽 ─────────────────────

describe("SimulationScheduler 池耗尽处理", () => {
  it("20 个批次完整生命周期后池不泄漏", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    // 模拟 20 个批次的完整生命周期（超出池容量 10）
    for (let batch = 0; batch < 20; batch++) {
      // ready → requestNextBatch
      worker.dispatchMessage({ type: "ready" });
      const buf = makeFrameBuffer();
      worker.dispatchMessage({
        type: "batchReady", buffer: buf, frameCount: FRAMES_PER_BATCH, simTime: (batch + 1) * 2,
      });
      // 完整消费 → 归还 buffer 到池
      for (let f = 0; f < FRAMES_PER_BATCH; f++) {
        expect(scheduler.tick()).toBe(true);
      }
    }

    // 批次外无帧可消费
    expect(scheduler.tick()).toBe(false);
  });
});

// ─── 5. Worker 崩溃恢复 ───────────────────────

describe("SimulationScheduler Worker 崩溃恢复", () => {
  it("Worker onerror 触发恢复：重新创建 Worker + 发送 init", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    // 先完成一个批次使 store 有当前状态
    worker.dispatchMessage({ type: "ready" });
    const buf = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer: buf, frameCount: FRAMES_PER_BATCH, simTime: 2.0,
    });
    for (let i = 0; i < 10; i++) scheduler.tick();

    // 触发 Worker 崩溃
    worker.dispatchError("simulated crash");

    // handleWorkerCrash → createWorker 创建新 Worker → send init
    const store = useSimulationStore.getState();
    expect(store.engineEvent?.type).toBe("recovered");
    expect(store.engineError).toBeNull();
    // 验证创建了新 Worker 实例
    expect(mockWorkerInstances.length).toBeGreaterThanOrEqual(1);
  });

  it("连续崩溃超过上限后停止恢复", () => {
    // 不注入 Worker：使用 createWorker 路径，以便崩溃恢复可创建新 Worker
    const scheduler = new SimulationScheduler();
    scheduler.enableExternalTick();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    // 第一个 mock Worker（由 createWorker 在 start 时创建）
    const w1 = mockWorkerInstances[0]!;

    // 第一次崩溃 → 恢复 → 创建 w2
    w1.onerror?.(new ErrorEvent("error", { message: "crash 1" }));
    expect(useSimulationStore.getState().engineEvent?.type).toBe("recovered");

    // 第二个 mock Worker
    const w2 = mockWorkerInstances[1]!;

    // 第二次崩溃 → 超过 MAX_CRASH_RECOVERY
    w2.onerror?.(new ErrorEvent("error", { message: "crash 2" }));

    const store = useSimulationStore.getState();
    expect(store.engineError).toBe("仿真引擎崩溃，请刷新页面");
    expect(store.isRunning).toBe(false);
  });
});

// ─── 6. 超时处理 ──────────────────────────────

describe("SimulationScheduler 超时处理", () => {
  it("step 超时 2s 触发恢复", () => {
    vi.useFakeTimers();
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    // ready → requestNextBatch → step 发送
    const stepPost = worker.lastPost();
    expect((stepPost!.data as Record<string, unknown>).type).toBe("step");

    // 2 秒超时 → handleWorkerCrash → createWorker（mock 可用）
    vi.advanceTimersByTime(2100);

    // 应触发超时恢复
    const store = useSimulationStore.getState();
    expect(store.engineEvent?.type).toBe("recovered");

    vi.useRealTimers();
  });
});

// ─── 7. Worker 错误响应 (error code) ────────────

describe("SimulationScheduler Worker 错误响应", () => {
  it("DIVERGED 错误停止仿真", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    worker.dispatchMessage({
      type: "error",
      code: "DIVERGED",
      message: "数值发散于 t=1.5",
      simTime: 1.5,
    });

    const store = useSimulationStore.getState();
    expect(store.engineError).toBe("数值发散于 t=1.5");
    expect(store.isRunning).toBe(false);
  });
});

// ─── 8. 力数据转发 ────────────────────────────

describe("SimulationScheduler 力数据转发 (LAB-01)", () => {
  it("batchReady 带 forceData 时更新 labStore", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const buffer = makeFrameBuffer();
    const forceData = makeForceBuffer();
    const extrema = makeForceExtrema();

    worker.dispatchMessage({
      type: "batchReady",
      buffer,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
      forceData,
      forceExtrema: extrema,
    });

    const labStore = useLabStore.getState();
    expect(labStore.forceDecomposition.lastForceData).not.toBeNull();
    expect(labStore.forceDecomposition.extrema?.T1_max.value).toBe(15.0);
  });

  it("双缓冲下 forceData 随 nextBuffer 延迟转发", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    // 第一批带 forceData
    const buf1 = makeFrameBuffer();
    const fd1 = makeForceBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer: buf1, frameCount: FRAMES_PER_BATCH, simTime: 2.0, forceData: fd1,
    });
    // 首个 forceData 立即转发
    expect(useLabStore.getState().forceDecomposition.lastForceData).not.toBeNull();
    const firstForceData = useLabStore.getState().forceDecomposition.lastForceData;

    // 消费 10 帧后第二批次到达
    for (let i = 0; i < 10; i++) scheduler.tick();
    const buf2 = makeFrameBuffer();
    const fd2 = makeForceBuffer();
    // 修改 fd2 的首帧数据使其可区分
    fd2[0] = 99.9;
    worker.dispatchMessage({
      type: "batchReady", buffer: buf2, frameCount: FRAMES_PER_BATCH, simTime: 4.0, forceData: fd2,
    });

    // labStore 应仍持有第一批的 forceData（因为第二批在 nextBuffer 中）
    expect(useLabStore.getState().forceDecomposition.lastForceData).toBe(firstForceData);

    // 消费完第一批
    for (let i = 0; i < FRAMES_PER_BATCH - 10; i++) scheduler.tick();

    // 现在 labStore 应持有第二批的 forceData（nextBuffer 被提升）
    const newForceData = useLabStore.getState().forceDecomposition.lastForceData;
    expect(newForceData).not.toBeNull();
    expect(newForceData).not.toBe(firstForceData);
    expect(newForceData![0]).toBe(99.9);
  });
});

// ─── 9. 庞加莱截面转发 ─────────────────────────

describe("SimulationScheduler 庞加莱截面转发", () => {
  it("batchReady 的 poincarePoints 转发到回调", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const received: PoincarePoint[][] = [];
    scheduler.onPoincarePoints((pts) => received.push(pts));

    const buffer = makeFrameBuffer();
    const points: PoincarePoint[] = [
      { theta2: 0.5, omega2: 1.2, time: 1.0, batchIndex: 0 },
      { theta2: -0.3, omega2: -0.8, time: 1.5, batchIndex: 0 },
    ];

    worker.dispatchMessage({
      type: "batchReady",
      buffer,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
      poincarePoints: points,
    });

    expect(received.length).toBe(1);
    expect(received[0]!.length).toBe(2);
    expect(received[0]![0]!.time).toBe(1.0);
  });

  it("取消注册后的回调不再被调用", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const received: PoincarePoint[][] = [];
    const unsub = scheduler.onPoincarePoints((pts) => received.push(pts));
    unsub();

    const buffer = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady",
      buffer,
      frameCount: FRAMES_PER_BATCH,
      simTime: 2.0,
      poincarePoints: [{ theta2: 0.5, omega2: 1.2, time: 1.0, batchIndex: 0 }],
    });

    expect(received.length).toBe(0);
  });
});

// ─── 10. 生命周期方法 ──────────────────────────

describe("SimulationScheduler pause / resume / destroy / reset", () => {
  it("pause() 暂停消费循环", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    expect(scheduler.isRunning).toBe(true);

    scheduler.pause();
    expect(scheduler.isRunning).toBe(false);

    // tick() 在暂停时返回 false
    expect(scheduler.tick()).toBe(false);
  });

  it("resume() 恢复消费", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    scheduler.pause();

    worker.dispatchMessage({ type: "ready" });
    const buffer = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer, frameCount: FRAMES_PER_BATCH, simTime: 2.0,
    });

    scheduler.resume();
    expect(scheduler.isRunning).toBe(true);
    expect(scheduler.tick()).toBe(true);
  });

  it("destroy() 释放所有缓冲区并终止 Worker", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );

    scheduler.destroy();

    expect(scheduler.isRunning).toBe(false);
    expect(worker.terminated).toBe(true);
  });

  it("reset() 发送 reset 命令并清理缓冲区", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });
    worker.clearPosts();

    scheduler.reset({ theta1: 0, theta1Dot: 0, theta2: 0, theta2Dot: 0 });

    const resetMsg = worker.lastPost();
    expect(resetMsg).not.toBeNull();
    expect((resetMsg!.data as Record<string, unknown>).type).toBe("reset");
  });
});

// ─── 11. 命令转发 ──────────────────────────────

describe("SimulationScheduler 命令转发", () => {
  it("setComputeForces(true) 发送 config 命令", () => {
    const { scheduler, worker } = initScheduler();

    scheduler.setComputeForces(true);

    const msg = worker.lastPost();
    expect((msg!.data as Record<string, unknown>).type).toBe("config");
    expect((msg!.data as Record<string, unknown>).computeForces).toBe(true);
  });

  it("updateParams() 发送 updateParams 命令", () => {
    const { scheduler, worker } = initScheduler();

    scheduler.updateParams({ m1: 2.0 });

    const msg = worker.lastPost();
    expect((msg!.data as Record<string, unknown>).type).toBe("updateParams");
    expect((msg!.data as Record<string, unknown>).params).toEqual({ m1: 2.0 });
  });

  it("setMethod() 发送 setMethod 命令", () => {
    const { scheduler, worker } = initScheduler();

    scheduler.setMethod("Euler");

    const msg = worker.lastPost();
    expect((msg!.data as Record<string, unknown>).type).toBe("setMethod");
    expect((msg!.data as Record<string, unknown>).method).toBe("Euler");
  });

  it("setDirection() 发送 setDirection 命令", () => {
    const { scheduler, worker } = initScheduler();

    scheduler.setDirection(-1);

    const msg = worker.lastPost();
    expect((msg!.data as Record<string, unknown>).type).toBe("setDirection");
    expect((msg!.data as Record<string, unknown>).direction).toBe(-1);
  });
});

// ─── 12. 插值快照 ──────────────────────────────

describe("SimulationScheduler 插值快照", () => {
  it("getInterpolationFrames 返回前后帧快照", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const buffer = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer, frameCount: FRAMES_PER_BATCH, simTime: 2.0,
    });

    // 初始快照为空
    const snap0 = scheduler.getInterpolationFrames();
    expect(snap0.prev).toBeNull();
    expect(snap0.curr).toBeNull();

    // 消费一帧
    scheduler.tick();
    const snap1 = scheduler.getInterpolationFrames();
    expect(snap1.curr).not.toBeNull();
    expect(snap1.prev).toBeNull();

    // 消费第二帧
    scheduler.tick();
    const snap2 = scheduler.getInterpolationFrames();
    expect(snap2.curr).not.toBeNull();
    expect(snap2.prev).not.toBeNull();

    // 快照值应来自 store
    const store = useSimulationStore.getState();
    expect(snap2.curr!.x1).toBe(store.x1);
    expect(snap2.curr!.y1).toBe(store.y1);
  });
});

// ─── 13. 部分批次 ──────────────────────────────

describe("SimulationScheduler 部分批次", () => {
  it("frameCount < FRAMES_PER_BATCH 时发出警告", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const buffer = makeFrameBuffer(50); // 仅有 50 帧
    worker.dispatchMessage({
      type: "batchReady", buffer, frameCount: 50, simTime: 0.83,
    });

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("部分批次: 50/120"),
    );
    consoleWarn.mockRestore();
  });

  it("部分批次在消费满 frameCount 后提升 nextBuffer", () => {
    const { scheduler, worker } = initScheduler();
    scheduler.start(
      { m1: 1, m2: 1, L1: 1, L2: 1, g: 9.81, damping: 0 },
      { theta1: 1, theta1Dot: 0, theta2: 0.5, theta2Dot: 0 },
      "RKF45",
    );
    worker.dispatchMessage({ type: "ready" });

    const buf1 = makeFrameBuffer(50);
    worker.dispatchMessage({
      type: "batchReady", buffer: buf1, frameCount: 50, simTime: 0.83,
    });

    // 消费 5 帧
    for (let i = 0; i < 5; i++) scheduler.tick();

    // 第二批（完整批次）提前到达
    const buf2 = makeFrameBuffer();
    worker.dispatchMessage({
      type: "batchReady", buffer: buf2, frameCount: FRAMES_PER_BATCH, simTime: 2.83,
    });

    // 消费完第一批（50 帧）
    for (let i = 0; i < 45; i++) scheduler.tick();
    // 应自动切换到 buf2
    expect(scheduler.tick()).toBe(true);
  });
});
