import { describe, it, expect } from "vitest";
import { classifyRegime, resolveStoreParam } from "../types";

describe("classifyRegime", () => {
  it("0 点 → 无数据", () => {
    expect(classifyRegime(0)).toBe("无数据");
  });

  it("1 点 → 周期-1", () => {
    expect(classifyRegime(1)).toBe("周期-1");
  });

  it("2 点 → 周期-2", () => {
    expect(classifyRegime(2)).toBe("周期-2");
  });

  it("3-4 点 → 周期-4", () => {
    expect(classifyRegime(3)).toBe("周期-4");
    expect(classifyRegime(4)).toBe("周期-4");
  });

  it("5-8 点 → 倍周期", () => {
    expect(classifyRegime(5)).toBe("倍周期");
    expect(classifyRegime(8)).toBe("倍周期");
  });

  it(">8 点 → 混沌", () => {
    expect(classifyRegime(9)).toBe("混沌");
    expect(classifyRegime(50)).toBe("混沌");
  });
});

describe("resolveStoreParam ANL-02 扩展映射", () => {
  const fixed = { L1: 1.0, m1: 1.0 };

  it("L₂ → L2 直接赋值", () => {
    const r = resolveStoreParam("L₂", 2.5, fixed);
    expect(r!.storeKey).toBe("L2");
    expect(r!.storeValue).toBe(2.5);
  });

  it("m₂ → m2 直接赋值", () => {
    const r = resolveStoreParam("m₂", 3.0, fixed);
    expect(r!.storeKey).toBe("m2");
    expect(r!.storeValue).toBe(3.0);
  });

  it("θ₁ → theta1", () => {
    const r = resolveStoreParam("θ₁", 1.57, fixed);
    expect(r!.storeKey).toBe("theta1");
    expect(r!.storeValue).toBe(1.57);
  });
});
