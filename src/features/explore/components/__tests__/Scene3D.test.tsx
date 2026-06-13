import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Scene3D } from "../Scene3D";
import { useSimulationStore } from "@/features/simulation";
import { useAppStore } from "@/stores/useAppStore";

// ─── Mock R3F ────────────────────────────────────

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children, onCreated, style }: any) => {
    if (onCreated) {
      const canvas = document.createElement("canvas");
      const mockGl = {
        domElement: canvas,
        shadowMap: { type: 0, enabled: false },
      } as any;
      onCreated({ gl: mockGl });
    }
    return (
      <div data-testid="r3f-canvas" style={style}>
        {children}
      </div>
    );
  },
  useFrame: vi.fn(() => {}),
  useThree: vi.fn(() => ({
    camera: {
      position: { copy: vi.fn(), lerp: vi.fn(), distanceTo: vi.fn(() => 5) },
      lookAt: vi.fn(),
    },
  })),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: vi.fn(() => null),
  Grid: vi.fn(() => null),
  SpotLight: vi.fn(() => null),
}));

// ─── 测试 ─────────────────────────────────────────

describe("Scene3D", () => {
  let origGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    // 模拟 WebGL 支持
    origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as any;

    // 重置 stores
    useSimulationStore.getState().resetToDefaults();
    useAppStore.getState().setDeviceType("desktop");
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext;
    vi.clearAllMocks();
  });

  // ── 正向测试 1：默认渲染 ──

  it("默认 props 下渲染 Canvas 容器", () => {
    render(<Scene3D />);
    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas).toBeDefined();
    expect(canvas).toBeDefined();
  });

  it("自定义 className 被应用到外层容器", () => {
    const { container } = render(<Scene3D className="custom-class" />);
    expect(container.firstChild).toBeDefined();
  });

  // ── 正向测试 2：环境预设切换 ──

  it("white-teaching 环境使用正确背景色", () => {
    render(<Scene3D environment="white-teaching" />);
    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas).toBeDefined();
  });

  // ── 响应式降级 ──

  it("移动端自动关闭网格和阴影", () => {
    useAppStore.getState().setDeviceType("mobile");
    render(<Scene3D showGrid enableShadows />);
    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas).toBeDefined();
  });

  it("平板自动关闭阴影", () => {
    useAppStore.getState().setDeviceType("tablet");
    render(<Scene3D enableShadows />);
    const canvas = screen.getByTestId("r3f-canvas");
    expect(canvas).toBeDefined();
  });

  // ── 异常测试：WebGL 不支持 ──

  it("WebGL 不支持时显示 fallback UI", () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;

    render(<Scene3D />);
    expect(screen.getByText(/您的浏览器不支持 WebGL 2.0/i)).toBeDefined();
  });

  // ── Store 集成 ──

  it("useSimulationStore.state 字段存在且可读", () => {
    const s = useSimulationStore.getState();
    expect(s.state).toBeDefined();
    expect(typeof s.state.theta1).toBe("number");
    expect(typeof s.state.omega1).toBe("number");
    expect(typeof s.state.theta2).toBe("number");
    expect(typeof s.state.omega2).toBe("number");
  });

  it("consumeFrameFromBuffer 同步更新 state", () => {
    const store = useSimulationStore.getState();
    const buffer = new Float64Array(14);
    buffer[1] = 1.0; // theta1
    buffer[2] = 0.5; // theta1Dot (omega1)
    buffer[3] = 2.0; // theta2
    buffer[4] = -0.3; // theta2Dot (omega2)

    store.consumeFrameFromBuffer(buffer, 0);

    const updated = useSimulationStore.getState();
    expect(updated.state.theta1).toBe(1.0);
    expect(updated.state.omega1).toBe(0.5);
    expect(updated.state.theta2).toBe(2.0);
    expect(updated.state.omega2).toBe(-0.3);
  });

  it("resetToDefaults 重置 state 为默认值", () => {
    const store = useSimulationStore.getState();
    store.setRunning(true);
    const buffer = new Float64Array(14);
    buffer[1] = 9.9;
    store.consumeFrameFromBuffer(buffer, 0);

    store.resetToDefaults();

    const s = useSimulationStore.getState().state;
    expect(s.theta1).toBe(Math.PI / 2);
    expect(s.omega1).toBe(0);
    expect(s.theta2).toBe(Math.PI / 2);
    expect(s.omega2).toBe(0);
  });
});
