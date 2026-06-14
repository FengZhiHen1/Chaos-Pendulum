/**
 * 模块: data.contracts.story-script
 * 职责: STY-01 故事脚本引擎契约——7 阶段预设时间轴自动演示序列。
 *       提供一键科普讲解，评审体验的核心触点。
 * 数据来源:
 *   - ISimulationScheduler (simulation/contracts): MUST — 仿真时间轴控制
 *   - IParameterPanel (control/contracts): MUST — 阶段间参数注入
 *   - NavigationController (control/contracts): MUST — 阶段间模式切换
 *   - IWorkerGateway (simulation/contracts): SHOULD — 蝴蝶效应触发
 * 边界:
 *   - 依赖: simulation/contracts, control/contracts, explore/contracts
 *   - 被依赖: StoryPage (View), StorySlice (ViewModel)
 * 禁止行为:
 *   - 禁止硬编码 7 阶段顺序（脚本应从数据源加载——支持运行时动态修改）
 *   - 禁止在故事播放期间允许用户切换模式（导航栏锁定）
 *   - 禁止绕过状态机直接操作仿真参数
 *   - 禁止在 Import 中包含 React/Zustand（Application 层无状态）
 */

import type { StoryStage, StoryPlaybackState } from "./types.contract";
import { StoryScriptError } from "./exceptions";

// ─── 端口接口 ─────────────────────────────────────

/**
 * @contract IStoryScriptRepository — 故事脚本仓储端口。
 *
 * 提供故事脚本数据的加载和查询。实现者可选择：
 *   - 从硬编码常量加载（当前）
 *   - 从远程 API 加载（未来扩展）
 *   - 从 IndexedDB 加载（用户自定义脚本）
 *
 * 前置: 无
 * 后置: 返回完整有效的 7 阶段脚本
 * 输入约束: 无
 * 输出约束: 阶段按 startTime 升序排列，总时长 = 210s
 * 异常: StoryScriptError — 脚本缺失或格式无效
 * Side Effects: 可能触发网络请求（依赖实现）
 */
export interface IStoryScriptRepository {
  /** 加载完整故事脚本 */
  loadScript(): Promise<StoryStage[]>;

  /** 获取指定阶段的详情 */
  getStage(index: number): Promise<StoryStage>;

  /** 脚本总阶段数 */
  getStageCount(): number;

  /** 脚本总时长 (s) */
  getTotalDuration(): number;
}

// ─── 行为契约（抽象类） ──────────────────────────

/**
 * @contract StoryScriptEngine — 故事脚本引擎。
 *
 * 按预设时间轴自动执行 7 阶段演示序列（总时长 3 分 30 秒），
 * 实现一键科普讲解。包括：
 * - 阶段间自动转场（setMode/injectParams/setCamera/startButterfly）
 * - 底部电影式字幕（framer-motion 淡入淡出）
 * - 当前可交互控件脉冲高亮
 * - 任意位置点击暂停→切换手动探索
 * - 故事播放期间导航栏锁定
 *
 * 前置: 仿真引擎已初始化
 * 后置: storyEnd 事件派发 或 storyInterrupted（用户打断）
 * 输入约束:
 *   - 脚本 Repository 提供有效的 7 阶段 Stage[]
 *   - 每个阶段包含完整的 duration/targetMode/subtitle
 * 输出约束:
 *   - 全自动执行，无用户干预需求
 *   - 字幕在每个阶段切换时淡入淡出
 * 异常:
 *   - StoryScriptError: 脚本格式无效或阶段索引越界
 * Side Effects:
 *   - 派发 storyStart/storyEnd/storyInterrupted 事件
 *   - 调用 ISimulationScheduler 控制仿真时间
 *   - 调用 NavigationController 切换模式
 *   - 锁定/解锁导航栏
 */
export abstract class StoryScriptEngine {
  constructor(
    protected readonly scriptRepo: IStoryScriptRepository,
  ) {}

  // ── 公共入口（子类不得覆写） ──

  /**
   * 启动故事播放。
   *
   * 前置: 当前阶段 = 0，仿真处于 idle 状态
   * 后置: 自动按时间轴推进 7 个阶段
   * 输入约束: 无额外参数——脚本由 scriptRepo 提供
   * 输出约束: 返回当前播放状态
   * 异常: StoryScriptError — 脚本为空或阶段 0 定义缺失
   * Side Effects:
   *   - 派发 storyStart 事件
   *   - 导航栏锁定（storyPhase → SIM-03 消费）
   *   - 开始第一阶段
   */
  async play(): Promise<StoryPlaybackState> {
    this.validateScriptReady();
    this.validateNotAlreadyPlaying();
    const state = await this.doPlay();
    this.validatePlaybackState(state);
    return state;
  }

  /**
   * 暂停故事播放。
   *
   * 前置: isPlaying = true
   * 后置: isPlaying = false, isInterrupted = true
   * 输入约束: 无
   * 输出约束: 返回暂停时的完整状态
   * 异常: StoryScriptError — 未在播放中
   * Side Effects:
   *   - 派发 storyInterrupted 事件
   *   - 导航栏解锁——切换为手动探索模式
   */
  async pause(): Promise<StoryPlaybackState> {
    this.validateIsPlaying();
    const state = await this.doPause();
    this.validatePlaybackState(state);
    return state;
  }

  /**
   * 继续播放（从暂停点恢复）。
   *
   * 前置: isPlaying = false, isInterrupted = true
   * 后置: isPlaying = true, isInterrupted = false
   * 输入约束: 从当前阶段的中断时间点恢复
   * 输出约束: 返回恢复后的播放状态
   * 异常: StoryScriptError — 未处于暂停状态
   * Side Effects:
   *   - 导航栏重新锁定
   *   - 从当前阶段恢复时间轴推进
   */
  async resume(): Promise<StoryPlaybackState> {
    this.validateIsInterrupted();
    const state = await this.doResume();
    this.validatePlaybackState(state);
    return state;
  }

  /**
   * 停止故事播放，重置到初始状态。
   *
   * 前置: 无（幂等——未播放时调用无效果）
   * 后置: isPlaying = false, currentStage = 0, isInterrupted = false
   * 输入约束: 无
   * 输出约束: 返回重置后的初始状态
   * 异常: 无
   * Side Effects:
   *   - 派发 storyEnd 事件（如果正在播放中）
   *   - 导航栏解锁
   */
  async stop(): Promise<StoryPlaybackState> {
    this.validateCanStop();
    const state = await this.doStop();
    this.validatePlaybackState(state);
    return state;
  }

  /**
   * 获取当前播放状态（不触发任何副作用）。
   *
   * 前置: 无
   * 后置: 返回当前状态的快照
   * 异常: 无
   * Side Effects: 无——纯读取
   */
  abstract getCurrentState(): StoryPlaybackState;

  // ── 事件（子类实现） ──

  /** 阶段切换回调。实现者在此执行模式切换、参数注入、相机更新。 */
  protected abstract onStageEnter(stage: StoryStage, index: number): Promise<void>;

  /** 阶段退出回调。实现者在此清理当前阶段的高亮和特效。 */
  protected abstract onStageExit(stage: StoryStage, index: number): Promise<void>;

  /** 字幕更新回调。实现者在此触发 framer-motion 淡入淡出。 */
  protected abstract onSubtitleChange(subtitle: string): void;

  /** 控件高亮切换回调。 */
  protected abstract onHighlightChange(controlIds: string[]): void;

  // ── 模板钩子（实现者必填） ──

  /**
   * 实现播放逻辑——按时间轴自动推进各阶段。
   *
   * 不需要关心:
   *   - 脚本就绪校验——play() 入口已处理
   *   - 导航栏锁定——StoryScriptEngine 的 play() 已处理
   *   - 播放状态校验——play() 入口已处理
   */
  protected abstract doPlay(): Promise<StoryPlaybackState>;

  /** 实现暂停逻辑。不需要关心播放状态校验——pause() 入口已处理。 */
  protected abstract doPause(): Promise<StoryPlaybackState>;

  /** 实现恢复逻辑。不需要关心中断状态校验——resume() 入口已处理。 */
  protected abstract doResume(): Promise<StoryPlaybackState>;

  /** 实现停止/重置逻辑。 */
  protected abstract doStop(): Promise<StoryPlaybackState>;

  // ── 基线校验器 ──

  /**
   * 基线：验证可以停止（幂等——允许从任意状态停止）。
   * @no-pre-validate — stop 是幂等操作，任何状态均可调用
   */
  protected validateCanStop(): void {
    // stop 是幂等操作——允许从任意状态调用。
    // 如果已经停止（isPlaying=false, isInterrupted=false），doStop 是 no-op。
  }

  /**
   * 基线：验证脚本已就绪。
   * @throws StoryScriptError — 脚本为空或未加载
   */
  protected validateScriptReady(): void {
    const count = this.scriptRepo.getStageCount();
    if (count === 0) {
      throw new StoryScriptError(
        "STORY_SCRIPT_INVALID",
        "故事脚本为空或未加载——getStageCount() 返回 0",
        "StoryScriptEngine.play()",
        -1,
      );
    }
  }

  /**
   * 基线：验证未在播放中（防止重复启动）。
   * @throws StoryScriptError — 已在播放中
   */
  protected validateNotAlreadyPlaying(): void {
    const state = this.getCurrentState();
    if (state.isPlaying) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        "故事已在播放中——无法重复启动",
        "StoryScriptEngine.play()",
        state.currentStage,
      );
    }
  }

  /**
   * 基线：验证正在播放中。
   * @throws StoryScriptError — 未处于播放状态
   */
  protected validateIsPlaying(): void {
    const state = this.getCurrentState();
    if (!state.isPlaying) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        "故事未在播放中——无法暂停",
        "StoryScriptEngine.pause()",
        state.currentStage,
      );
    }
  }

  /**
   * 基线：验证处于中断状态。
   * @throws StoryScriptError — 未被中断
   */
  protected validateIsInterrupted(): void {
    const state = this.getCurrentState();
    if (!state.isInterrupted) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        "故事未处于暂停状态——无法恢复",
        "StoryScriptEngine.resume()",
        state.currentStage,
      );
    }
  }

  /**
   * 基线：验证播放状态的完整性。
   * @throws StoryScriptError — 状态字段不合法
   */
  protected validatePlaybackState(state: StoryPlaybackState): void {
    if (state.currentStage < 0 || state.currentStage >= state.totalStages) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        `播放状态无效：currentStage=${state.currentStage}, totalStages=${state.totalStages}`,
        "StoryScriptEngine.validatePlaybackState()",
        state.currentStage,
      );
    }
    if (state.progress < 0 || state.progress > 1) {
      throw new StoryScriptError(
        "STORY_STAGE_TRANSITION",
        `播放进度无效：progress=${state.progress}`,
        "StoryScriptEngine.validatePlaybackState()",
        state.currentStage,
      );
    }
  }
}
