import { describe, it, expect } from "vitest";
import { classifyLambda, resolveStoreParam } from "../types";
import type { FixedParams } from "../types";

const defaultFixed: FixedParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  omega1_0: 0.0,
  omega2_0: 0.0,
  g: 9.81,
  damping: 0.0,
  integrationTime: 200.0,
  dt: 0.01,
};

describe("classifyLambda", () => {
  it("λ > 0.01 → 混沌", () => {
    const r = classifyLambda(0.05);
    expect(r.label).toBe("混沌");
    expect(r.tone).toBe("chaos");
  });

  it("λ < -0.01 → 稳定", () => {
    const r = classifyLambda(-0.1);
    expect(r.label).toBe("稳定");
    expect(r.tone).toBe("stable");
  });

  it("|λ| ≤ 0.01 → 准周期", () => {
    expect(classifyLambda(0.005).label).toBe("准周期");
    expect(classifyLambda(-0.005).label).toBe("准周期");
    expect(classifyLambda(0).label).toBe("准周期");
  });

  it("NaN / null → 数据缺失", () => {
    expect(classifyLambda(NaN).label).toBe("数据缺失");
    expect(classifyLambda(null).label).toBe("数据缺失");
  });
});

describe("resolveStoreParam", () => {
  it("L₂/L₁ → L2 = value * L1", () => {
    const r = resolveStoreParam("L₂/L₁", 2.5, defaultFixed);
    expect(r).not.toBeNull();
    expect(r!.storeKey).toBe("L2");
    expect(r!.storeValue).toBeCloseTo(2.5);
  });

  it("θ₁ → theta1", () => {
    const r = resolveStoreParam("θ₁", 1.57, defaultFixed);
    expect(r!.storeKey).toBe("theta1");
    expect(r!.storeValue).toBeCloseTo(1.57);
  });

  it("m₂/m₁ → m2 = value * m1", () => {
    const r = resolveStoreParam("m₂/m₁", 3.0, defaultFixed);
    expect(r!.storeKey).toBe("m2");
    expect(r!.storeValue).toBeCloseTo(3.0);
  });

  it("未知参数名 → null", () => {
    expect(resolveStoreParam("unknown", 1.0, defaultFixed)).toBeNull();
  });
});
