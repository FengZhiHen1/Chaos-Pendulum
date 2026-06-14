/**
 * 模块: data.application.useCases.DemoModeManagerImpl
 * 职责: DemoModeManager 契约的 Application 层实现——评审大屏纯净视图与自动巡游。
 *       一键隐藏所有 UI 控件、启动相机自动环绕、显示团队水印。
 * 依赖: IOrbitControlsAdapter, IWatermarkRenderer, IUIVisibilityController, DemoModeConfig
 */

import { DemoModeManager as DemoModeManagerABC } from "../../contracts";
import type {
  IOrbitControlsAdapter,
  IWatermarkRenderer,
  IUIVisibilityController,
  DemoModeConfig,
} from "../../contracts";

/** 演示模式事件类型 */
export type DemoEvent = "demoActivated" | "demoDeactivated";

/** 演示模式事件回调 */
export type DemoEventCallback = (event: DemoEvent) => void;

/**
 * 演示模式管理器实现。
 *
 * 在 doActivate/doDeactivate/doStartIdleDetection 钩子中实现核心逻辑。
 * 激活前置条件校验和退出状态校验由父类 ABC 处理。
 */
export class DemoModeManagerImpl extends DemoModeManagerABC {
  /** 内部活跃标记 */
  private _active: boolean = false;

  /** 空闲超时定时器 ID */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  /** 事件监听器 */
  private listeners: DemoEventCallback[] = [];

  /** 用户交互处理器（绑定 this） */
  private readonly interactionHandler: () => void;

  constructor(
    orbitControls: IOrbitControlsAdapter,
    watermark: IWatermarkRenderer,
    uiController: IUIVisibilityController,
    config: DemoModeConfig,
  ) {
    super(orbitControls, watermark, uiController, config);
    this.interactionHandler = this.handleUserInteraction.bind(this);
  }

  // ── 公共入口 ──

  /** 演示模式当前是否激活。 */
  isActive(): boolean {
    return this._active;
  }

  /** 停止空闲超时检测并清理全局事件监听。 */
  stopIdleDetection(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const self = this as unknown as { cleanupIdleHandlers?: () => void };
    if (self.cleanupIdleHandlers) {
      self.cleanupIdleHandlers();
      self.cleanupIdleHandlers = undefined;
    }
  }

  // ── 事件系统 ──

  /** 注册演示模式事件回调。 */
  onEvent(callback: DemoEventCallback): void {
    this.listeners.push(callback);
  }

  /** 移除演示模式事件回调。 */
  offEvent(callback: DemoEventCallback): void {
    this.listeners = this.listeners.filter((cb) => cb !== callback);
  }

  private emit(event: DemoEvent): void {
    for (const cb of this.listeners) {
      try {
        cb(event);
      } catch {
        // 事件回调异常不影响管理器
      }
    }
  }

  // ── 模板钩子实现 ──

  /**
   * 实现激活逻辑——隐藏 UI + 启动 autoRotate + 显示水印 + 注册交互监听。
   */
  protected async doActivate(): Promise<void> {
    this._active = true;

    // 1. 隐藏所有 UI 控件
    this.uiController.hideAll();

    // 2. 启动相机自动环绕
    this.orbitControls.setAutoRotate(true, this.config.autoRotateSpeed);

    // 3. 显示水印
    if (this.config.watermarkText) {
      this.watermark.show(this.config.watermarkText);
    }

    // 4. 注册用户交互监听（触碰任意控件 = 退出演示模式）
    this.orbitControls.onUserInteraction(this.interactionHandler);

    // 5. 派发事件
    this.emit("demoActivated");

    // 6. 停止空闲检测（已手动激活）
    this.stopIdleDetection();
  }

  /**
   * 实现退出逻辑——恢复 UI + 停止 autoRotate + 隐藏水印 + 移除交互监听。
   */
  protected async doDeactivate(): Promise<void> {
    // 1. 停止相机自动环绕
    this.orbitControls.setAutoRotate(false, 0);

    // 2. 隐藏水印
    this.watermark.hide();

    // 3. 恢复所有 UI 控件
    this.uiController.showAll();

    // 4. 移除用户交互监听
    this.orbitControls.offUserInteraction(this.interactionHandler);

    this._active = false;

    // 5. 派发事件
    this.emit("demoDeactivated");
  }

  /**
   * 实现空闲检测逻辑。
   */
  protected async doStartIdleDetection(): Promise<void> {
    if (this.config.idleTimeout <= 0) return;

    // 注册全局交互事件监听（mousemove/keydown）
    const resetTimer = () => {
      this.stopIdleDetection();
      this.idleTimer = setTimeout(async () => {
        if (!this.isActive()) {
          await this.activate();
        }
      }, this.config.idleTimeout * 1000);
    };

    // 绑定全局事件
    const handler = () => resetTimer();
    document.addEventListener("mousemove", handler, { passive: true });
    document.addEventListener("keydown", handler, { passive: true });

    // 保存清理引用（简化实现：存储到实例属性）
    (this as unknown as { cleanupIdleHandlers?: () => void }).cleanupIdleHandlers = () => {
      document.removeEventListener("mousemove", handler);
      document.removeEventListener("keydown", handler);
    };

    // 启动初次定时器
    resetTimer();
  }

  // ── 内部回调 ──

  /**
   * 用户交互处理——触碰控件时退出演示模式。
   */
  private handleUserInteraction(): void {
    if (this.isActive()) {
      this.deactivate().catch((err) => {
        console.error("演示模式退出失败:", err);
      });
    }
  }
}
