/**
 * STY-01 故事脚本引擎契约对抗测试
 *
 * 覆盖: StoryScriptEngine (ABC 模板方法)
 * 策略: P0 (禁止行为) → P1 (边界值) → P2 (类型破坏) → P3 (行为链破坏)
 *
 * 约束: 仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  StoryScriptEngine,
  StoryScriptError,
  STORY_TOTAL_DURATION,
  STORY_STAGE_COUNT,
} from "@/features/data/contracts";

import type {
  IStoryScriptRepository,
  StoryStage,
  StoryPlaybackState,
} from "@/features/data/contracts";

import type { AppMode } from "@/shared/domain/valueObjects";

// ============================================================================
// 共享测试数据
// ============================================================================

function createValidStage(overrides: Partial<StoryStage> = {}): StoryStage {
  return {
    startTime: 0,
    duration: 30,
    targetMode: "explore" as AppMode,
    subtitle: "第一阶段：认识双摆",
    highlightedControls: [],
    ...overrides,
  };
}

function create7Stages(): StoryStage[] {
  const modeCycle: AppMode[] = ["explore", "analyze", "lab", "story", "explore", "analyze", "lab"];
  return Array.from({ length: 7 }, (_, i) => ({
    startTime: i * 30,
    duration: 30,
    targetMode: modeCycle[i]!,
    subtitle: `第${i + 1}阶段`,
    highlightedControls: [],
  }));
}

function createValidPlaybackState(overrides: Partial<StoryPlaybackState> = {}): StoryPlaybackState {
  return {
    isPlaying: true,
    isInterrupted: false,
    currentStage: 0,
    totalStages: 7,
    elapsedTime: 5,
    totalDuration: 210,
    progress: 5 / 210,
    currentSubtitle: "第一阶段",
    highlightedControls: [],
    currentMode: "explore",
    ...overrides,
  };
}

// ============================================================================
// 最小化具体子类
// ============================================================================

class InMemoryScriptRepository implements IStoryScriptRepository {
  private stages: StoryStage[] = [];

  setStages(stages: StoryStage[]) {
    this.stages = [...stages];
  }

  async loadScript(): Promise<StoryStage[]> {
    return [...this.stages];
  }

  async getStage(index: number): Promise<StoryStage> {
    const stage = this.stages[index];
    if (!stage) throw new StoryScriptError(
      "STORY_STAGE_TRANSITION",
      `阶段索引越界: ${index}`,
      "getStage()",
      index,
    );
    return { ...stage };
  }

  getStageCount(): number {
    return this.stages.length;
  }

  getTotalDuration(): number {
    return this.stages.reduce((sum, s) => sum + s.duration, 0);
  }
}

class TestStoryScriptEngine extends StoryScriptEngine {
  private _state: StoryPlaybackState = {
    isPlaying: false,
    isInterrupted: false,
    currentStage: 0,
    totalStages: 7,
    elapsedTime: 0,
    totalDuration: STORY_TOTAL_DURATION,
    progress: 0,
    currentSubtitle: "",
    highlightedControls: [],
    currentMode: "explore",
  };

  constructor(scriptRepo: IStoryScriptRepository) {
    super(scriptRepo);
  }

  getCurrentState(): StoryPlaybackState {
    return { ...this._state };
  }

  setStateForTesting(state: Partial<StoryPlaybackState>) {
    this._state = { ...this._state, ...state };
  }

  // no-op hooks
  protected async onStageEnter(_stage: StoryStage, _index: number): Promise<void> {}
  protected async onStageExit(_stage: StoryStage, _index: number): Promise<void> {}
  protected onSubtitleChange(_subtitle: string): void {}
  protected onHighlightChange(_controlIds: string[]): void {}

  protected async doPlay(): Promise<StoryPlaybackState> {
    this._state.isPlaying = true;
    this._state.isInterrupted = false;
    return this.getCurrentState();
  }

  protected async doPause(): Promise<StoryPlaybackState> {
    this._state.isPlaying = false;
    this._state.isInterrupted = true;
    return this.getCurrentState();
  }

  protected async doResume(): Promise<StoryPlaybackState> {
    this._state.isPlaying = true;
    this._state.isInterrupted = false;
    return this.getCurrentState();
  }

  protected async doStop(): Promise<StoryPlaybackState> {
    this._state = {
      isPlaying: false,
      isInterrupted: false,
      currentStage: 0,
      totalStages: 7,
      elapsedTime: 0,
      totalDuration: STORY_TOTAL_DURATION,
      progress: 0,
      currentSubtitle: "",
      highlightedControls: [],
      currentMode: "explore",
    };
    return this.getCurrentState();
  }
}

// ============================================================================
// StoryScriptEngine 对抗测试
// ============================================================================

describe("StoryScriptEngine — 故事脚本引擎", () => {
  let repo: InMemoryScriptRepository;
  let engine: TestStoryScriptEngine;

  beforeEach(() => {
    repo = new InMemoryScriptRepository();
    engine = new TestStoryScriptEngine(repo);
  });

  // ── P0: validateScriptReady ────────────────────

  describe("P0: validateScriptReady — 脚本为空", () => {
    it("getStageCount() 返回 0 时应抛出 StoryScriptError", () => {
      repo.setStages([]);
      expect(() =>
        engine["validateScriptReady"](),
      ).toThrow(StoryScriptError);
    });

    it("异常中的 stageIndex 应为 -1 (整体脚本错误)", () => {
      repo.setStages([]);
      try {
        engine["validateScriptReady"]();
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(StoryScriptError);
        expect((err as StoryScriptError).stageIndex).toBe(-1);
      }
    });

    it("异常 code 应为 STORY_SCRIPT_INVALID", () => {
      repo.setStages([]);
      try {
        engine["validateScriptReady"]();
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(StoryScriptError);
        expect((err as StoryScriptError).code).toBe("STORY_SCRIPT_INVALID");
      }
    });
  });

  // ── P1: validateScriptReady — 边界 ─────────────

  describe("P1: validateScriptReady — 脚本就绪边界", () => {
    it("getStageCount() 返回 7 → 应通过", () => {
      repo.setStages(create7Stages());
      expect(() =>
        engine["validateScriptReady"](),
      ).not.toThrow();
    });

    it("getStageCount() 返回 1 → 应通过", () => {
      repo.setStages([createValidStage()]);
      expect(() =>
        engine["validateScriptReady"](),
      ).not.toThrow();
    });
  });

  // ── P0: validateIsPlaying ──────────────────────

  describe("P0: validateIsPlaying — 未播放时暂停", () => {
    it("isPlaying = false 时应抛出 StoryScriptError", () => {
      engine.setStateForTesting({ isPlaying: false, isInterrupted: false });
      expect(() =>
        engine["validateIsPlaying"](),
      ).toThrow(StoryScriptError);
    });

    it("异常消息应提示'未在播放中'", () => {
      engine.setStateForTesting({ isPlaying: false, isInterrupted: false });
      try {
        engine["validateIsPlaying"]();
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(StoryScriptError);
        expect((err as StoryScriptError).code).toBe("STORY_STAGE_TRANSITION");
      }
    });
  });

  // ── P0: validateIsInterrupted ──────────────────

  describe("P0: validateIsInterrupted — 未中断时恢复", () => {
    it("isInterrupted = false 时应抛出 StoryScriptError", () => {
      engine.setStateForTesting({ isPlaying: false, isInterrupted: false });
      expect(() =>
        engine["validateIsInterrupted"](),
      ).toThrow(StoryScriptError);
    });

    it("isPlaying = true, isInterrupted = false → 应抛出", () => {
      engine.setStateForTesting({ isPlaying: true, isInterrupted: false });
      expect(() =>
        engine["validateIsInterrupted"](),
      ).toThrow(StoryScriptError);
    });
  });

  // ── P0: validatePlaybackState ──────────────────

  describe("P0: validatePlaybackState — 状态无效", () => {
    it("currentStage < 0 时应抛出 StoryScriptError", () => {
      const badState = createValidPlaybackState({ currentStage: -1 });
      expect(() =>
        engine["validatePlaybackState"](badState),
      ).toThrow(StoryScriptError);
    });

    it("currentStage >= totalStages 时应抛出 StoryScriptError", () => {
      const badState = createValidPlaybackState({ currentStage: 7, totalStages: 7 });
      expect(() =>
        engine["validatePlaybackState"](badState),
      ).toThrow(StoryScriptError);
    });

    it("progress < 0 时应抛出 StoryScriptError", () => {
      const badState = createValidPlaybackState({ progress: -0.1 });
      expect(() =>
        engine["validatePlaybackState"](badState),
      ).toThrow(StoryScriptError);
    });

    it("progress > 1 时应抛出 StoryScriptError", () => {
      const badState = createValidPlaybackState({ progress: 1.5 });
      expect(() =>
        engine["validatePlaybackState"](badState),
      ).toThrow(StoryScriptError);
    });
  });

  // ── P1: validatePlaybackState — 边界 ───────────

  describe("P1: validatePlaybackState — 边界值", () => {
    it("progress = 0 → 应通过 (最小值)", () => {
      const state = createValidPlaybackState({ progress: 0 });
      expect(() =>
        engine["validatePlaybackState"](state),
      ).not.toThrow();
    });

    it("progress = 1 → 应通过 (最大值)", () => {
      const state = createValidPlaybackState({ progress: 1 });
      expect(() =>
        engine["validatePlaybackState"](state),
      ).not.toThrow();
    });

    it("currentStage = 0, totalStages = 7 → 应通过", () => {
      const state = createValidPlaybackState({ currentStage: 0, totalStages: 7 });
      expect(() =>
        engine["validatePlaybackState"](state),
      ).not.toThrow();
    });

    it("currentStage = 6, totalStages = 7 → 应通过 (最后一个阶段)", () => {
      const state = createValidPlaybackState({ currentStage: 6, totalStages: 7 });
      expect(() =>
        engine["validatePlaybackState"](state),
      ).not.toThrow();
    });

    it("progress = NaN → 应抛出（已知漏洞已修复，Number.isNaN 守卫生效）", () => {
      const state = createValidPlaybackState({ progress: NaN });
      expect(() =>
        engine["validatePlaybackState"](state),
      ).toThrow(StoryScriptError);
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: 行为链破坏 — 事件顺序破坏", () => {
    it("跳过 play() 直接调用 pause() → 应抛出 StoryScriptError", async () => {
      engine.setStateForTesting({ isPlaying: false, isInterrupted: false });
      await expect(
        engine.pause(),
      ).rejects.toThrow(StoryScriptError);
    });

    it("跳过 pause() 直接调用 resume() → 应抛出 StoryScriptError", async () => {
      engine.setStateForTesting({ isPlaying: false, isInterrupted: false });
      await expect(
        engine.resume(),
      ).rejects.toThrow(StoryScriptError);
    });

    it("play → play (重复播放) → 应抛出 StoryScriptError", async () => {
      repo.setStages(create7Stages());
      engine.setStateForTesting({ isPlaying: true, isInterrupted: false });
      // validateNotAlreadyPlaying() 检测到 isPlaying=true，抛出异常
      await expect(engine.play()).rejects.toThrow(StoryScriptError);
    });
  });

  describe("P3: 行为链破坏 — stop 幂等性", () => {
    it("未播放时调用 stop() 应成功 (幂等)", async () => {
      // validateCanStop 是空实现，允许从任意状态 stop
      const state = await engine.stop();
      expect(state.isPlaying).toBe(false);
      expect(state.isInterrupted).toBe(false);
      expect(state.currentStage).toBe(0);
    });

    it("播放中调用 stop() 应重置状态", async () => {
      repo.setStages(create7Stages());
      await engine.play();
      const state = await engine.stop();
      expect(state.isPlaying).toBe(false);
      expect(state.isInterrupted).toBe(false);
      expect(state.currentStage).toBe(0);
    });

    it("暂停后调用 stop() 应重置状态", async () => {
      repo.setStages(create7Stages());
      engine.setStateForTesting({ isPlaying: true, isInterrupted: false });
      await engine.pause();
      const state = await engine.stop();
      expect(state.isPlaying).toBe(false);
      expect(state.currentStage).toBe(0);
    });
  });

  describe("P3: 正常流程 — play → pause → resume → stop", () => {
    it("完整生命周期应正常工作", async () => {
      repo.setStages(create7Stages());

      const playState = await engine.play();
      expect(playState.isPlaying).toBe(true);

      const pauseState = await engine.pause();
      expect(pauseState.isPlaying).toBe(false);
      expect(pauseState.isInterrupted).toBe(true);

      const resumeState = await engine.resume();
      expect(resumeState.isPlaying).toBe(true);
      expect(resumeState.isInterrupted).toBe(false);

      const stopState = await engine.stop();
      expect(stopState.isPlaying).toBe(false);
      expect(stopState.currentStage).toBe(0);
    });
  });

  // ── P0: validateCanStop — 幂等 (无异常) ────────

  describe("P0: validateCanStop — 幂等操作", () => {
    it("任意状态下调用 validateCanStop 都不应抛异常", () => {
      // 播放中
      engine.setStateForTesting({ isPlaying: true, isInterrupted: false });
      expect(() => engine["validateCanStop"]()).not.toThrow();

      // 暂停中
      engine.setStateForTesting({ isPlaying: false, isInterrupted: true });
      expect(() => engine["validateCanStop"]()).not.toThrow();

      // 已停止
      engine.setStateForTesting({ isPlaying: false, isInterrupted: false });
      expect(() => engine["validateCanStop"]()).not.toThrow();
    });
  });

  // ── 常量验证 ──────────────────────────────────

  describe("契约常量验证", () => {
    it("STORY_TOTAL_DURATION = 210s (3 分 30 秒)", () => {
      expect(STORY_TOTAL_DURATION).toBe(210);
    });

    it("STORY_STAGE_COUNT = 7", () => {
      expect(STORY_STAGE_COUNT).toBe(7);
    });
  });
});
