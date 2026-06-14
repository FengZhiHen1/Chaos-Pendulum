/**
 * 模块: data.application.adapters.UIVisibilityControllerImpl
 * 职责: IUIVisibilityController 的实现——一键隐藏/恢复所有控制面板、图表与导航栏。
 *       通过 CSS class 或 DOM 操作控制全局 UI 可见性。
 * 依赖: DOM API
 */

import type { IUIVisibilityController } from "../../contracts";

/**
 * UI 可见性控制器实现。
 *
 * 通过 CSS class 切换控制全局 UI 可见性。
 * 需要将目标 UI 元素通过 CSS 选择器或 DOM 引用注册。
 */
export class UIVisibilityControllerImpl implements IUIVisibilityController {
  /** UI 隐藏状态 */
  private _hidden: boolean = false;

  /** 需要控制显隐的 CSS 选择器列表 */
  private readonly selectors: string[];

  /**
   * @param selectors 需要控制显隐的 CSS 选择器列表。
   *   默认为常见的 UI 容器选择器。
   */
  constructor(selectors: string[] = [
    "[data-ui-controls]",
    "[data-navigation-bar]",
    "[data-panel-left]",
    "[data-panel-bottom]",
    "[data-chart-container]",
  ]) {
    this.selectors = selectors;
  }

  /** 隐藏所有 UI 控件。 */
  hideAll(): void {
    for (const selector of this.selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.opacity = "0";
        htmlEl.style.pointerEvents = "none";
        htmlEl.style.transition = "opacity 0.3s ease";
      });
    }
    // 同时添加 body class 供全局 CSS 规则使用
    document.body.classList.add("demo-mode-active");
    this._hidden = true;
  }

  /** 恢复所有 UI 控件。 */
  showAll(): void {
    for (const selector of this.selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.opacity = "1";
        htmlEl.style.pointerEvents = "auto";
      });
    }
    document.body.classList.remove("demo-mode-active");
    this._hidden = false;
  }

  /** UI 当前是否隐藏。 */
  isHidden(): boolean {
    return this._hidden;
  }
}
