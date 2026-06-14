/**
 * 模块: data.application.useCases.ForkSimulationUseCaseImpl
 * 职责: ForkSimulationUseCase 契约的 Application 层实现——从历史时刻分叉演化，
 *       原始轨迹以半透明幽灵尾迹保留。
 * 依赖: IRingBufferReader, ForkConfig, GhostTrailConfig, createDefaultGhostTrail
 */

import {
  ForkSimulationUseCase as ForkSimulationUseCaseABC,
  createDefaultGhostTrail,
} from "../../contracts";
import type {
  IRingBufferReader,
  ForkConfig,
  GhostTrailConfig,
} from "../../contracts";
import type { StateVector } from "@/shared/domain/valueObjects";

/**
 * 分叉演化用例实现。
 *
 * 在 doExecute 钩子中从 RingBuffer 提取初始状态 → 创建幽灵尾迹配置。
 * 新 Worker 实例的创建由外部（ViewModel 层）通过事件回调处理。
 *
 * 配置校验、分叉状态校验和幽灵尾迹校验由父类 ABC 处理。
 */
export class ForkSimulationUseCaseImpl extends ForkSimulationUseCaseABC {
  /** 分叉是否活跃 */
  private _forkActive: boolean = false;

  /** 当前幽灵尾迹配置 */
  private _ghostTrail: GhostTrailConfig | null = null;

  /** 仿真帧率 */
  private readonly fps: number;

  /** 分叉启动回调（ViewModel 层注入——用于创建新 Worker） */
  private onForkStartCallback?: (config: ForkConfig) => Promise<void>;

  /** 分叉取消回调（ViewModel 层注入——用于终止 Worker） */
  private onForkCancelCallback?: () => Promise<void>;

  constructor(ringBuffer: IRingBufferReader, fps: number = 60) {
    super(ringBuffer);
    this.fps = fps;
  }

  /** 分叉当前是否活跃。 */
  isForkActive(): boolean {
    return this._forkActive;
  }

  /**
   * 注册分叉启动回调——ViewModel 层通过此回调创建新 Worker。
   */
  onForkStart(callback: (config: ForkConfig) => Promise<void>): void {
    this.onForkStartCallback = callback;
  }

  /**
   * 注册分叉取消回调——ViewModel 层通过此回调终止 Worker。
   */
  onForkCancel(callback: () => Promise<void>): void {
    this.onForkCancelCallback = callback;
  }

  /**
   * 获取当前幽灵尾迹配置（供 TrailRenderer 消费）。
   */
  getGhostTrail(): GhostTrailConfig | null {
    return this._ghostTrail;
  }

  /**
   * 实现分叉逻辑——从 RingBuffer 提取初始状态 → 构建幽灵尾迹 → 触发外部回调。
   *
   * 不需要关心:
   *   - 配置校验——execute() 入口已处理
   *   - 幽灵尾迹校验——execute() 入口已处理
   */
  protected async doExecute(forkConfig: ForkConfig): Promise<GhostTrailConfig> {
    // 1. 提取分叉前的原始轨迹数据
    const trailData = this.extractTrailData(forkConfig.forkTime);

    // 2. 创建幽灵尾迹配置
    const ghostTrail = createDefaultGhostTrail(trailData, 0.3, "#4488ff");
    this._ghostTrail = ghostTrail;

    // 3. 标记分叉活跃
    this._forkActive = true;

    // 4. 触发外部回调——创建新 Worker 实例
    if (this.onForkStartCallback) {
      await this.onForkStartCallback(forkConfig);
    }

    return ghostTrail;
  }

  /**
   * 实现取消逻辑——终止分叉 Worker + 清除幽灵尾迹。
   */
  protected async doCancel(): Promise<void> {
    // 1. 触发外部回调——终止 Worker
    if (this.onForkCancelCallback) {
      await this.onForkCancelCallback();
    }

    // 2. 清除幽灵尾迹
    this._ghostTrail = null;
    this._forkActive = false;
  }

  // ── 内部辅助 ──

  /**
   * 提取分叉前的原始轨迹数据。
   * 返回 forkTime 之前的所有帧数据。
   */
  private extractTrailData(forkTime: number): StateVector[] {
    const frameIndex = Math.round(forkTime * this.fps);
    const trail: StateVector[] = [];

    for (let i = 0; i < frameIndex && i < this.ringBuffer.length; i++) {
      const state = this.ringBuffer.at(i);
      if (state) {
        trail.push({ ...state });
      }
    }

    return trail;
  }

  /**
   * 更新幽灵尾迹以包含分叉后的新轨迹数据。
   * 在渲染循环中由 ViewModel 层调用。
   */
  appendToGhostTrail(newState: StateVector): void {
    if (this._ghostTrail) {
      this._ghostTrail = {
        ...this._ghostTrail,
        trailData: [...this._ghostTrail.trailData, { ...newState }],
      };
    }
  }
}
