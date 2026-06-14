/**
 * 模块: data.application.useCases.HistoryPlaybackUseCaseImpl
 * 职责: HistoryPlaybackUseCase 契约的 Application 层实现——RingBuffer 随机访问回放。
 * 依赖: IRingBufferReader, PlaybackState
 */

import { HistoryPlaybackUseCase as HistoryPlaybackUseCaseABC } from "../../contracts";
import type { IRingBufferReader, PlaybackState } from "../../contracts";

/**
 * 历史回放用例实现。
 *
 * 基于 RingBuffer 的随机访问能力，提供时间轴拖拽回溯。
 * 在 doSeekTo 钩子中实现核心定位逻辑。
 * 范围校验和状态校验由父类 ABC 处理。
 */
export class HistoryPlaybackUseCaseImpl extends HistoryPlaybackUseCaseABC {
  /** 当前回放状态 */
  private state: PlaybackState;

  /** 仿真帧率 (fps) */
  private readonly fps: number;

  constructor(ringBuffer: IRingBufferReader, fps: number = 60) {
    super(ringBuffer);
    this.fps = fps;
    this.state = this.buildState();
  }

  /** 获取当前回放状态（无副作用）。 */
  getCurrentState(): PlaybackState {
    return { ...this.state };
  }

  /**
   * 实现回放定位逻辑——从 RingBuffer 读取对应帧并构建状态。
   *
   * 不需要关心:
   *   - 范围校验——seekTo()/step() 入口已处理
   *   - 状态校验——seekTo()/step() 入口已处理
   */
  protected async doSeekTo(time: number): Promise<PlaybackState> {
    // 范围已在 validateSeekTime 中校验
    // RingBuffer 的 at() 用于从外部读取对应帧状态
    this.state = this.buildState(time);

    // 返回当前状态
    return this.getCurrentState();
  }

  // ── 内部辅助 ──

  /**
   * 构建回放状态快照。
   * @param currentTime 当前回放时间 (s)，默认 0
   */
  private buildState(currentTime: number = 0): PlaybackState {
    const totalFrames = this.ringBuffer.length;
    const totalTime = totalFrames > 0 ? (totalFrames - 1) / this.fps : 0;

    return {
      currentTime,
      totalTime,
      ringBufferSize: totalFrames,
      ringBufferCapacity: this.ringBuffer.capacity,
      isSeeking: false,
    };
  }
}
