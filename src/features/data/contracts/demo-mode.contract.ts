/**
 * 模块: data.contracts.demo-mode
 * 职责: STY-02 演示模式契约——为评审大屏场景提供纯净视图与自动巡游。
 *       一键隐藏所有 UI 控件，无人操作时视角自动环绕，触碰控件立即恢复。
 * 数据来源:
 *   - OrbitControls (Three.js): MUST — 相机自动环绕控制
 *   - NavigationController (control/contracts): MUST — UI 控件显隐
 *   - WatermarkRenderer (3D scene): SHOULD — 场景角落水印
 * 边界:
 *   - 依赖: control/contracts (NavigationController), three.js (OrbitControls)
 *   - 被依赖: AppShell (全局布局), 各 Page 组件 (ModePage)
 * 禁止行为:
 *   - 禁止在演示模式期间触发任何非用户主动的 UI 弹出
 *   - 禁止在用户交互后自动恢复演示模式（手动激活或页面刷新）
 *   - 禁止在 Import 中包含 React/Zustand（Application 层无状态）
 */

import type { DemoModeConfig } from "./types.contract";
import { DemoModeError } from "./exceptions";

// ─── 端口接口 ─────────────────────────────────────

/**
 * @contract IOrbitControlsAdapter — 相机轨道控制适配器端口。
 *
 * 封装 Three.js OrbitControls，提供演示模式需要的 autoRotate 控制。
 * 实现者通过此端口隔离 Three.js 依赖。
 *
 * 前置: 相机和渲染器已初始化
 * 后置: autoRotate 启用后视角以指定角速度自动环绕
 * 输入约束:
 *   - speed: 角速度 (°/s)，≥ 0
 * 输出约束: 无
 * 异常: DemoModeError — 相机未就绪
 * Side Effects: 持续修改相机位置（由 Three.js render loop 驱动）
 */
export interface IOrbitControlsAdapter {
  /** 启用/禁用自动旋转 */
  setAutoRotate(enabled: boolean, speed: number): void;

  /** 获取当前自动旋转状态 */
  isAutoRotating(): boolean;

  /** 设置相机目标姿态（方位角/仰角/距离） */
  setCameraTarget(azimuth: number, elevation: number, distance: number): void;

  /** 注册用户交互回调——触碰控件时触发 */
  onUserInteraction(callback: () => void): void;

  /** 移除用户交互回调 */
  offUserInteraction(callback: () => void): void;
}

/**
 * @contract IWatermarkRenderer — 水印渲染器端口。
 *
 * 在 3D 场景角落显示团队名称与作品名。
 *
 * 前置: 3D 场景已渲染
 * 后置: 水印显示在场景角落（通常为左上角或右下角）
 * 输入约束:
 *   - text: 水印文本，≤ 80 字符
 * 输出约束: 无
 * 异常: 无
 * Side Effects: DOM/CSS overlay 显示/隐藏
 */
export interface IWatermarkRenderer {
  /** 显示水印 */
  show(text: string): void;

  /** 隐藏水印 */
  hide(): void;

  /** 水印当前是否可见 */
  isVisible(): boolean;
}

/**
 * @contract IUIVisibilityController — UI 可见性控制端口。
 *
 * 一键隐藏/恢复所有控制面板、图表与导航栏。
 *
 * 前置: 主 UI 已挂载
 * 后置: 所有 UI 控件同步显隐
 * 输入约束: 无
 * 输出约束: 无
 * 异常: 无
 * Side Effects: 修改 DOM/CSS 可见性（通过 NavigationController / CSS class）
 */
export interface IUIVisibilityController {
  /** 隐藏所有 UI 控件 */
  hideAll(): void;

  /** 恢复所有 UI 控件 */
  showAll(): void;

  /** UI 当前是否隐藏 */
  isHidden(): boolean;
}

// ─── 行为契约（抽象类） ──────────────────────────

/**
 * @contract DemoModeManager — 演示模式管理器。
 *
 * 为评审大屏场景提供纯净视图：
 * - 一键隐藏所有控制面板/图表/导航栏
 * - 无人操作时视角以 0.5°/s 自动环绕
 * - 3D 场景角落显示团队水印
 * - 触碰任意控件立即恢复完整 UI
 * - 演示模式激活后不自动恢复（需手动操作）
 *
 * 前置: 3D 场景已渲染、相机已就绪、UI 已挂载
 * 后置: UI 隐藏 + autoRotate 激活 + 水印显示
 * 输入约束:
 *   - config: 有效的 DemoModeConfig
 * 输出约束:
 *   - 激活后 isActive = true
 *   - 退出后 isActive = false
 * 异常:
 *   - DemoModeError: 相机/UI 控制器未就绪
 * Side Effects:
 *   - 修改 OrbitControls.autoRotate
 *   - 隐藏/恢复所有 UI 控件
 *   - 显示/隐藏水印
 *   - 派发 demoActivated / demoDeactivated 事件
 */
export abstract class DemoModeManager {
  constructor(
    protected readonly orbitControls: IOrbitControlsAdapter,
    protected readonly watermark: IWatermarkRenderer,
    protected readonly uiController: IUIVisibilityController,
    protected readonly config: DemoModeConfig,
  ) {}

  // ── 公共入口（子类不得覆写） ──

  /**
   * 激活演示模式。
   *
   * 前置: 相机、UI、水印渲染器均已就绪
   * 后置: 所有 UI 隐藏 + autoRotate 启动 + 水印显示
   * 输入约束: 无额外参数——使用构造函数注入的 config
   * 输出约束: 无
   * 异常: DemoModeError — 任何前置条件不满足
   * Side Effects:
   *   - 隐藏所有 UI 控件
   *   - OrbitControls.autoRotate = true, speed = config.autoRotateSpeed
   *   - 显示水印
   *   - 注册用户交互监听（触碰任意控件 = 退出演示模式）
   *   - 派发 demoActivated 事件
   */
  async activate(): Promise<void> {
    this.validateCanActivate();
    await this.doActivate();
    this.validateActivated();
  }

  /**
   * 退出演示模式。
   *
   * 前置: isActive = true
   * 后置: 所有 UI 恢复 + autoRotate 停止 + 水印隐藏
   * 输入约束: 无
   * 输出约束: 无
   * 异常: DemoModeError — 未处于演示模式
   * Side Effects:
   *   - 恢复所有 UI 控件
   *   - OrbitControls.autoRotate = false
   *   - 隐藏水印
   *   - 移除用户交互监听
   *   - 派发 demoDeactivated 事件
   */
  async deactivate(): Promise<void> {
    this.validateIsActive();
    await this.doDeactivate();
    this.validateDeactivated();
  }

  /**
   * 演示模式当前是否激活。
   *
   * 前置: 无
   * 后置: 返回当前激活状态
   * 异常: 无
   * Side Effects: 无
   */
  abstract isActive(): boolean;

  // ── 空闲超时检测 ──

  /**
   * 启动空闲超时检测。
   *
   * 如果 config.idleTimeout > 0，在指定秒数无人操作后自动进入演示模式。
   *
   * 前置: 演示模式未激活
   * 后置: 超时后自动调用 activate()
   * 输入约束: 无
   * 输出约束: 无
   * 异常: 无
   * Side Effects:
   *   - 注册全局 mousemove/keydown 事件监听
   *   - 超时后自动激活演示模式
   */
  async startIdleDetection(): Promise<void> {
    if (this.config.idleTimeout <= 0) return;
    this.validateCanActivate();
    await this.doStartIdleDetection();
    this.validateIdleDetectionStarted();
  }

  /** 停止空闲超时检测。 */
  abstract stopIdleDetection(): void;

  // ── 模板钩子（实现者必填） ──

  /**
   * 实现激活逻辑——隐藏 UI + 启动 autoRotate + 显示水印 + 注册交互监听。
   *
   * 不需要关心:
   *   - 激活前置条件——activate() 入口已校验
   *   - 激活后状态校验——activate() 入口已校验
   */
  protected abstract doActivate(): Promise<void>;

  /**
   * 实现退出逻辑——恢复 UI + 停止 autoRotate + 隐藏水印 + 移除交互监听。
   *
   * 不需要关心活跃状态校验——deactivate() 入口已校验。
   */
  protected abstract doDeactivate(): Promise<void>;

  /** 实现空闲检测逻辑。 */
  protected abstract doStartIdleDetection(): Promise<void>;

  // ── 基线校验器 ──

  /**
   * 基线：验证激活前置条件。
   * @throws DemoModeError — 已在演示模式中或依赖未就绪
   */
  protected validateCanActivate(): void {
    if (this.isActive()) {
      throw new DemoModeError(
        "演示模式已激活——无法重复激活",
        "DemoModeManager.activate()",
        "already_active",
      );
    }
  }

  /**
   * 基线：验证已激活。
   * @throws DemoModeError — 未激活
   */
  protected validateIsActive(): void {
    if (!this.isActive()) {
      throw new DemoModeError(
        "演示模式未激活——无法退出",
        "DemoModeManager.deactivate()",
        "not_active",
      );
    }
  }

  /**
   * 基线：验证激活后的副作用已执行。
   * @throws DemoModeError — UI 未隐藏
   */
  protected validateActivated(): void {
    if (!this.uiController.isHidden()) {
      throw new DemoModeError(
        "演示模式激活后 UI 未隐藏",
        "DemoModeManager.activate()",
        "ui_not_hidden",
      );
    }
  }

  /**
   * 基线：验证退出后的副作用已执行。
   * @throws DemoModeError — UI 未恢复
   */
  protected validateDeactivated(): void {
    if (this.uiController.isHidden()) {
      throw new DemoModeError(
        "演示模式退出后 UI 未恢复",
        "DemoModeManager.deactivate()",
        "ui_still_hidden",
      );
    }
  }

  /**
   * 基线：验证空闲检测已启动。
   * @no-post-validate — idleTimeout=0 时直接返回，无副作用需要校验
   */
  protected validateIdleDetectionStarted(): void {
    // 若 idleTimeout = 0，startIdleDetection 提前返回，不会到达此处。
    // 若 idleTimeout > 0，doStartIdleDetection 已注册监听器。
  }
}
