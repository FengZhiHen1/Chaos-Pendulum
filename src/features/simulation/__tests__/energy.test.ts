import { describe, it, expect, beforeEach } from "vitest";
import { useSimulationStore } from "../store";
import {
  FRAME_STRIDE,
  FrameField,
  DEFAULT_PARAMS,
  DEFAULT_INITIAL_CONDITIONS,
} from "@/shared/types";

// ─── 辅助：构建模拟帧 buffer ──────────────────

function makeFrameBuffer(fields: Partial<Record<FrameField, number>>): {
  buffer: Float64Array;
} {
  const buf = new Float64Array(FRAME_STRIDE);
  // 默认值：正常仿真帧
  buf[FrameField.T] = 1.0;
  buf[FrameField.THETA1] = 1.5;
  buf[FrameField.THETA1_DOT] = 0.5;
  buf[FrameField.THETA2] = 1.5;
  buf[FrameField.THETA2_DOT] = 0.5;
  buf[FrameField.X1] = 1.0;
  buf[FrameField.Y1] = 0.0;
  buf[FrameField.X2] = 2.0;
  buf[FrameField.Y2] = 0.0;
  buf[FrameField.KINETIC_ENERGY] = 2.0;
  buf[FrameField.POTENTIAL_ENERGY] = -10.0;
  buf[FrameField.TOTAL_ENERGY] = -8.0;
  buf[FrameField.ALPHA1] = 0;
  buf[FrameField.ALPHA2] = 0;
  // 覆盖传入字段
  for (const [k, v] of Object.entries(fields)) {
    buf[Number(k)] = v;
  }
  return { buffer: buf };
}

function resetStore(): void {
  useSimulationStore.setState({
    params: { ...DEFAULT_PARAMS },
    initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
    method: "RK4",
    fieldErrors: {},
    isSceneFrozen: false,
    activeField: null,
    isRunning: true,
    t: 0,
    energyInitial: null,
    energyDrift: 0,
    driftExceeded: false,
    energyMin: 0,
    energyMax: 0,
    isSimulationActive: false,
  });
}

// ─── 正向测试 1：首帧建立能量基准 ─────────────

describe("能量监控 — 首帧初始化", () => {
  beforeEach(resetStore);

  it("首个有效帧设置 energyInitial 并计算极值", () => {
    const { buffer } = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.KINETIC_ENERGY]: 4.905,
      [FrameField.POTENTIAL_ENERGY]: -9.81,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });

    useSimulationStore.getState().consumeFrameFromBuffer(buffer, 0);
    const s = useSimulationStore.getState();

    expect(s.energyInitial).toBe(-4.905);
    expect(s.energyDrift).toBe(0);
    expect(s.driftExceeded).toBe(false);
    expect(s.energyMin).toBe(-4.905);
    expect(s.energyMax).toBe(-4.905);
    expect(s.isSimulationActive).toBe(true);
  });
});

// ─── 正向测试 2：无阻尼正常漂移计算 ───────────

describe("能量监控 — 正常漂移", () => {
  beforeEach(resetStore);

  it("无阻尼 RK4 仿真 10s 内漂移极小", () => {
    const store = useSimulationStore.getState();

    // 模拟 600 帧（10s）：能量围绕 -4.9 微小波动
    const baseE = -4.905;
    for (let i = 0; i < 600; i++) {
      const noise = Math.sin(i * 0.01) * 0.00001; // 极小波动
      const e = baseE + noise;
      const { buffer } = makeFrameBuffer({
        [FrameField.T]: (i + 1) * 0.0167,
        [FrameField.TOTAL_ENERGY]: e,
        [FrameField.KINETIC_ENERGY]: 3.0 + noise * 0.5,
        [FrameField.POTENTIAL_ENERGY]: -7.905 + noise * 0.5,
      });
      store.consumeFrameFromBuffer(buffer, 0);
    }

    const s = useSimulationStore.getState();
    expect(s.isSimulationActive).toBe(true);
    expect(s.energyDrift).toBeLessThan(0.00005); // < 0.005%
    expect(s.driftExceeded).toBe(false);
  });
});

// ─── 正向测试 3：阻尼开启时豁免告警 ───────────

describe("能量监控 — 阻尼豁免", () => {
  beforeEach(resetStore);

  it("damping > 0 时即使漂移超阈值也不触发告警", () => {
    useSimulationStore.setState({ params: { ...DEFAULT_PARAMS, damping: 0.1 } });

    const store = useSimulationStore.getState();
    // 模拟能量持续衰减
    let currentE = -4.905;
    for (let i = 0; i < 200; i++) {
      currentE -= 0.002; // 持续衰减
      const { buffer } = makeFrameBuffer({
        [FrameField.T]: (i + 1) * 0.0167,
        [FrameField.TOTAL_ENERGY]: currentE,
        [FrameField.KINETIC_ENERGY]: Math.abs(currentE * 0.4),
        [FrameField.POTENTIAL_ENERGY]: currentE * 0.6,
      });
      store.consumeFrameFromBuffer(buffer, 0);
    }

    const s = useSimulationStore.getState();
    // 漂移可能很大（阻尼衰减），但不应触发告警
    expect(s.driftExceeded).toBe(false);
  });
});

// ─── 正向测试 4：仿真 reset 重新基准 ──────────

describe("能量监控 — Reset", () => {
  beforeEach(resetStore);

  it("t 从 >1s 突降为 ~0 时重置能量基准", () => {
    const store = useSimulationStore.getState();

    // 先运行 300 帧
    for (let i = 0; i < 300; i++) {
      const { buffer } = makeFrameBuffer({
        [FrameField.T]: (i + 1) * 0.0167,
        [FrameField.TOTAL_ENERGY]: -4.905 + Math.sin(i * 0.1) * 0.001,
      });
      store.consumeFrameFromBuffer(buffer, 0);
    }

    const beforeReset = useSimulationStore.getState();
    expect(beforeReset.energyInitial).toBeCloseTo(-4.905, 1);
    expect(beforeReset.isSimulationActive).toBe(true);

    // Reset：t=0 帧到达（模拟 Worker reset 后首个 batch）
    const { buffer } = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -5.0, // 新参数的初始能量不同
      [FrameField.KINETIC_ENERGY]: 2.5,
      [FrameField.POTENTIAL_ENERGY]: -7.5,
    });
    store.consumeFrameFromBuffer(buffer, 0);

    const afterReset = useSimulationStore.getState();
    expect(afterReset.energyInitial).toBe(-5.0); // 新基准
    expect(afterReset.energyDrift).toBe(0);
    expect(afterReset.driftExceeded).toBe(false);
    expect(afterReset.energyMin).toBe(-5.0);
    expect(afterReset.energyMax).toBe(-5.0);
  });
});

// ─── 异常测试 1：Euler 方法漂移超阈值告警 ──────

describe("能量监控 — 漂移超阈值告警", () => {
  beforeEach(resetStore);

  it("damping=0 时漂移超过 0.5% 触发告警并锁存", () => {
    const store = useSimulationStore.getState();

    // 首帧建立基准
    let { buffer } = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(buffer, 0);
    expect(useSimulationStore.getState().driftExceeded).toBe(false);

    // 模拟 Euler 方法的能量漂移（较大漂移）
    let currentE = -4.905;
    for (let i = 1; i < 400; i++) {
      currentE += 0.0005; // 每帧漂移，累计 400 帧 × 0.0005 ≈ +0.2 / 4.905 ≈ 4%
      const buf = makeFrameBuffer({
        [FrameField.T]: (i + 1) * 0.0167,
        [FrameField.TOTAL_ENERGY]: currentE,
      });
      store.consumeFrameFromBuffer(buf.buffer, 0);
    }

    const s = useSimulationStore.getState();
    expect(s.driftExceeded).toBe(true); // 已触发告警
    expect(s.energyDrift).toBeGreaterThan(0.005); // > 0.5%

    // 漂移恢复（模拟方法切换为 RK4）→ 告警锁存保持
    currentE = s.totalEnergy;
    for (let i = 0; i < 100; i++) {
      const buf = makeFrameBuffer({
        [FrameField.T]: 400 + (i + 1) * 0.0167,
        [FrameField.TOTAL_ENERGY]: currentE, // 不再漂移
      });
      store.consumeFrameFromBuffer(buf.buffer, 0);
    }

    const s2 = useSimulationStore.getState();
    expect(s2.energyDrift).toBeGreaterThan(0.005); // 历史漂移仍在
    expect(s2.driftExceeded).toBe(true); // 锁存保持

    // 用户点击清除 → 应解除（但漂移仍 > 0.5%，清除按钮无效逻辑已在组件层）
    // 测试 clearDriftAlarm 本身：当前 drift > 0.5%，不应清除
    s2.clearDriftAlarm();
    expect(useSimulationStore.getState().driftExceeded).toBe(true);
  });
});

// ─── 异常测试 2：NaN 能量帧跳过 ──────────────

describe("能量监控 — NaN 处理", () => {
  beforeEach(resetStore);

  it("单帧 NaN 不改变有效状态", () => {
    const store = useSimulationStore.getState();

    // 先建立有效基准
    let { buffer } = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(buffer, 0);
    const prev = useSimulationStore.getState();
    expect(prev.isSimulationActive).toBe(true);

    // NaN 帧
    const nanBuf = makeFrameBuffer({
      [FrameField.T]: 0.0334,
      [FrameField.TOTAL_ENERGY]: NaN,
      [FrameField.KINETIC_ENERGY]: NaN,
      [FrameField.POTENTIAL_ENERGY]: NaN,
    });
    store.consumeFrameFromBuffer(nanBuf.buffer, 0);

    const afterNaN = useSimulationStore.getState();
    // 能量基准和状态不变
    expect(afterNaN.energyInitial).toBe(prev.energyInitial);
    expect(afterNaN.isSimulationActive).toBe(true);
    expect(afterNaN.energyDrift).toBe(prev.energyDrift);
  });

  it("连续 60 帧 NaN 标记为数据不可用", () => {
    const store = useSimulationStore.getState();

    // 建立有效基准
    const init = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(init.buffer, 0);

    // 连续 60 帧 NaN
    for (let i = 0; i < 60; i++) {
      const buf = makeFrameBuffer({
        [FrameField.T]: (i + 2) * 0.0167,
        [FrameField.TOTAL_ENERGY]: NaN,
      });
      store.consumeFrameFromBuffer(buf.buffer, 0);
    }

    const s = useSimulationStore.getState();
    expect(s.isSimulationActive).toBe(false);
  });
});

// ─── 异常测试 3：clearDriftAlarm 正确逻辑 ──────

describe("能量监控 — 告警清除", () => {
  beforeEach(resetStore);

  it("clearDriftAlarm 仅在 drift < 0.5% 时生效", () => {
    const store = useSimulationStore.getState();

    // 建立基准
    const init = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(init.buffer, 0);

    // 手动设置告警（模拟历史告警锁存）
    useSimulationStore.setState({ driftExceeded: true, energyDrift: 0.006 });
    expect(useSimulationStore.getState().driftExceeded).toBe(true);

    // drift >= 0.5% → clear 无效
    store.clearDriftAlarm();
    expect(useSimulationStore.getState().driftExceeded).toBe(true);

    // drift < 0.5% → clear 生效
    useSimulationStore.setState({ energyDrift: 0.001 });
    store.clearDriftAlarm();
    expect(useSimulationStore.getState().driftExceeded).toBe(false);
  });
});

// ─── 边界测试：阻尼状态变更清除锁存 ──────────

describe("能量监控 — 阻尼切换", () => {
  beforeEach(resetStore);

  it("阻尼从 0 变为 >0 时清除告警锁存", () => {
    // 先清除 store 状态
    useSimulationStore.setState({
      params: { ...DEFAULT_PARAMS, damping: 0 },
      driftExceeded: false,
      energyDrift: 0,
      energyInitial: null,
      isSimulationActive: false,
      t: 0,
    });

    const store = useSimulationStore.getState();

    // 跑一帧建立基准 (damping=0)
    const buf1 = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(buf1.buffer, 0);

    // 手动设置告警锁存
    useSimulationStore.setState({
      driftExceeded: true,
      energyDrift: 0.006,
    });

    // 切换阻尼
    useSimulationStore.setState({ params: { ...DEFAULT_PARAMS, damping: 0.1 } });

    // 下一帧到达 — 阻尼变更应清除锁存
    const buf2 = makeFrameBuffer({
      [FrameField.T]: 0.0334,
      [FrameField.TOTAL_ENERGY]: -5.1,
    });
    store.consumeFrameFromBuffer(buf2.buffer, 0);

    const s = useSimulationStore.getState();
    expect(s.driftExceeded).toBe(false);
  });

  it("阻尼从 >0 变为 0 时重新基准能量", () => {
    useSimulationStore.setState({ params: { ...DEFAULT_PARAMS, damping: 0.1 } });

    const store = useSimulationStore.getState();

    // 阻尼下运行若干帧
    let buf = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(buf.buffer, 0);

    buf = makeFrameBuffer({
      [FrameField.T]: 0.0334,
      [FrameField.TOTAL_ENERGY]: -5.5, // 阻尼衰减
    });
    store.consumeFrameFromBuffer(buf.buffer, 0);

    expect(useSimulationStore.getState().energyInitial).toBe(-4.905);

    // 切换到无阻尼
    useSimulationStore.setState({ params: { ...DEFAULT_PARAMS, damping: 0 } });

    // 下一帧 → 重新基准
    buf = makeFrameBuffer({
      [FrameField.T]: 0.05,
      [FrameField.TOTAL_ENERGY]: -5.6,
    });
    store.consumeFrameFromBuffer(buf.buffer, 0);

    const s = useSimulationStore.getState();
    expect(s.energyInitial).toBe(-5.6); // 新基准
    expect(s.energyDrift).toBe(0);
  });
});

// ─── 正向测试：resetToDefaults 清除能量状态 ──

describe("能量监控 — resetToDefaults", () => {
  beforeEach(resetStore);

  it("resetToDefaults 重置所有能量字段", () => {
    const store = useSimulationStore.getState();

    // 建立一些能量状态
    const buf = makeFrameBuffer({
      [FrameField.T]: 0.0167,
      [FrameField.TOTAL_ENERGY]: -4.905,
    });
    store.consumeFrameFromBuffer(buf.buffer, 0);
    useSimulationStore.setState({ driftExceeded: true });

    // reset
    store.resetToDefaults();
    const s = useSimulationStore.getState();

    expect(s.energyInitial).toBeNull();
    expect(s.energyDrift).toBe(0);
    expect(s.driftExceeded).toBe(false);
    expect(s.energyMin).toBe(0);
    expect(s.energyMax).toBe(0);
    expect(s.isSimulationActive).toBe(false);
  });
});
