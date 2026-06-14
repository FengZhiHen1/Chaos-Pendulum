/**
 * STY-02 演示模式契约对抗测试
 *
 * 覆盖: DemoModeManager (ABC 模板方法)
 * 策略: P0 (禁止行为) → P1 (边界值) → P2 (类型破坏) → P3 (行为链破坏)
 *
 * 约束: 仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  DemoModeManager,
  DemoModeError,
  DEFAULT_DEMO_CONFIG,
} from "@/features/data/contracts";

import type {
  IOrbitControlsAdapter,
  IWatermarkRenderer,
  IUIVisibilityController,
  DemoModeConfig,
} from "@/features/data/contracts";

// ============================================================================
// Mock 实现 (最小化端口)
// ============================================================================

class MockOrbitControlsAdapter implements IOrbitControlsAdapter {
  private autoRotating = false;
  private callbacks: Array<() => void> = [];

  setAutoRotate(enabled: boolean, _speed: number): void {
    this.autoRotating = enabled;
  }

  isAutoRotating(): boolean {
    return this.autoRotating;
  }

  onUserInteraction(callback: () => void): void {
    this.callbacks.push(callback);
  }

  offUserInteraction(callback: () => void): void {
    this.callbacks = this.callbacks.filter((cb) => cb !== callback);
  }

  triggerInteraction(): void {
    this.callbacks.forEach((cb) => cb());
  }
}

class MockWatermarkRenderer implements IWatermarkRenderer {
  private visible = false;
  private text = "";

  show(text: string): void {
    this.visible = true;
    this.text = text;
  }

  hide(): void {
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  getText(): string {
    return this.text;
  }
}

class MockUIVisibilityController implements IUIVisibilityController {
  private hidden = false;

  hideAll(): void {
    this.hidden = true;
  }

  showAll(): void {
    this.hidden = false;
  }

  isHidden(): boolean {
    return this.hidden;
  }
}

// ─── 最小化 DemoModeManager 子类 ────────────────

class TestDemoModeManager extends DemoModeManager {
  private active = false;
  private idleDetectionRunning = false;

  constructor(
    orbitControls: IOrbitControlsAdapter,
    watermark: IWatermarkRenderer,
    uiController: IUIVisibilityController,
    config: DemoModeConfig,
  ) {
    super(orbitControls, watermark, uiController, config);
  }

  isActive(): boolean {
    return this.active;
  }

  stopIdleDetection(): void {
    this.idleDetectionRunning = false;
  }

  isIdleDetectionRunning(): boolean {
    return this.idleDetectionRunning;
  }

  protected async doActivate(): Promise<void> {
    this.active = true;
    this.uiController.hideAll();
    this.orbitControls.setAutoRotate(true, this.config.autoRotateSpeed);
    this.watermark.show(this.config.watermarkText);
  }

  protected async doDeactivate(): Promise<void> {
    this.active = false;
    this.uiController.showAll();
    this.orbitControls.setAutoRotate(false, 0);
    this.watermark.hide();
  }

  protected async doStartIdleDetection(): Promise<void> {
    this.idleDetectionRunning = true;
  }
}

// ============================================================================
// DemoModeManager 对抗测试
// ============================================================================

describe("DemoModeManager — 演示模式管理器", () => {
  let orbit: MockOrbitControlsAdapter;
  let watermark: MockWatermarkRenderer;
  let ui: MockUIVisibilityController;
  let config: DemoModeConfig;
  let manager: TestDemoModeManager;

  beforeEach(() => {
    orbit = new MockOrbitControlsAdapter();
    watermark = new MockWatermarkRenderer();
    ui = new MockUIVisibilityController();
    config = { ...DEFAULT_DEMO_CONFIG };
    manager = new TestDemoModeManager(orbit, watermark, ui, config);
  });

  // ── P0: validateCanActivate ────────────────────

  describe("P0: validateCanActivate — 重复激活", () => {
    it("已激活时再次激活应抛出 DemoModeError", async () => {
    // @ts-expect-error P3 测试: 跳过前置校验直接调 doActivate
      await manager.doActivate(); // 手动设为 active
      expect(() =>
        manager["validateCanActivate"](),
      ).toThrow(DemoModeError);
    });

    it("未激活时应正常通过", () => {
      expect(() =>
        manager["validateCanActivate"](),
      ).not.toThrow();
    });

    it("异常 reason 应为 'already_active'", () => {
      manager["doActivate"](); // 不等待
      try {
        manager["validateCanActivate"]();
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(DemoModeError);
        expect((err as DemoModeError).reason).toBe("already_active");
      }
    });
  });

  // ── P0: validateIsActive ───────────────────────

  describe("P0: validateIsActive — 未激活时退出", () => {
    it("未激活时调用 deactivate 前置校验应抛出 DemoModeError", () => {
      expect(() =>
        manager["validateIsActive"](),
      ).toThrow(DemoModeError);
    });

    it("异常 reason 应为 'not_active'", () => {
      try {
        manager["validateIsActive"]();
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(DemoModeError);
        expect((err as DemoModeError).reason).toBe("not_active");
      }
    });
  });

  // ── P0: validateActivated ──────────────────────

  describe("P0: validateActivated — 激活后 UI 未隐藏", () => {
    it("激活后 UI 未隐藏应抛出 DemoModeError", () => {
      // 模拟：doActivate 未正确调用 uiController.hideAll
      expect(() =>
        manager["validateActivated"](),
      ).toThrow(DemoModeError);
    });

    it("激活后 UI 已隐藏应正常通过", async () => {
      // @ts-expect-error P3: 跳过前置校验直接调 protected doActivate
      await manager.doActivate();
      expect(() =>
        manager["validateActivated"](),
      ).not.toThrow();
    });
  });

  // ── P0: validateDeactivated ────────────────────

  describe("P0: validateDeactivated — 退出后 UI 未恢复", () => {
    it("退出后 UI 仍隐藏应抛出 DemoModeError", () => {
      ui.hideAll();
      expect(() =>
        manager["validateDeactivated"](),
      ).toThrow(DemoModeError);
    });
    it("退出后 UI 已恢复应正常通过", async () => {
      // @ts-expect-error P3: 跳过前置校验直接调 protected doActivate
      await manager.doActivate();
      // @ts-expect-error P3: 跳过前置校验直接调 protected doDeactivate
      await manager.doDeactivate();
      expect(() =>
        manager["validateDeactivated"](),
      ).not.toThrow();
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: 激活 → 激活 (双激活)", () => {
    it("activate 后再 activate 应抛出异常", async () => {
      await manager.activate();
      await expect(
        manager.activate(),
      ).rejects.toThrow(DemoModeError);
    });
  });

  describe("P3: deactivate 未激活时调用", () => {
    it("未激活时 deactivate 应抛出异常", async () => {
      await expect(
        manager.deactivate(),
      ).rejects.toThrow(DemoModeError);
    });
  });

  describe("P3: 正常流程 activate → deactivate", () => {
    it("完整激活/退出周期应正常工作", async () => {
      await manager.activate();
      expect(manager.isActive()).toBe(true);
      expect(ui.isHidden()).toBe(true);
      expect(orbit.isAutoRotating()).toBe(true);
      expect(watermark.isVisible()).toBe(true);

      await manager.deactivate();
      expect(manager.isActive()).toBe(false);
      expect(ui.isHidden()).toBe(false);
      expect(orbit.isAutoRotating()).toBe(false);
      expect(watermark.isVisible()).toBe(false);
    });
  });

  // ── P1: startIdleDetection — idleTimeout 边界 ─

  describe("P1: startIdleDetection — idleTimeout 边界", () => {
    it("idleTimeout = 0 时应提前返回 (不启动检测)", async () => {
      const mgr = new TestDemoModeManager(
        orbit, watermark, ui,
        { ...config, idleTimeout: 0 },
      );
      await mgr.startIdleDetection();
      expect(mgr.isIdleDetectionRunning()).toBe(false);
    });

    it("idleTimeout > 0 时应启动检测", async () => {
      const mgr = new TestDemoModeManager(
        orbit, watermark, ui,
        { ...config, idleTimeout: 30 },
      );
      await mgr.startIdleDetection();
      expect(mgr.isIdleDetectionRunning()).toBe(true);
    });

    it("idleTimeout = -1 时 ≤ 0 应提前返回", async () => {
      const mgr = new TestDemoModeManager(
        orbit, watermark, ui,
        { ...config, idleTimeout: -1 },
      );
      await mgr.startIdleDetection();
      expect(mgr.isIdleDetectionRunning()).toBe(false);
    });

    it("idleTimeout = 1 (最小正值) 应启动检测", async () => {
      const mgr = new TestDemoModeManager(
        orbit, watermark, ui,
        { ...config, idleTimeout: 1 },
      );
      await mgr.startIdleDetection();
      expect(mgr.isIdleDetectionRunning()).toBe(true);
    });
  });

  // ── P1: validateIdleDetectionStarted ──────────

  describe("P1: validateIdleDetectionStarted — 基线空操作", () => {
    it("基线实现不应抛出异常", () => {
      expect(() =>
        manager["validateIdleDetectionStarted"](),
      ).not.toThrow();
    });
  });

  // ── P2: 类型破坏 — config 边界 ────────────────

  describe("P2: 类型破坏", () => {
    it("idleTimeout = NaN → ≤ 0 为 false, 进入 doStartIdleDetection", async () => {
      const mgr = new TestDemoModeManager(
        orbit, watermark, ui,
        { ...config, idleTimeout: NaN },
      );
      // NaN <= 0 为 false，所以会继续执行
      await mgr.startIdleDetection();
      expect(mgr.isIdleDetectionRunning()).toBe(true);
    });
  });

  // ── 常量验证 ──────────────────────────────────

  describe("DEFAULT_DEMO_CONFIG 常量", () => {
    it("autoRotateSpeed = 0.5", () => {
      expect(DEFAULT_DEMO_CONFIG.autoRotateSpeed).toBe(0.5);
    });

    it("idleTimeout = 30", () => {
      expect(DEFAULT_DEMO_CONFIG.idleTimeout).toBe(30);
    });

    it("hideUI = true", () => {
      expect(DEFAULT_DEMO_CONFIG.hideUI).toBe(true);
    });

    it("watermarkText 非空", () => {
      expect(DEFAULT_DEMO_CONFIG.watermarkText.length).toBeGreaterThan(0);
    });
  });
});
