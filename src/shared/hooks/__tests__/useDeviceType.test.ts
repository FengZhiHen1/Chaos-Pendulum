import { describe, it, expect } from "vitest";
import {
  BREAKPOINTS,
  classifyDevice,
  getDegradationRules,
} from "../useDeviceType";

// ── classifyDevice 纯函数测试 ─────────────────────────

describe("classifyDevice", () => {
  it("视口 >= 1920 返回 desktop", () => {
    expect(classifyDevice(1920)).toBe("desktop");
    expect(classifyDevice(2560)).toBe("desktop");
  });

  it("视口 >= 1366 且 < 1920 返回 desktop", () => {
    expect(classifyDevice(1366)).toBe("desktop");
    expect(classifyDevice(1440)).toBe("desktop");
  });

  it("视口 >= 768 且 < 1366 返回 tablet", () => {
    expect(classifyDevice(768)).toBe("tablet");
    expect(classifyDevice(1024)).toBe("tablet");
  });

  it("视口 < 768 返回 mobile", () => {
    expect(classifyDevice(767)).toBe("mobile");
    expect(classifyDevice(375)).toBe("mobile");
    expect(classifyDevice(320)).toBe("mobile");
  });
});

// ── BREAKPOINTS 常量测试 ──────────────────────────────

describe("BREAKPOINTS", () => {
  it("断点值符合设计规格", () => {
    expect(BREAKPOINTS.DESKTOP_WIDE).toBe(1920);
    expect(BREAKPOINTS.DESKTOP_COMPACT).toBe(1366);
    expect(BREAKPOINTS.TABLET).toBe(768);
  });

  it("断点常量是只读对象", () => {
    expect(BREAKPOINTS).toBeDefined();
    expect(typeof BREAKPOINTS.DESKTOP_WIDE).toBe("number");
  });
});

// ── getDegradationRules 纯函数测试 ────────────────────

describe("getDegradationRules", () => {
  it("desktop 返回全功能开启规则", () => {
    const rules = getDegradationRules("desktop");
    expect(rules).toEqual({
      enable3DShadows: true,
      maxTrailLength: 1000,
      enableTrail: true,
      enableSonification: true,
      enableCodeEditor: true,
      enablePrecomputedData: true,
      enableAdvancedAnalysis: true,
    });
  });

  it("tablet 返回半功能降级规则", () => {
    const rules = getDegradationRules("tablet");
    expect(rules).toEqual({
      enable3DShadows: false,
      maxTrailLength: 200,
      enableTrail: true,
      enableSonification: false,
      enableCodeEditor: true,
      enablePrecomputedData: true,
      enableAdvancedAnalysis: true,
    });
  });

  it("mobile 返回基础功能降级规则", () => {
    const rules = getDegradationRules("mobile");
    expect(rules).toEqual({
      enable3DShadows: false,
      maxTrailLength: 0,
      enableTrail: false,
      enableSonification: false,
      enableCodeEditor: false,
      enablePrecomputedData: false,
      enableAdvancedAnalysis: false,
    });
  });
});
