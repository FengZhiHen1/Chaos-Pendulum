/**
 * 模块: data.application.useCases.StoryScriptEngineImpl
 * 职责: StoryScriptEngine 契约的 Application 层实现——7 阶段时间轴自动演示引擎。
 *       按预设时间轴自动执行阶段切换，提供暂停/恢复/停止控制。
 * 依赖: IStoryScriptRepository, StoryStage, StoryPlaybackState
 */

import { StoryScriptEngine as StoryScriptEngineABC } from "../../contracts";
import type {
  IStoryScriptRepository,
  StoryStage,
  StoryPlaybackState,
} from "../../contracts";
import { StoryScriptError } from "../../contracts";
import type { AppMode } from "@/shared/domain/valueObjects";

/** 阶段结束事件类型 */
export type StoryEvent = "storyStart" | "storyEnd" | "storyInterrupted" | "stageEnter" | "stageExit";

/** 故事事件回调签名 */
export type StoryEventCallback = (event: StoryEvent, data?: unknown) => void;

/**
 * 故事脚本引擎实现。
 *
 * 按预设时间轴自动执行 7 阶段演示序列（总时长 3 分 30 秒）。
 * 使用 setTimeout 管理阶段间的自动转场。
 *
 * 在 doPlay/doPause/doResume/doStop 钩子中实现核心逻辑。
 * 脚本就绪校验、播放状态校验由父类 ABC 处理。
 */
export class StoryScriptEngineImpl extends StoryScriptEngineABC {
  /** 当前播放状态 */
  private state: StoryPlaybackState;
  /** 已加载的脚本（播放期间非 null） */
  private script: StoryStage[] | null = null;
  /** 阶段定时器 ID */
  private stageTimer: ReturnType<typeof setTimeout> | null = null;
  /** 阶段内经过的时间 (ms) */
  private elapsedInStage: number = 0;
  /** 阶段开始的 wall clock 时间戳 */
  private stageStartWallClock: number = 0;
  /** 事件回调列表 */
  private eventListeners: StoryEventCallback[] = [];

  constructor(scriptRepo: IStoryScriptRepository) {
    super(scriptRepo);
    this.state = this.createInitialState();
  }

  // ── 公共入口 ──

  /** 获取当前播放状态——实时计算墙钟时间（含阶段内偏移，非阶段起始快照）。 */
  getCurrentState(): StoryPlaybackState {
    const base = { ...this.state };
    // 播放中：阶段起始时间 + 已累积播放 + 当前墙钟偏移
    if (base.isPlaying && this.stageStartWallClock > 0) {
      const wallMs = Date.now() - this.stageStartWallClock;
      const totalPlayedS = (this.elapsedInStage + wallMs) / 1000;
      base.elapsedTime = Math.min(base.totalDuration, base.elapsedTime + totalPlayedS);
      base.progress = base.elapsedTime / base.totalDuration;
    } else if (!base.isPlaying && this.elapsedInStage > 0) {
      // 暂停中：仅包含已累积的播放时间（不含暂停间隙）
      const playedS = this.elapsedInStage / 1000;
      base.elapsedTime = Math.min(base.totalDuration, base.elapsedTime + playedS);
      base.progress = base.elapsedTime / base.totalDuration;
    }
    return base;
  }

  // ── 事件系统 ──

  /** 注册故事事件回调。 */
  onEvent(callback: StoryEventCallback): void {
    this.eventListeners.push(callback);
  }

  /** 移除故事事件回调。 */
  offEvent(callback: StoryEventCallback): void {
    this.eventListeners = this.eventListeners.filter((cb) => cb !== callback);
  }

  /** 触发事件通知所有监听器。 */
  private emit(event: StoryEvent, data?: unknown): void {
    for (const cb of this.eventListeners) {
      try {
        cb(event, data);
      } catch {
        // 事件回调异常不应影响引擎运行
      }
    }
  }

  // ── 模板钩子实现 ──

  /**
   * 实现播放逻辑——加载脚本并按时间轴自动推进各阶段。
   */
  protected async doPlay(): Promise<StoryPlaybackState> {
    // 加载脚本
    this.script = await this.scriptRepo.loadScript();
    const script = this.script; // 类型收窄
    const firstStage = script[0];
    if (!firstStage) {
      throw new StoryScriptError(
        "STORY_SCRIPT_INVALID",
        "脚本阶段 0 缺失",
        "StoryScriptEngineImpl.doPlay()",
        0,
      );
    }

    this.state = {
      isPlaying: true,
      isInterrupted: false,
      currentStage: 0,
      totalStages: script.length,
      elapsedTime: 0,
      totalDuration: this.scriptRepo.getTotalDuration(),
      progress: 0,
      currentSubtitle: firstStage.subtitle,
      highlightedControls: firstStage.highlightedControls,
      currentMode: firstStage.targetMode,
    };

    this.emit("storyStart");
    await this.enterStage(0);

    return this.getCurrentState();
  }

  /**
   * 实现暂停逻辑。
   */
  protected async doPause(): Promise<StoryPlaybackState> {
    this.clearTimer();
    // 记录阶段内已过时间
    if (this.stageStartWallClock > 0) {
      this.elapsedInStage += Date.now() - this.stageStartWallClock;
    }

    this.state = {
      ...this.state,
      isPlaying: false,
      isInterrupted: true,
    };

    // 退出当前阶段
    const currentScript = this.script;
    if (currentScript && this.state.currentStage < currentScript.length) {
      const stage = currentScript[this.state.currentStage];
      if (stage) {
        await this.onStageExit(stage, this.state.currentStage);
      }
    }

    this.emit("storyInterrupted", this.state);
    return this.getCurrentState();
  }

  /**
   * 实现恢复逻辑——从中断时间点恢复。
   */
  protected async doResume(): Promise<StoryPlaybackState> {
    const script = this.script;
    if (!script) {
      throw new StoryScriptError(
        "STORY_SCRIPT_INVALID",
        "脚本未加载——无法恢复播放",
        "StoryScriptEngineImpl.doResume()",
        -1,
      );
    }

    const currentStage = this.state.currentStage;

    this.state = {
      ...this.state,
      isPlaying: true,
      isInterrupted: false,
    };

    // 重新进入当前阶段——先重置墙钟，确保 getCurrentState() 不包含暂停间隙
    this.stageStartWallClock = Date.now();
    await this.enterStage(currentStage);

    // 恢复阶段内定时器（使用剩余时间）
    const stage = script[currentStage];
    if (!stage) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        `阶段 ${currentStage} 不存在`,
        "StoryScriptEngineImpl.doResume()",
        currentStage,
      );
    }
    const remaining = (stage.duration * 1000) - this.elapsedInStage;
    if (remaining > 0) {
      this.scheduleStageTransition(remaining);
    } else {
      // 剩余时间为零或负 → 立即进入下一阶段
      await this.advanceToNextStage();
    }

    return this.getCurrentState();
  }

  /**
   * 实现停止/重置逻辑。
   */
  protected async doStop(): Promise<StoryPlaybackState> {
    const wasPlaying = this.state.isPlaying;
    this.clearTimer();

    // 退出当前阶段
    const currentScript = this.script;
    if (currentScript && this.state.currentStage < currentScript.length) {
      const stage = currentScript[this.state.currentStage];
      if (stage) {
        try {
          await this.onStageExit(stage, this.state.currentStage);
        } catch {
          // 阶段退出回调异常不阻止停止
        }
      }
    }

    if (wasPlaying) {
      this.emit("storyEnd");
    }

    this.state = this.createInitialState();
    this.script = null;
    this.elapsedInStage = 0;
    this.stageStartWallClock = 0;

    return this.getCurrentState();
  }

  // ── 阶段切换回调（子类可覆写以接入外部系统） ──

  /**
   * 阶段进入回调。
   */
  protected async onStageEnter(stage: StoryStage, index: number): Promise<void> {
    this.emit("stageEnter", { stage, index });
  }

  /**
   * 阶段退出回调。
   */
  protected async onStageExit(stage: StoryStage, index: number): Promise<void> {
    this.emit("stageExit", { stage, index });
  }

  /**
   * 字幕更新回调。
   */
  protected onSubtitleChange(subtitle: string): void {
    this.state = { ...this.state, currentSubtitle: subtitle };
  }

  /**
   * 控件高亮切换回调。
   */
  protected onHighlightChange(controlIds: string[]): void {
    this.state = { ...this.state, highlightedControls: controlIds };
  }

  // ── 内部辅助 ──

  /** 创建初始状态。 */
  private createInitialState(): StoryPlaybackState {
    const totalStages = this.scriptRepo.getStageCount();
    const totalDuration = this.scriptRepo.getTotalDuration();
    return {
      isPlaying: false,
      isInterrupted: false,
      currentStage: 0,
      totalStages,
      elapsedTime: 0,
      totalDuration,
      progress: 0,
      currentSubtitle: "",
      highlightedControls: [],
      currentMode: "explore" as AppMode,
    };
  }

  /** 获取当前脚本（内部辅助——断言已加载）。 */
  private requireScript(): StoryStage[] {
    if (!this.script) {
      throw new StoryScriptError(
        "STORY_SCRIPT_INVALID",
        "脚本未加载——内部错误",
        "StoryScriptEngineImpl.requireScript()",
        -1,
      );
    }
    return this.script;
  }

  /** 安全获取指定阶段。 */
  private getStageAt(index: number): StoryStage {
    const script = this.requireScript();
    const stage = script[index];
    if (!stage) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        `阶段 ${index} 不存在 (脚本长度: ${script.length})`,
        "StoryScriptEngineImpl.getStageAt()",
        index,
      );
    }
    return stage;
  }

  /** 进入指定阶段。 */
  private async enterStage(index: number): Promise<void> {
    const stage = this.getStageAt(index);

    // 更新状态
    this.state = {
      ...this.state,
      currentStage: index,
      currentSubtitle: stage.subtitle,
      highlightedControls: stage.highlightedControls,
      currentMode: stage.targetMode,
    };

    // 计算阶段开始时间
    this.state = { ...this.state, elapsedTime: stage.startTime };

    await this.onStageEnter(stage, index);
    this.onSubtitleChange(stage.subtitle);
    this.onHighlightChange(stage.highlightedControls);

    // 启动阶段定时器（仅在非恢复时）
    if (this.elapsedInStage === 0) {
      this.stageStartWallClock = Date.now();
      this.scheduleStageTransition(stage.duration * 1000);
    }
  }

  /** 调度阶段结束 → 下一阶段或结束。 */
  private scheduleStageTransition(delayMs: number): void {
    this.clearTimer();
    this.stageTimer = setTimeout(async () => {
      if (!this.state.isPlaying) return;
      await this.advanceToNextStage();
    }, delayMs);
  }

  /** 推进到下一阶段或结束。 */
  private async advanceToNextStage(): Promise<void> {
    const script = this.requireScript();
    const currentIndex = this.state.currentStage;
    const currentStage = this.getStageAt(currentIndex);

    await this.onStageExit(currentStage, currentIndex);

    const nextIndex = currentIndex + 1;
    if (nextIndex >= script.length) {
      // 脚本结束
      this.state = { ...this.state, isPlaying: false, progress: 1 };
      this.emit("storyEnd");
      return;
    }

    // 进入下一阶段
    this.elapsedInStage = 0;
    await this.enterStage(nextIndex);

    // 更新进度
    const nextStage = this.getStageAt(nextIndex);
    this.state = {
      ...this.state,
      progress: nextStage.startTime / this.state.totalDuration,
    };
  }

  /** 清除阶段定时器。 */
  private clearTimer(): void {
    if (this.stageTimer !== null) {
      clearTimeout(this.stageTimer);
      this.stageTimer = null;
    }
  }
}
