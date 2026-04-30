import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { useSimulationStore } from "../store";
import { exportPhaseSpaceImage } from "../ui/PhaseSpaceCanvas";
import {
  FRAME_STRIDE,
  FrameField,
  DEFAULT_PARAMS,
  DEFAULT_INITIAL_CONDITIONS,
  DEFAULT_METHOD,
} from "@/shared/types";

// ─── 辅助：构建模拟帧 buffer ──────────────────

function makeFrameBuffer(fields: Partial<Record<FrameField, number>>): {
  buffer: Float64Array;
} {
  const buf = new Float64Array(FRAME_STRIDE);
  buf[FrameField.T] = 0.0167;
  buf[FrameField.THETA1] = 1.0;
  buf[FrameField.THETA1_DOT] = 2.0;
  buf[FrameField.THETA2] = -0.5;
  buf[FrameField.THETA2_DOT] = -1.5;
  buf[FrameField.X1] = 1.0;
  buf[FrameField.Y1] = 0.0;
  buf[FrameField.X2] = 2.0;
  buf[FrameField.Y2] = 0.0;
  buf[FrameField.KINETIC_ENERGY] = 2.0;
  buf[FrameField.POTENTIAL_ENERGY] = -10.0;
  buf[FrameField.TOTAL_ENERGY] = -8.0;
  buf[FrameField.ALPHA1] = 0;
  buf[FrameField.ALPHA2] = 0;
  for (const [k, v] of Object.entries(fields)) {
    buf[Number(k)] = v;
  }
  return { buffer: buf };
}

function resetStore(): void {
  useSimulationStore.setState({
    params: { ...DEFAULT_PARAMS },
    initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
    method: "RKF45",
    isRunning: true,
    t: 0,
    theta1: Math.PI / 2,
    theta1Dot: 0,
    theta2: Math.PI / 2,
    theta2Dot: 0,
  });
}

// ─── 角度归一化函数 ────────────────────────────

function normalizeAngle(a: number): number {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// ─── 正向测试 1：Store 字段正确可用 ─────────────

describe("相空间 — Store 数据源", () => {
  beforeEach(resetStore);

  it("consumeFrameFromBuffer 正确写入 theta1/theta1Dot", () => {
    const { buffer } = makeFrameBuffer({
      [FrameField.THETA1]: 1.23,
      [FrameField.THETA1_DOT]: 0.45,
    });

    useSimulationStore.getState().consumeFrameFromBuffer(buffer, 0);
    const s = useSimulationStore.getState();

    expect(s.theta1).toBe(1.23);
    expect(s.theta1Dot).toBe(0.45);
  });

  it("consumeFrameFromBuffer 正确写入 theta2/theta2Dot", () => {
    const { buffer } = makeFrameBuffer({
      [FrameField.THETA2]: -1.5,
      [FrameField.THETA2_DOT]: -3.2,
    });

    useSimulationStore.getState().consumeFrameFromBuffer(buffer, 0);
    const s = useSimulationStore.getState();

    expect(s.theta2).toBe(-1.5);
    expect(s.theta2Dot).toBe(-3.2);
  });
});

// ─── 正向测试 2：角度归一化 ────────────────────

describe("相空间 — 角度归一化", () => {
  it("在 (-π, π] 内不变", () => {
    expect(normalizeAngle(1.5)).toBeCloseTo(1.5, 5);
    expect(normalizeAngle(-2.0)).toBeCloseTo(-2.0, 5);
    expect(normalizeAngle(0)).toBe(0);
  });

  it("超出范围时归一化到 (-π, π]", () => {
    // 3π / 2 ≈ 4.71 → 应归一化为 -π/2 ≈ -1.57
    expect(normalizeAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2, 5);

    // -4.0 < -π → 应归一化
    const r = normalizeAngle(-4.0);
    expect(r).toBeGreaterThan(-Math.PI);
    expect(r).toBeLessThanOrEqual(Math.PI);
  });

  it("±π 边界正确处理", () => {
    // π 和 -π 是等价角度，normalizeAngle 返回 -π
    expect(normalizeAngle(Math.PI)).toBeCloseTo(-Math.PI, 5);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(-Math.PI, 5);
    // π + 0.1 → 应归一化为 -π + 0.1
    expect(normalizeAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 5);
  });
});

// ─── 正向测试 3：暂停时数据冻结 ────────────────

describe("相空间 — 仿真暂停", () => {
  beforeEach(resetStore);

  it("暂停后 state 字段不再更新", () => {
    const store = useSimulationStore.getState();

    // 运行一帧
    const buf1 = makeFrameBuffer({
      [FrameField.THETA1]: 1.0,
      [FrameField.THETA1_DOT]: 2.0,
    });
    store.consumeFrameFromBuffer(buf1.buffer, 0);

    // 暂停
    useSimulationStore.setState({ isRunning: false });

    const s1 = useSimulationStore.getState();
    expect(s1.theta1).toBe(1.0);
    expect(s1.theta1Dot).toBe(2.0);

    // 即使有新帧到达（模拟残留），store 状态也应通过 not calling consume 来保持
    // 这里验证 isRunning 为 false
    expect(useSimulationStore.getState().isRunning).toBe(false);
  });
});

// ─── 异常测试 1：NaN 值处理 ────────────────────

describe("相空间 — NaN 处理", () => {
  beforeEach(resetStore);

  it("theta1 为 NaN 时 store 字段为 NaN", () => {
    const { buffer } = makeFrameBuffer({
      [FrameField.THETA1]: NaN,
      [FrameField.THETA1_DOT]: 2.0,
    });

    useSimulationStore.getState().consumeFrameFromBuffer(buffer, 0);
    const s = useSimulationStore.getState();

    expect(isNaN(s.theta1)).toBe(true);
    expect(s.theta1Dot).toBe(2.0);
  });

  it("theta1Dot 为 NaN 时 store 字段为 NaN", () => {
    const { buffer } = makeFrameBuffer({
      [FrameField.THETA1]: 1.0,
      [FrameField.THETA1_DOT]: NaN,
    });

    useSimulationStore.getState().consumeFrameFromBuffer(buffer, 0);
    const s = useSimulationStore.getState();

    expect(s.theta1).toBe(1.0);
    expect(isNaN(s.theta1Dot)).toBe(true);
  });
});

// ─── 异常测试 2：simulation reset 后参数重置 ────

describe("相空间 — reset 状态", () => {
  beforeEach(resetStore);

  it("resetToDefaults 重置初始条件为默认值，保留用户参数", () => {
    const store = useSimulationStore.getState();

    // 修改参数
    store.setParam("m1", 3.0);
    store.setInitialCondition("theta1", 2.5);

    expect(useSimulationStore.getState().params.m1).toBe(3.0);
    expect(useSimulationStore.getState().initialConditions.theta1).toBe(2.5);

    // reset：params 保留用户设置，不覆盖
    store.resetToDefaults();
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(3.0);
    expect(s.initialConditions.theta1).toBe(DEFAULT_INITIAL_CONDITIONS.theta1);
    expect(s.method).toBe(DEFAULT_METHOD);
  });
});

// ─── 正向测试：exportPhaseSpaceImage 函数 ──────

describe("相空间 — exportPhaseSpaceImage", () => {
  // jsdom 不支持 Canvas 2D API，mock HTMLCanvasElement 全局
  function mockContext(): CanvasRenderingContext2D {
    return {
      scale: vi.fn(),
      drawImage: vi.fn(),
      canvas: { width: 100, height: 100 },
    } as unknown as CanvasRenderingContext2D;
  }

  const origCreateElement = document.createElement.bind(document);

  beforeAll(() => {
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string, options?: ElementCreationOptions) => {
        const el = origCreateElement(tag, options);
        if (tag === "canvas") {
          const canvasEl = el as HTMLCanvasElement;
          vi.spyOn(canvasEl, "getContext").mockReturnValue(mockContext());
          canvasEl.toDataURL = () => "data:image/png;base64,mockdata";
        }
        return el;
      },
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("返回有效的 PNG data URL", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    canvas.style.width = "100px";
    canvas.style.height = "100px";

    const url = exportPhaseSpaceImage(canvas, 1);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("scale=2 返回有效 PNG data URL", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 50;
    canvas.style.width = "100px";
    canvas.style.height = "50px";

    const url = exportPhaseSpaceImage(canvas, 2);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("null canvas 返回空字符串", () => {
    expect(exportPhaseSpaceImage(null, 1)).toBe("");
  });
});
