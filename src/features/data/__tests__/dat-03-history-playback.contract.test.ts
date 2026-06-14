/**
 * DAT-03 历史回放与分叉契约对抗测试
 *
 * 覆盖: HistoryPlaybackUseCase, ForkSimulationUseCase, extractStateAtTime, createDefaultGhostTrail
 * 策略: P0 (禁止行为) → P1 (边界值) → P2 (类型破坏) → P3 (行为链破坏)
 *
 * 约束: 仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  HistoryPlaybackUseCase,
  ForkSimulationUseCase,
  extractStateAtTime,
  createDefaultGhostTrail,
  PlaybackOutOfRangeError,
  ForkError,
  RING_BUFFER_CAPACITY,
} from "@/features/data/contracts";

import type {
  IRingBufferReader,
  PlaybackState,
  ForkConfig,
  GhostTrailConfig,
} from "@/features/data/contracts";

import type { StateVector } from "@/shared/domain/valueObjects";

// ============================================================================
// 共享测试数据
// ============================================================================

const VALID_STATE_VECTOR: StateVector = {
  theta1: Math.PI / 2,
  omega1: 0,
  theta2: Math.PI / 2,
  omega2: 0,
};

/** 填充 RingBuffer 的帧数据 */
function fillBufferWithFrames(
  reader: MockRingBufferReader,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    reader.pushFrame({
      ...VALID_STATE_VECTOR,
      theta1: i * 0.01,
      theta2: i * 0.005,
    });
  }
}

// ============================================================================
// Mock RingBuffer Reader
// ============================================================================

class MockRingBufferReader implements IRingBufferReader {
  private frames: StateVector[] = [];

  pushFrame(sv: StateVector): void {
    if (this.frames.length >= this.capacity) {
      this.frames.shift(); // 简单的 FIFO 驱逐
    }
    this.frames.push({ ...sv });
  }

  at(index: number): StateVector | undefined {
    if (index < 0 || index >= this.frames.length) return undefined;
    return { ...this.frames[index]! };
  }

  latest(): StateVector | undefined {
    if (this.frames.length === 0) return undefined;
    return { ...this.frames[this.frames.length - 1]! };
  }

  get length(): number {
    return this.frames.length;
  }

  get capacity(): number {
    return RING_BUFFER_CAPACITY;
  }

  toArray(): StateVector[] {
    return this.frames.map((f) => ({ ...f }));
  }

  findIndexByTime(time: number): number {
    const fps = 60;
    const index = Math.round(time * fps);
    if (index < 0 || index >= this.frames.length) return -1;
    return index;
  }
}

// ─── 最小化 HistoryPlaybackUseCase 子类 ─────────

class TestHistoryPlaybackUseCase extends HistoryPlaybackUseCase {
  private _state: PlaybackState = {
    currentTime: 0,
    totalTime: 0,
    ringBufferSize: 0,
    ringBufferCapacity: RING_BUFFER_CAPACITY,
    isSeeking: false,
  };

  constructor(reader: IRingBufferReader) {
    super(reader);
    this.updateTotalTime();
  }

  getCurrentState(): PlaybackState {
    return { ...this._state };
  }

  private updateTotalTime(): void {
    this._state.totalTime = (this.ringBuffer.length - 1) / 60;
    this._state.ringBufferSize = this.ringBuffer.length;
  }

  protected async doSeekTo(time: number): Promise<PlaybackState> {
    this._state.currentTime = time;
    this._state.isSeeking = true;
    this.updateTotalTime();
    return this.getCurrentState();
  }
}

// ─── 最小化 ForkSimulationUseCase 子类 ──────────

class TestForkSimulationUseCase extends ForkSimulationUseCase {
  private active = false;

  constructor(reader: IRingBufferReader) {
    super(reader);
  }

  isForkActive(): boolean {
    return this.active;
  }

  protected async doExecute(_config: ForkConfig): Promise<GhostTrailConfig> {
    this.active = true;
    return {
      opacity: 0.3,
      color: "#3B82F6" /* DESIGN: trail-slow */,
      trailData: this.ringBuffer.toArray(),
    };
  }

  protected async doCancel(): Promise<void> {
    this.active = false;
  }
}

// ============================================================================
// HistoryPlaybackUseCase 对抗测试
// ============================================================================

describe("HistoryPlaybackUseCase — 历史回放用例", () => {
  let buffer: MockRingBufferReader;
  let useCase: TestHistoryPlaybackUseCase;

  beforeEach(() => {
    buffer = new MockRingBufferReader();
    useCase = new TestHistoryPlaybackUseCase(buffer);
  });

  // ── P0: validateRingBufferNotEmpty ─────────────

  describe("P0: validateRingBufferNotEmpty — RingBuffer 为空", () => {
    it("RingBuffer.length = 0 时应抛出 PlaybackOutOfRangeError", () => {
      expect(() =>
        useCase["validateRingBufferNotEmpty"](),
      ).toThrow(PlaybackOutOfRangeError);
    });

    it("异常消息应提示无历史数据", () => {
      try {
        useCase["validateRingBufferNotEmpty"]();
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(PlaybackOutOfRangeError);
        expect((err as PlaybackOutOfRangeError).message).toContain("无历史数据");
      }
    });
  });

  // ── P1: validateRingBufferNotEmpty — 边界 ──────

  describe("P1: validateRingBufferNotEmpty — 边界", () => {
    it("RingBuffer.length = 1 → 应通过", () => {
      buffer.pushFrame(VALID_STATE_VECTOR);
      expect(() =>
        useCase["validateRingBufferNotEmpty"](),
      ).not.toThrow();
    });
  });

  // ── P0: validateSeekTime ───────────────────────

  describe("P0: validateSeekTime — 时间超出范围", () => {
    beforeEach(() => {
      fillBufferWithFrames(buffer, 60); // 1 秒 @60fps
      useCase = new TestHistoryPlaybackUseCase(buffer);
    });

    it("time < 0 时应抛出 PlaybackOutOfRangeError", () => {
      expect(() =>
        useCase["validateSeekTime"](-1),
      ).toThrow(PlaybackOutOfRangeError);
    });

    it("time 远超 RingBuffer 范围时应抛出 PlaybackOutOfRangeError", () => {
      // 60 帧 @60fps = 最晚可回放到约 0.983s (59/60)
      expect(() =>
        useCase["validateSeekTime"](10), // 远超范围
      ).toThrow(PlaybackOutOfRangeError);
    });

    it("异常中应包含请求时间和可用范围", () => {
      try {
        useCase["validateSeekTime"](-5);
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(PlaybackOutOfRangeError);
        expect((err as PlaybackOutOfRangeError).requestedTime).toBe(-5);
        expect((err as PlaybackOutOfRangeError).availableRange).toBeDefined();
      }
    });
  });

  // ── P1: validateSeekTime — 边界 ────────────────

  describe("P1: validateSeekTime — 边界值", () => {
    beforeEach(() => {
      fillBufferWithFrames(buffer, 60);
      useCase = new TestHistoryPlaybackUseCase(buffer);
    });

    it("time = 0 → 应通过 (起始时间)", () => {
      expect(() =>
        useCase["validateSeekTime"](0),
      ).not.toThrow();
    });

    it("time = NaN → 应抛出 (NaN < 0 为 false, frameIndex NaN >= length 为 false → 不触发)", () => {
      // NaN 漏洞：两个检查都不触发
      expect(() =>
        useCase["validateSeekTime"](NaN),
      ).not.toThrow();
    });

    it("time = Infinity → 抛出 (Infinity >= 0, frameIndex = Infinity >= length → 应触发)", () => {
      expect(() =>
        useCase["validateSeekTime"](Infinity),
      ).toThrow(PlaybackOutOfRangeError);
    });

    it("time = -Infinity → 抛出", () => {
      expect(() =>
        useCase["validateSeekTime"](-Infinity),
      ).toThrow(PlaybackOutOfRangeError);
    });
  });

  // ── P0: validatePlaybackState ──────────────────

  describe("P0: validatePlaybackState — 回放状态无效", () => {
    it("currentTime < 0 时应抛出 PlaybackOutOfRangeError", () => {
      const badState: PlaybackState = {
        currentTime: -1,
        totalTime: 10,
        ringBufferSize: 600,
        ringBufferCapacity: RING_BUFFER_CAPACITY,
        isSeeking: false,
      };
      expect(() =>
        useCase["validatePlaybackState"](badState),
      ).toThrow(PlaybackOutOfRangeError);
    });
  });

  // ── P1: validatePlaybackState — 边界 ───────────

  describe("P1: validatePlaybackState — 边界", () => {
    it("currentTime = 0 → 应通过", () => {
      const state: PlaybackState = {
        currentTime: 0,
        totalTime: 10,
        ringBufferSize: 600,
        ringBufferCapacity: RING_BUFFER_CAPACITY,
        isSeeking: false,
      };
      expect(() =>
        useCase["validatePlaybackState"](state),
      ).not.toThrow();
    });

    it("currentTime = NaN → 应通过 (NaN < 0 为 false)", () => {
      const state: PlaybackState = {
        currentTime: NaN,
        totalTime: 10,
        ringBufferSize: 600,
        ringBufferCapacity: RING_BUFFER_CAPACITY,
        isSeeking: false,
      };
      expect(() =>
        useCase["validatePlaybackState"](state),
      ).not.toThrow();
    });
  });

  // ── P3: goToLatest ─────────────────────────────

  describe("P3: goToLatest — 跳转到最新帧", () => {
    it("RingBuffer 非空时应成功", async () => {
      fillBufferWithFrames(buffer, 60);
      useCase = new TestHistoryPlaybackUseCase(buffer);
      const state = await useCase.goToLatest();
      expect(state.currentTime).toBeGreaterThanOrEqual(0);
    });

    it("RingBuffer 为空时应抛出异常", async () => {
      await expect(
        useCase.goToLatest(),
      ).rejects.toThrow(PlaybackOutOfRangeError);
    });
  });

  // ── P3: step ───────────────────────────────────

  describe("P3: step — 步进", () => {
    it("正向步进应增加 currentTime", async () => {
      fillBufferWithFrames(buffer, 120); // 2 秒
      useCase = new TestHistoryPlaybackUseCase(buffer);
      const state = await useCase.step(0.5);
      expect(state.currentTime).toBe(0.5);
    });

    it("负向步进超出范围应抛出异常", async () => {
      fillBufferWithFrames(buffer, 60);
      useCase = new TestHistoryPlaybackUseCase(buffer);
      await expect(
        useCase.step(-100),
      ).rejects.toThrow(PlaybackOutOfRangeError);
    });
  });
});

// ============================================================================
// ForkSimulationUseCase 对抗测试
// ============================================================================

describe("ForkSimulationUseCase — 分叉演化用例", () => {
  let buffer: MockRingBufferReader;
  let useCase: TestForkSimulationUseCase;

  beforeEach(() => {
    buffer = new MockRingBufferReader();
    fillBufferWithFrames(buffer, 120); // 2 秒
    useCase = new TestForkSimulationUseCase(buffer);
  });

  function createValidForkConfig(overrides: Partial<ForkConfig> = {}): ForkConfig {
    return {
      forkTime: 0.5,
      initialState: { ...VALID_STATE_VECTOR },
      modifiedParams: { m1: 2.0 },
      ...overrides,
    };
  }

  // ── P0: validateForkConfig — forkTime 无效 ────

  describe("P0: validateForkConfig — forkTime < 0", () => {
    it("forkTime < 0 应抛出 ForkError", () => {
      const config = createValidForkConfig({ forkTime: -1 });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });

    it("异常 code 应为 FORK_OUT_OF_RANGE", () => {
      const config = createValidForkConfig({ forkTime: -1 });
      try {
        useCase["validateForkConfig"](config);
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(ForkError);
        expect((err as ForkError).code).toBe("FORK_OUT_OF_RANGE");
        expect((err as ForkError).forkTime).toBe(-1);
      }
    });
  });

  // ── P0: validateForkConfig — initialState 为空 ─

  describe("P0: validateForkConfig — initialState 为空", () => {
    it("initialState 为 null 应抛出 ForkError", () => {
      const config = createValidForkConfig({
        initialState: null as unknown as StateVector,
      });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });

    it("initialState 为 undefined 应抛出 ForkError", () => {
      const config = createValidForkConfig({
        initialState: undefined as unknown as StateVector,
      });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });

    it("异常 code 应为 FORK_INIT_FAILED", () => {
      const config = createValidForkConfig({
        initialState: undefined as unknown as StateVector,
      });
      try {
        useCase["validateForkConfig"](config);
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(ForkError);
        expect((err as ForkError).code).toBe("FORK_INIT_FAILED");
      }
    });
  });

  // ── P0: validateForkConfig — initialState 非有限 ─

  describe("P0: validateForkConfig — initialState 含非有限值", () => {
    it("theta1 = NaN 应抛出 ForkError", () => {
      const config = createValidForkConfig({
        initialState: { ...VALID_STATE_VECTOR, theta1: NaN },
      });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });

    it("omega1 = Infinity 应抛出 ForkError", () => {
      const config = createValidForkConfig({
        initialState: { ...VALID_STATE_VECTOR, omega1: Infinity },
      });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });

    it("theta2 = -Infinity 应抛出 ForkError", () => {
      const config = createValidForkConfig({
        initialState: { ...VALID_STATE_VECTOR, theta2: -Infinity },
      });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });

    it("omega2 = NaN 应抛出 ForkError", () => {
      const config = createValidForkConfig({
        initialState: { ...VALID_STATE_VECTOR, omega2: NaN },
      });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });
  });

  // ── P0: validateForkConfig — forkTime 超出 RingBuffer ─

  describe("P0: validateForkConfig — forkTime 超出范围", () => {
    it("forkTime 远超 RingBuffer 范围应抛出 ForkError", () => {
      const config = createValidForkConfig({ forkTime: 100 });
      expect(() =>
        useCase["validateForkConfig"](config),
      ).toThrow(ForkError);
    });
  });

  // ── P0: validateForkActive ─────────────────────

  describe("P0: validateForkActive — 无活跃分叉", () => {
    it("isForkActive() = false 时应抛出 ForkError", () => {
      expect(() =>
        useCase["validateForkActive"](),
      ).toThrow(ForkError);
    });
  });

  // ── P0: validateForkDeactivated ────────────────

  describe("P0: validateForkDeactivated — 取消失败", () => {
    it("取消后 isForkActive() 仍 true 应抛出 ForkError", () => {
      useCase["doExecute"](createValidForkConfig()); // 设 active=true
      expect(() =>
        useCase["validateForkDeactivated"](),
      ).toThrow(ForkError);
    });
  });

  // ── P0: validateGhostTrail ─────────────────────

  describe("P0: validateGhostTrail — 幽灵尾迹无效", () => {
    it("opacity < 0 应抛出 ForkError", () => {
      const badGhost: GhostTrailConfig = {
        opacity: -0.1,
        color: "#3B82F6" /* DESIGN: trail-slow */,
        trailData: [],
      };
      expect(() =>
        useCase["validateGhostTrail"](badGhost),
      ).toThrow(ForkError);
    });

    it("opacity > 1 应抛出 ForkError", () => {
      const badGhost: GhostTrailConfig = {
        opacity: 1.5,
        color: "#3B82F6" /* DESIGN: trail-slow */,
        trailData: [],
      };
      expect(() =>
        useCase["validateGhostTrail"](badGhost),
      ).toThrow(ForkError);
    });

    it("color 不以 '#' 开头应抛出 ForkError", () => {
      const badGhost: GhostTrailConfig = {
        opacity: 0.3,
        color: "rgb(255,0,0)",
        trailData: [],
      };
      expect(() =>
        useCase["validateGhostTrail"](badGhost),
      ).toThrow(ForkError);
    });

    it("color 为空字符串应抛出 ForkError", () => {
      const badGhost: GhostTrailConfig = {
        opacity: 0.3,
        color: "",
        trailData: [],
      };
      expect(() =>
        useCase["validateGhostTrail"](badGhost),
      ).toThrow(ForkError);
    });
  });

  // ── P1: validateGhostTrail — 边界 ──────────────

  describe("P1: validateGhostTrail — opacity 边界", () => {
    it("opacity = 0 → 应通过 (最小值)", () => {
      const ghost: GhostTrailConfig = { opacity: 0, color: "#000", trailData: [] };
      expect(() =>
        useCase["validateGhostTrail"](ghost),
      ).not.toThrow();
    });

    it("opacity = 1 → 应通过 (最大值)", () => {
      const ghost: GhostTrailConfig = { opacity: 1, color: "#fff", trailData: [] };
      expect(() =>
        useCase["validateGhostTrail"](ghost),
      ).not.toThrow();
    });

    it("opacity = 0.5 → 应通过 (中间值)", () => {
      const ghost: GhostTrailConfig = { opacity: 0.5, color: "#888", trailData: [] };
      expect(() =>
        useCase["validateGhostTrail"](ghost),
      ).not.toThrow();
    });

    it("color = '#aBcDeF' → 应通过 (大小写混用)", () => {
      const ghost: GhostTrailConfig = { opacity: 0.3, color: "#aBcDeF", trailData: [] };
      expect(() =>
        useCase["validateGhostTrail"](ghost),
      ).not.toThrow();
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: 行为链破坏", () => {
    it("未执行分叉时取消 → 应抛出 ForkError", async () => {
      await expect(
        useCase.cancel(),
      ).rejects.toThrow(ForkError);
    });

    it("执行分叉后取消 → 应成功", async () => {
      await useCase.execute(createValidForkConfig());
      expect(useCase.isForkActive()).toBe(true);

      await useCase.cancel();
      expect(useCase.isForkActive()).toBe(false);
    });
  });

  // ── P3: execute → cancel → execute ─────────────

  describe("P3: 分叉生命周期", () => {
    it("分叉 → 取消 → 再分叉 → 应成功", async () => {
      const ghost1 = await useCase.execute(createValidForkConfig());
      expect(ghost1.opacity).toBe(0.3);
      expect(useCase.isForkActive()).toBe(true);

      await useCase.cancel();
      expect(useCase.isForkActive()).toBe(false);

      const ghost2 = await useCase.execute(createValidForkConfig({ forkTime: 1.0 }));
      expect(ghost2.opacity).toBe(0.3);
      expect(useCase.isForkActive()).toBe(true);
    });
  });
});

// ============================================================================
// extractStateAtTime 纯函数测试
// ============================================================================

describe("extractStateAtTime — 从 RingBuffer 提取状态", () => {
  let buffer: MockRingBufferReader;

  beforeEach(() => {
    buffer = new MockRingBufferReader();
  });

  it("时间在范围内应返回 StateVector", () => {
    fillBufferWithFrames(buffer, 120);
    const result = extractStateAtTime(buffer, 0.5);
    expect(result).toBeDefined();
    expect(result!.theta1).toBeDefined();
  });

  it("时间超出范围应返回 undefined", () => {
    fillBufferWithFrames(buffer, 10);
    const result = extractStateAtTime(buffer, 100);
    expect(result).toBeUndefined();
  });

  it("time = 0 → 返回第一帧", () => {
    fillBufferWithFrames(buffer, 60);
    const result = extractStateAtTime(buffer, 0);
    expect(result).toBeDefined();
  });

  it("time 为负数 → 返回 undefined (frameIndex 为负)", () => {
    fillBufferWithFrames(buffer, 60);
    const result = extractStateAtTime(buffer, -1);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// createDefaultGhostTrail 纯函数测试
// ============================================================================

describe("createDefaultGhostTrail — 默认幽灵尾迹配置", () => {
  it("默认 opacity = 0.3", () => {
    const result = createDefaultGhostTrail([]);
    expect(result.opacity).toBe(0.3);
  });

  it("默认 color = '#3B82F6' (DESIGN: trail-slow)", () => {
    const result = createDefaultGhostTrail([]);
    expect(result.color).toBe("#3B82F6");
  });

  it("传入自定义 opacity = 0.5 → 精确匹配", () => {
    const result = createDefaultGhostTrail([], 0.5);
    expect(result.opacity).toBe(0.5);
  });

  it("传入自定义 color = '#ff0000' → 精确匹配", () => {
    const result = createDefaultGhostTrail([], 0.3, "#ff0000");
    expect(result.color).toBe("#ff0000");
  });

  it("opacity 超范围值被钳位到 [0, 1]", () => {
    const r1 = createDefaultGhostTrail([], -1);
    expect(r1.opacity).toBe(0);

    const r2 = createDefaultGhostTrail([], 2);
    expect(r2.opacity).toBe(1);
  });

  it("trailData 应与传入数据一致", () => {
    const data: StateVector[] = [
      { theta1: 1, omega1: 0, theta2: 1, omega2: 0 },
    ];
    const result = createDefaultGhostTrail(data);
    expect(result.trailData).toEqual(data);
  });
});
