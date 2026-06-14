/**
 * 模块: data.contracts.history-playback
 * 职责: DAT-03 历史回放与分叉契约——沿时间轴回溯历史状态，从任意历史时刻分叉演化。
 *       暂停状态下时间轴可拖拽回溯，选择过去某一时刻后修改参数从该点继续演化，
 *       原始轨迹以半透明幽灵尾迹保留作为对照。
 * 数据来源:
 *   - RingBuffer (data/domain): MUST — 历史帧数据的随机访问
 *   - IHistoryRepository (simulation/contracts): SHOULD — 正向轨迹持久化
 *   - IWorkerGateway (simulation/contracts): MUST — 分叉时创建新 Worker 实例
 *   - ISimulationScheduler (simulation/contracts): MUST — 仿真时间控制和暂停检测
 *   - StateVector (shared/domain/valueObjects): MUST — 历史状态向量
 * 边界:
 *   - 依赖: simulation/contracts, data/domain (RingBuffer), shared/domain/valueObjects
 *   - 被依赖: DataPage (View), DataSlice (ViewModel)
 * 禁止行为:
 *   - 禁止在仿真运行中进入回放模式（必须先暂停）
 *   - 禁止在 RingBuffer 范围外查询历史帧
 *   - 禁止分叉时修改原始 RingBuffer（分叉使用独立 Worker 实例）
 *   - 禁止在 Import 中包含 React/Zustand（Application 层无状态）
 */

import type {
  PlaybackState,
  ForkConfig,
  GhostTrailConfig,
} from "./types.contract";
import type { StateVector } from "@/shared/domain/valueObjects";
import { PlaybackOutOfRangeError, ForkError } from "./exceptions";
import { RING_BUFFER_CAPACITY } from "./types.contract";

// ─── 端口接口 ─────────────────────────────────────

/**
 * @contract IRingBufferReader — RingBuffer 只读访问端口。
 *
 * 为回放提供历史帧的随机访问能力，不暴露 RingBuffer 的可变操作。
 *
 * 前置: RingBuffer 已实例化（capacity = 6000 帧）
 * 后置: at(index) 返回指定索引的 StateVector 或 undefined
 * 输入约束:
 *   - index: [0, count) 范围内的帧索引
 *   - time: [0, totalTime] 范围内的仿真时间 (s)
 * 输出约束:
 *   - at(index) 返回原始帧的防御性拷贝
 * 异常: 无——越界返回 undefined
 * Side Effects: 无——只读访问
 */
export interface IRingBufferReader {
  /** 按索引读取帧。越界返回 undefined。 */
  at(index: number): StateVector | undefined;

  /** 读取最新一帧。 */
  latest(): StateVector | undefined;

  /** 当前帧数。 */
  get length(): number;

  /** RingBuffer 容量。 */
  get capacity(): number;

  /** 获取所有帧的防御性拷贝（时间顺序）。 */
  toArray(): StateVector[];

  /**
   * 按仿真时间查找最接近的帧索引。
   * @param time 仿真时间 (s)
   * @returns 最接近的帧索引，-1 表示不在范围内
   */
  findIndexByTime(time: number): number;
}

// ─── 行为契约（抽象类） ──────────────────────────

/**
 * @contract HistoryPlaybackUseCase — 历史回放用例。
 *
 * 暂停状态下沿时间轴拖拽回溯历史状态。
 * 基于 RingBuffer（6000 帧 = 100s @60fps）提供随机访问。
 * 时间轴可拖拽，当前帧的仿真状态实时更新到 UI。
 *
 * 前置: 仿真已暂停（isRunning = false）
 * 后置: 回放时间轴定位到指定时刻
 * 输入约束:
 *   - time: 目标回放时间 (s)，在 RingBuffer 覆盖范围内
 * 输出约束:
 *   - 返回 PlaybackState 反映当前位置
 *   - 3D 场景更新为对应时刻的摆锤姿态
 * 异常:
 *   - PlaybackNotPausedError: 仿真未暂停
 *   - PlaybackOutOfRangeError: 时间超出 RingBuffer 范围
 * Side Effects:
 *   - 更新 3D 场景中的摆锤位置（通过状态注入）
 *   - 可能读取 IHistoryRepository 获取超出 RingBuffer 的历史
 */
export abstract class HistoryPlaybackUseCase {
  constructor(
    protected readonly ringBuffer: IRingBufferReader,
  ) {}

  /**
   * 将回放定位到指定时间。
   *
   * 子类不得覆写此方法。
   */
  async seekTo(time: number): Promise<PlaybackState> {
    this.validateSeekTime(time);
    const state = await this.doSeekTo(time);
    this.validatePlaybackState(state);
    return state;
  }

  /**
   * 按偏移量步进（前进/后退）。
   *
   * 子类不得覆写此方法。
   */
  async step(offsetSeconds: number): Promise<PlaybackState> {
    const currentTime = this.getCurrentState().currentTime;
    const targetTime = currentTime + offsetSeconds;
    this.validateSeekTime(targetTime);
    const state = await this.doSeekTo(targetTime);
    this.validatePlaybackState(state);
    return state;
  }

  /**
   * 跳转到最新帧（回到实时）。
   *
   * 子类不得覆写此方法。
   */
  async goToLatest(): Promise<PlaybackState> {
    this.validateRingBufferNotEmpty();
    const state = await this.doSeekTo(this.ringBuffer.length - 1);
    this.validatePlaybackState(state);
    return state;
  }

  /** 获取当前回放状态。 */
  abstract getCurrentState(): PlaybackState;

  // ── 模板钩子 ──

  /**
   * 实现回放定位逻辑——从 RingBuffer 读取对应帧并更新 3D 场景。
   *
   * 不需要关心:
   *   - 范围校验——seekTo()/step() 入口已处理
   *   - 状态校验——seekTo()/step() 入口已处理
   */
  protected abstract doSeekTo(time: number): Promise<PlaybackState>;

  // ── 基线校验器 ──

  /**
   * 基线：验证 RingBuffer 非空。
   * @throws PlaybackOutOfRangeError — RingBuffer 为空
   */
  protected validateRingBufferNotEmpty(): void {
    if (this.ringBuffer.length === 0) {
      throw new PlaybackOutOfRangeError(
        "RingBuffer 为空——无历史数据可回放",
        "HistoryPlaybackUseCase.goToLatest()",
        0,
        [0, 0],
      );
    }
  }

  /**
   * 基线：验证回放时间在 RingBuffer 范围内。
   * @throws PlaybackOutOfRangeError — 时间超出范围
   */
  protected validateSeekTime(time: number): void {
    if (time < 0) {
      throw new PlaybackOutOfRangeError(
        `回放时间不能为负: ${time}s`,
        "HistoryPlaybackUseCase.seekTo()",
        time,
        [0, this.ringBuffer.length / 60 * (RING_BUFFER_CAPACITY / 100)],
      );
    }
    // 将时间转换为帧索引检查
    const fps = 60;
    const frameIndex = Math.round(time * fps);
    if (frameIndex >= this.ringBuffer.length) {
      throw new PlaybackOutOfRangeError(
        `回放时间超出范围: ${time}s (最晚: ${(this.ringBuffer.length - 1) / fps}s)`,
        "HistoryPlaybackUseCase.seekTo()",
        time,
        [0, (this.ringBuffer.length - 1) / fps],
      );
    }
  }

  /**
   * 基线：验证回放状态完整性。
   * @throws PlaybackOutOfRangeError — 状态字段非法
   */
  protected validatePlaybackState(state: PlaybackState): void {
    if (state.currentTime < 0) {
      throw new PlaybackOutOfRangeError(
        `回放状态无效: currentTime=${state.currentTime}`,
        "HistoryPlaybackUseCase.validatePlaybackState()",
        state.currentTime,
        [0, state.totalTime],
      );
    }
  }
}

/**
 * @contract ForkSimulationUseCase — 分叉演化用例。
 *
 * 从 RingBuffer 历史时刻提取状态，修改参数后创建新 Worker 实例从该点继续演化。
 * 原始轨迹以半透明幽灵尾迹保留作为对照。
 *
 * 前置: 回放已定位到目标时刻
 * 后置: 新 Worker 实例已启动，从 forkTime 开始演化
 * 输入约束:
 *   - forkConfig: 完整的 ForkConfig（forkTime 在 RingBuffer 范围内，initialState 有效）
 * 输出约束:
 *   - 返回 GhostTrailConfig 供 TrailRenderer 渲染原始轨迹
 *   - 新 Worker 实例独立于原始仿真运行
 * 异常:
 *   - ForkError: forkTime 超出范围、initialState 无效、Worker 创建失败
 * Side Effects:
 *   - 创建新 Worker 实例（初始条件 = forkConfig.initialState）
 *   - 原始轨迹以半透明叠加到 3D 场景
 *   - 可能记录分叉审计日志
 */
export abstract class ForkSimulationUseCase {
  constructor(
    protected readonly ringBuffer: IRingBufferReader,
  ) {}

  /**
   * 从指定历史时刻分叉演化。
   *
   * 子类不得覆写此方法。
   */
  async execute(forkConfig: ForkConfig): Promise<GhostTrailConfig> {
    this.validateForkConfig(forkConfig);
    const ghostTrail = await this.doExecute(forkConfig);
    this.validateGhostTrail(ghostTrail);
    return ghostTrail;
  }

  /**
   * 取消分叉——终止分叉 Worker 实例，清除幽灵尾迹。
   *
   * 子类不得覆写此方法。
   */
  async cancel(): Promise<void> {
    this.validateForkActive();
    await this.doCancel();
    this.validateForkDeactivated();
  }

  // ── 模板钩子 ──

  /**
   * 实现分叉逻辑——从 RingBuffer 提取初始状态 → 创建新 Worker → 启动演化。
   *
   * 不需要关心:
   *   - 配置校验——execute() 入口已处理
   *   - 幽灵尾迹校验——execute() 入口已处理
   */
  protected abstract doExecute(forkConfig: ForkConfig): Promise<GhostTrailConfig>;

  /** 实现取消逻辑——终止分叉 Worker + 清除幽灵尾迹。 */
  protected abstract doCancel(): Promise<void>;

  /** 分叉当前是否活跃。 */
  abstract isForkActive(): boolean;

  // ── 基线校验器 ──

  /**
   * 基线：验证分叉配置。
   * @throws ForkError — 任何校验失败
   */
  protected validateForkConfig(config: ForkConfig): void {
    if (config.forkTime < 0) {
      throw new ForkError(
        "FORK_OUT_OF_RANGE",
        `分叉时间不能为负: ${config.forkTime}s`,
        "ForkSimulationUseCase.execute()",
        config.forkTime,
      );
    }

    const initialState = config.initialState;
    if (!initialState) {
      throw new ForkError(
        "FORK_INIT_FAILED",
        "初始状态为空",
        "ForkSimulationUseCase.execute()",
        config.forkTime,
      );
    }
    if (
      !Number.isFinite(initialState.theta1) ||
      !Number.isFinite(initialState.omega1) ||
      !Number.isFinite(initialState.theta2) ||
      !Number.isFinite(initialState.omega2)
    ) {
      throw new ForkError(
        "FORK_INIT_FAILED",
        `初始状态含非有限值: [θ₁=${initialState.theta1}, ω₁=${initialState.omega1}, θ₂=${initialState.theta2}, ω₂=${initialState.omega2}]`,
        "ForkSimulationUseCase.execute()",
        config.forkTime,
      );
    }

    // 验证分叉时间在 RingBuffer 范围内
    const fps = 60;
    const frameIndex = Math.round(config.forkTime * fps);
    if (frameIndex >= this.ringBuffer.length) {
      throw new ForkError(
        "FORK_OUT_OF_RANGE",
        `分叉时间超出 RingBuffer 范围: ${config.forkTime}s (已录制: ${(this.ringBuffer.length - 1) / fps}s)`,
        "ForkSimulationUseCase.execute()",
        config.forkTime,
      );
    }
  }

  /**
   * 基线：验证分叉当前活跃。
   * @throws ForkError — 无活跃分叉
   */
  protected validateForkActive(): void {
    if (!this.isForkActive()) {
      throw new ForkError(
        "FORK_INIT_FAILED",
        "无活跃分叉——无法取消",
        "ForkSimulationUseCase.cancel()",
        -1,
      );
    }
  }

  /**
   * 基线：验证分叉已成功取消。
   * @throws ForkError — 取消后分叉仍活跃
   */
  protected validateForkDeactivated(): void {
    if (this.isForkActive()) {
      throw new ForkError(
        "FORK_INIT_FAILED",
        "分叉取消失败——取消后仍处于活跃状态",
        "ForkSimulationUseCase.cancel()",
        -1,
      );
    }
  }

  /**
   * 基线：验证幽灵尾迹配置。
   * @throws ForkError — opacity 无效
   */
  protected validateGhostTrail(ghostTrail: GhostTrailConfig): void {
    if (ghostTrail.opacity < 0 || ghostTrail.opacity > 1) {
      throw new ForkError(
        "FORK_INIT_FAILED",
        `幽灵尾迹透明度无效: ${ghostTrail.opacity}`,
        "ForkSimulationUseCase.execute()",
        -1,
      );
    }
    if (!ghostTrail.color || !ghostTrail.color.startsWith("#")) {
      throw new ForkError(
        "FORK_INIT_FAILED",
        `幽灵尾迹颜色无效: ${ghostTrail.color}`,
        "ForkSimulationUseCase.execute()",
        -1,
      );
    }
  }
}

// ─── 纯函数辅助 ───────────────────────────────────

/**
 * 从 RingBuffer 中提取指定时刻的状态向量。
 *
 * 前置: ringBuffer 已填充数据
 * 后置: 返回 StateVector 或 undefined
 * 输入约束:
 *   - reader: 有效的 IRingBufferReader
 *   - time: 仿真时间 (s)
 * 输出约束:
 *   - 返回指定时刻的 StateVector
 *   - 如果时间超出范围，返回 undefined
 * 异常: 无
 * Side Effects: 无
 */
export function extractStateAtTime(
  reader: IRingBufferReader,
  time: number,
): StateVector | undefined {
  const fps = 60;
  const frameIndex = Math.round(time * fps);
  return reader.at(frameIndex);
}

/**
 * 构建默认的幽灵尾迹配置。
 *
 * 前置: trailData 非空
 * 后置: 返回有效的 GhostTrailConfig
 * 输入约束:
 *   - trailData: 分叉前的原始轨迹数据
 *   - opacity: 透明度 [0, 1]，默认 0.3
 *   - color: 颜色十六进制，默认半透明蓝色
 * 输出约束: opacity ∈ [0, 1]
 * 异常: 无
 * Side Effects: 无
 */
export function createDefaultGhostTrail(
  trailData: StateVector[],
  opacity: number = 0.3,
  color: string = "#4488ff",
): GhostTrailConfig {
  return {
    opacity: Math.max(0, Math.min(1, opacity)),
    color,
    trailData,
  };
}
