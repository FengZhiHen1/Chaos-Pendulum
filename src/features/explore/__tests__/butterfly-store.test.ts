import { describe, it, expect, beforeEach } from "vitest";
import { useButterflyStore } from "../butterfly-store";
import type { StateVector, PendulumParams } from "@/shared/domain/valueObjects";

const baseParams: PendulumParams = {
  m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0,
};

const baseState: StateVector = {
  theta1: 2.0, omega1: 0, theta2: 2.0, omega2: 0,
};

describe("ButterflySimStore", () => {
  beforeEach(() => {
    useButterflyStore.getState().init(baseParams, baseState, 0.001);
  });

  // ── 初始化 ──

  it("init 后两侧 side 被正确设置", () => {
    const s = useButterflyStore.getState();
    expect(s.sideA.state.theta1).toBe(baseState.theta1);
    expect(s.sideB.state.theta1).toBeCloseTo(baseState.theta1 + 0.001 * (Math.PI / 180), 6);
    expect(s.sideA.params.L1).toBe(1.0);
    expect(s.sideB.params.L1).toBe(1.0);
    expect(s.isRunning).toBe(false);
  });

  it("deltaDeg=0 时两侧状态完全一致", () => {
    useButterflyStore.getState().init(baseParams, baseState, 0);
    const s = useButterflyStore.getState();
    expect(s.sideA.state.theta1).toBe(s.sideB.state.theta1);
    expect(s.sideA.state.theta2).toBe(s.sideB.state.theta2);
  });

  // ── 分离度计算 ──

  it("_updateSide 正确计算当前分离度", () => {
    const store = useButterflyStore.getState();
    // 摆 A 状态不变，摆 B 产生差异
    store._updateSide("A", { theta1: 0, omega1: 0, theta2: 0, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });
    store._updateSide("B", { theta1: 0.5, omega1: 0, theta2: 0.5, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });

    const s = useButterflyStore.getState();
    expect(s.separation.currentSeparation).toBeCloseTo(Math.sqrt(0.5 * 0.5 + 0.5 * 0.5), 4);
  });

  it("分离度 > π/2 时 isFullyDecoupled 为 true", () => {
    const store = useButterflyStore.getState();
    store._updateSide("A", { theta1: 0, omega1: 0, theta2: 0, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });
    store._updateSide("B", { theta1: Math.PI, omega1: 0, theta2: Math.PI, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });

    const s = useButterflyStore.getState();
    const expected = Math.sqrt(Math.PI * Math.PI + Math.PI * Math.PI);
    expect(s.separation.currentSeparation).toBeCloseTo(expected, 2);
    expect(s.separation.isFullyDecoupled).toBe(true);
    expect(s.separation.decoupledAt).not.toBeNull();
  });

  it("maxSeparation 记录历史最大值", () => {
    // 从 delta=0 开始（两侧完全一致）
    useButterflyStore.getState().init(baseParams, { theta1: 0, omega1: 0, theta2: 0, omega2: 0 }, 0);
    const store = useButterflyStore.getState();
    // 制造偏差
    store._updateSide("B", { theta1: 0.3, omega1: 0, theta2: 0, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });
    // 收回到较小偏差
    store._updateSide("B", { theta1: 0.1, omega1: 0, theta2: 0, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });

    const s = useButterflyStore.getState();
    expect(s.separation.maxSeparation).toBeCloseTo(0.3, 4);
    expect(s.separation.currentSeparation).toBeCloseTo(0.1, 4);
  });

  // ── 播放/暂停 ──

  it("play 后 isRunning 为 true", () => {
    useButterflyStore.getState().play();
    expect(useButterflyStore.getState().isRunning).toBe(true);
  });

  it("pause 后 isRunning 为 false", () => {
    const store = useButterflyStore.getState();
    store.play();
    store.pause();
    expect(useButterflyStore.getState().isRunning).toBe(false);
  });

  // ── 参数编辑 ──

  it("synced 模式同时修改两侧参数", () => {
    const store = useButterflyStore.getState();
    store.setEditMode("synced");
    store.updateParams({ L1: 2.0 });

    const s = useButterflyStore.getState();
    expect(s.sideA.params.L1).toBe(2.0);
    expect(s.sideB.params.L1).toBe(2.0);
  });

  it("a-only 模式仅修改 A 侧参数", () => {
    const store = useButterflyStore.getState();
    store.setEditMode("a-only");
    store.updateParams({ L1: 2.5 });

    const s = useButterflyStore.getState();
    expect(s.sideA.params.L1).toBe(2.5);
    expect(s.sideB.params.L1).toBe(1.0);
  });

  it("b-only 模式仅修改 B 侧参数", () => {
    const store = useButterflyStore.getState();
    store.setEditMode("b-only");
    store.updateParams({ L2: 3.0 });

    const s = useButterflyStore.getState();
    expect(s.sideA.params.L2).toBe(1.0);
    expect(s.sideB.params.L2).toBe(3.0);
  });

  // ── Delta 设定 ──

  it("setDelta 在 0~10° 范围内正常", () => {
    const store = useButterflyStore.getState();
    store.setDelta(5.0);
    expect(useButterflyStore.getState().deltaDeg).toBe(5.0);
  });

  it("setDelta clamp 到 10° 上限", () => {
    const store = useButterflyStore.getState();
    store.setDelta(50.0);
    expect(useButterflyStore.getState().deltaDeg).toBe(10.0);
  });

  it("setDelta clamp 到 0° 下限", () => {
    const store = useButterflyStore.getState();
    store.setDelta(-5.0);
    expect(useButterflyStore.getState().deltaDeg).toBe(0);
  });

  // ── reset ──

  it("reset 后分离度清零", () => {
    const store = useButterflyStore.getState();
    store._updateSide("A", { theta1: 0, omega1: 0, theta2: 0, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });
    store._updateSide("B", { theta1: 3, omega1: 0, theta2: 3, omega2: 0 }, { kinetic: 0, potential: 0, total: 0 }, { x1: 0, y1: 0, x2: 0, y2: 0 });
    expect(useButterflyStore.getState().separation.currentSeparation).toBeGreaterThan(0);

    store.reset();
    const s = useButterflyStore.getState();
    expect(s.separation.currentSeparation).toBe(0);
    expect(s.separation.maxSeparation).toBe(0);
    expect(s.separation.isFullyDecoupled).toBe(false);
    expect(s.separation.decoupledAt).toBeNull();
  });

  // ── Worker ready ──

  it("_setWorkerReady 切换 workerReady 状态", () => {
    const store = useButterflyStore.getState();
    store._setWorkerReady("A", true);
    expect(useButterflyStore.getState().sideA.workerReady).toBe(true);
    expect(useButterflyStore.getState().sideB.workerReady).toBe(false);

    store._setWorkerReady("B", true);
    expect(useButterflyStore.getState().sideB.workerReady).toBe(true);
  });
});
