/**
 * 模块: data.application.adapters.WatermarkRendererImpl
 * 职责: IWatermarkRenderer 的实现——在 3D 场景角落显示团队水印。
 *       使用 DOM overlay 方式渲染水印文本。
 * 依赖: DOM API
 */

import type { IWatermarkRenderer } from "../../contracts";

/**
 * 水印渲染器实现。
 *
 * 通过 DOM overlay 在指定容器中显示/隐藏水印文本。
 * 水印位置（左上角/右下角）可配置。
 */
export class WatermarkRendererImpl implements IWatermarkRenderer {
  /** 水印 DOM 元素 */
  private element: HTMLDivElement | null = null;
  /** 水印容器元素 */
  private container: HTMLElement | null = null;
  /** 当前是否可见 */
  private _visible: boolean = false;
  /** 水印位置 */
  private readonly position: "top-left" | "bottom-right";

  constructor(position: "top-left" | "bottom-right" = "bottom-right") {
    this.position = position;
  }

  /**
   * 注入渲染容器（运行时调用）。
   * 水印将作为该容器的子元素渲染。
   */
  injectContainer(container: HTMLElement): void {
    this.container = container;
  }

  /** 显示水印。 */
  show(text: string): void {
    if (!this.container) {
      // 静默失败——水印不是关键功能
      console.warn("WatermarkRendererImpl: 容器未注入，跳过显示");
      return;
    }

    if (!this.element) {
      this.element = document.createElement("div");
      this.applyStyles(this.element);
      this.container.appendChild(this.element);
    }

    this.element.textContent = text;
    this.element.style.display = "block";
    this._visible = true;
  }

  /** 隐藏水印。 */
  hide(): void {
    if (this.element) {
      this.element.style.display = "none";
    }
    this._visible = false;
  }

  /** 水印当前是否可见。 */
  isVisible(): boolean {
    return this._visible;
  }

  /** 销毁水印 DOM 元素。 */
  dispose(): void {
    if (this.element && this.container) {
      this.container.removeChild(this.element);
    }
    this.element = null;
    this._visible = false;
  }

  /**
   * 应用水印样式。
   */
  private applyStyles(el: HTMLDivElement): void {
    el.style.position = "absolute";
    el.style.zIndex = "1000";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.style.color = "rgba(255, 255, 255, 0.3)";
    el.style.fontSize = "14px";
    el.style.fontFamily = "sans-serif";
    el.style.letterSpacing = "0.05em";
    el.style.padding = "12px 16px";
    el.style.display = "none";

    if (this.position === "bottom-right") {
      el.style.bottom = "16px";
      el.style.right = "16px";
    } else {
      el.style.top = "16px";
      el.style.left = "16px";
    }
  }
}
