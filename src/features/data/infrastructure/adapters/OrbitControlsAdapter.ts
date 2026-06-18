/**
 * 模块: data.application.adapters.OrbitControlsAdapter
 * 职责: IOrbitControlsAdapter 的实现——封装 Three.js OrbitControls，
 *       提供演示模式需要的 autoRotate 控制。
 * 依赖: Three.js OrbitControls (运行时注入)
 */

import type { IOrbitControlsAdapter } from "../../contracts";
import { DemoModeError } from "../../contracts";

/**
 * Three.js OrbitControls 的适配器。
 *
 * 通过此适配器隔离 Three.js 依赖，使 DemoModeManager 不直接依赖 Three.js。
 * OrbitControls 实例通过 injectControls() 在运行时注入。
 */
export class OrbitControlsAdapter implements IOrbitControlsAdapter {
  /** 被适配的 OrbitControls 实例（可能来自 Three.js） */
  private controls: {
    autoRotate: boolean;
    autoRotateSpeed: number;
    addEventListener?: (event: string, handler: () => void) => void;
    removeEventListener?: (event: string, handler: () => void) => void;
  } | null = null;

  /** 用户交互回调集合 */
  private interactionCallbacks: Set<() => void> = new Set();

  /** 内部标记：是否自动旋转中 */
  private _autoRotating: boolean = false;

  /** 外部注入的相机控制回调（由 Scene3D 提供） */
  private _setCameraFn: ((azimuth: number, elevation: number, distance: number) => void) | null = null;

  /**
   * 注入 OrbitControls 实例（运行时调用）。
   * @param controls Three.js OrbitControls 或兼容对象
   */
  injectControls(controls: {
    autoRotate: boolean;
    autoRotateSpeed: number;
    addEventListener?: (event: string, handler: () => void) => void;
    removeEventListener?: (event: string, handler: () => void) => void;
  }): void {
    this.controls = controls;
    // 注册用户交互回调
    if (controls.addEventListener) {
      const handler = () => this.notifyInteraction();
      controls.addEventListener("start", handler);
      controls.addEventListener("end", handler);
      // 保留引用以便清理
      this.interactionCallbacks.add(handler);
    }
  }

  /**
   * 注入相机姿态设置函数（由 Scene3D 提供，封装 Three.js 球坐标计算）。
   */
  injectSetCamera(fn: (azimuth: number, elevation: number, distance: number) => void): void {
    this._setCameraFn = fn;
  }

  /** 启用/禁用自动旋转。 */
  setAutoRotate(enabled: boolean, speed: number): void {
    if (!this.controls) {
      throw new DemoModeError(
        "OrbitControls 未注入——无法设置 autoRotate",
        "OrbitControlsAdapter.setAutoRotate()",
        "controls_not_injected",
      );
    }
    this.controls.autoRotate = enabled;
    this.controls.autoRotateSpeed = speed;
    this._autoRotating = enabled;
  }

  /** 设置相机目标姿态。 */
  setCameraTarget(azimuth: number, elevation: number, distance: number): void {
    if (this._setCameraFn) {
      this._setCameraFn(azimuth, elevation, distance);
    }
  }

  /** 获取当前自动旋转状态。 */
  isAutoRotating(): boolean {
    return this._autoRotating;
  }

  /** 注册用户交互回调——触碰控件时触发。 */
  onUserInteraction(callback: () => void): void {
    this.interactionCallbacks.add(callback);
  }

  /** 移除用户交互回调。 */
  offUserInteraction(callback: () => void): void {
    this.interactionCallbacks.delete(callback);
  }

  /** 通知所有交互监听器。 */
  private notifyInteraction(): void {
    for (const cb of this.interactionCallbacks) {
      try {
        cb();
      } catch {
        // 回调异常不阻塞
      }
    }
  }
}
