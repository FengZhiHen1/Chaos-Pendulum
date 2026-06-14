import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTrailBuffer } from "../useTrailBuffer";
import type { TrailPoint } from "../useTrailBuffer";
import { useSimulationStore } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import { Vector3 } from "three";

// ─── 辅助函数 ────────────────────────────────────

function makePoint(x = 1, y = -1, v = 2): TrailPoint {
  return { position: new Vector3(x, y, 0), velocity: v };
}

function makeStoreState(overrides: Partial<{
  theta1: number; omega1: number; theta2: number; omega2: number;
}> = {}) {
  return {
    theta1: overrides.theta1 ?? 1.57,
    omega1: overrides.omega1 ?? 0.5,
    theta2: overrides.theta2 ?? 1.57,
    omega2: overrides.omega2 ?? -0.3,
  };
}

// ─── 测试套件 ────────────────────────────────────

describe("useTrailBuffer", () => {
  beforeEach(() => {
    useSimulationStore.getState().resetToDefaults();
    useSimulationStore.setState({ isRunning: true });
    useExploreStore.getState().setTrailLength(200);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── 初始化 ──

  it("初始状态 trailPoints 为空数组", () => {
    const { result } = renderHook(() => useTrailBuffer());
    expect(result.current.trailPoints).toEqual([]);
    expect(result.current.persistence).toBe(200);
  });

  // ── 追加点 ──

  it("appendPoint 追加点后 trailPoints 长度增加", () => {
    const { result } = renderHook(() => useTrailBuffer());

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.appendPoint(
          makePoint(i, -i, 2),
          useSimulationStore.getState().params,
          makeStoreState({ theta1: i * 0.1, theta2: i * 0.1 }),
        );
      }
    });

    expect(result.current.trailPoints.length).toBeGreaterThanOrEqual(1);
  });

  it("appendPoint 的 TrailPoint 位置正确（基于 state 和 params 计算）", () => {
    const { result } = renderHook(() => useTrailBuffer());

    // 设置特定参数以便验证坐标
    useSimulationStore.setState({
      params: { ...useSimulationStore.getState().params, L1: 1.0, L2: 1.0 },
    });

    act(() => {
      // theta1=0, theta2=π/2 → ball1=(0, -1), ball2=(1, -1)
      result.current.appendPoint(
        makePoint(0, 0, 0),
        useSimulationStore.getState().params,
        { theta1: 0, omega1: 0, theta2: Math.PI / 2, omega2: 1 },
      );
    });

    const pts = result.current.trailPoints;
    expect(pts.length).toBe(1);
    const pt = pts[0]!;
    expect(pt.position.x).toBeCloseTo(1.0, 2); // L1*sin(0) + L2*sin(π/2) = 0 + 1
    expect(pt.position.y).toBeCloseTo(-1.0, 2); // -L1*cos(0) - L2*cos(π/2) = -1 - 0
    expect(pt.velocity).toBeCloseTo(1.0, 2); // L2 * |omega2| = 1 * 1
  });

  // ── 暂停时停止追加 ──

  it("isRunning=false 时不追加点", () => {
    useSimulationStore.setState({ isRunning: false });

    const { result } = renderHook(() => useTrailBuffer());

    act(() => {
      result.current.appendPoint(
        makePoint(),
        useSimulationStore.getState().params,
        makeStoreState(),
      );
    });

    expect(result.current.trailPoints).toEqual([]);
  });

  // ── NaN 检测 ──

  it("state 含 NaN 时跳过追加", () => {
    const { result } = renderHook(() => useTrailBuffer());

    act(() => {
      result.current.appendPoint(
        makePoint(),
        useSimulationStore.getState().params,
        { theta1: NaN, omega1: 0, theta2: 0, omega2: 0 },
      );
    });

    expect(result.current.trailPoints).toEqual([]);
  });

  // ── clear ──

  it("clear 清空尾迹", () => {
    const { result } = renderHook(() => useTrailBuffer());

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.appendPoint(
          makePoint(i, -i, 2),
          useSimulationStore.getState().params,
          makeStoreState({ theta1: i * 0.1, theta2: i * 0.1 }),
        );
      }
    });

    expect(result.current.trailPoints.length).toBeGreaterThan(0);

    act(() => {
      result.current.clear();
    });

    expect(result.current.trailPoints).toEqual([]);
  });

  // ── 持久度映射 ──

  it("trailLength=50 → persistence=50", () => {
    useExploreStore.getState().setTrailLength(50);
    const { result } = renderHook(() => useTrailBuffer());
    expect(result.current.persistence).toBe(50);
  });

  it("trailLength=0 → persistence=0（无限模式）", () => {
    useExploreStore.getState().setTrailLength(0);
    const { result } = renderHook(() => useTrailBuffer());
    expect(result.current.persistence).toBe(0);
  });

  it("trailLength=-1 → persistence=-1（周期模式）", () => {
    useExploreStore.getState().setTrailLength(-1);
    const { result } = renderHook(() => useTrailBuffer());
    expect(result.current.persistence).toBe(-1);
  });
});
