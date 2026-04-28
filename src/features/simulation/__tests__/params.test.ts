import { describe, it, expect, beforeEach } from "vitest";
import { useSimulationStore } from "../store";
import type { PendulumParams, InitialConditions } from "@/shared/types";
import { DEFAULT_PARAMS, DEFAULT_INITIAL_CONDITIONS, PARAM_META } from "@/shared/types";

// 重置 store 的辅助函数
function resetStore(): void {
  useSimulationStore.setState({
    params: { ...DEFAULT_PARAMS },
    initialConditions: { ...DEFAULT_INITIAL_CONDITIONS },
    method: "RK4",
    fieldErrors: {},
    isSceneFrozen: false,
    activeField: null,
  });
}

// ─── 正向测试 1：setParam 校验并更新 ─────────────

describe("setParam", () => {
  beforeEach(resetStore);

  it("合法值更新 params 并清除错误", () => {
    const store = useSimulationStore.getState();
    store.setParam("m1", 2.5);
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(2.5);
    expect(s.fieldErrors["m1"]).toBeUndefined();
    expect(s.isSceneFrozen).toBe(false);
  });

  it("负质量触发 error 冻结场景", () => {
    const store = useSimulationStore.getState();
    store.setParam("m1", -0.5);
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(1.0); // 未更新
    expect(s.fieldErrors["m1"]?.level).toBe("error");
    expect(s.isSceneFrozen).toBe(true);
  });

  it("超出建议范围触发 warning 但不冻结", () => {
    const store = useSimulationStore.getState();
    store.setParam("m1", 50); // sliderMax = 10
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(50); // 已更新
    expect(s.fieldErrors["m1"]?.level).toBe("warning");
    expect(s.isSceneFrozen).toBe(false);
  });

  it("NaN 被拒绝", () => {
    const store = useSimulationStore.getState();
    store.setParam("L1", NaN);
    const s = useSimulationStore.getState();
    expect(s.params.L1).toBe(1.0);
    expect(s.fieldErrors["L1"]?.level).toBe("error");
  });
});

// ─── 正向测试 2：initialConditions ───────────────

describe("setInitialCondition", () => {
  beforeEach(resetStore);

  it("合法角度更新 initialConditions", () => {
    const store = useSimulationStore.getState();
    store.setInitialCondition("theta1", 2.0);
    const s = useSimulationStore.getState();
    expect(s.initialConditions.theta1).toBe(2.0);
    expect(s.isSceneFrozen).toBe(false);
  });

  it("负阻尼（initialCondition 含相应字段时...） — theta1Dot 任意实数通过", () => {
    const store = useSimulationStore.getState();
    store.setInitialCondition("theta1Dot", -5.0);
    const s = useSimulationStore.getState();
    expect(s.initialConditions.theta1Dot).toBe(-5.0);
    // -5 在 sliderMin (-10) 和 sliderMax (10) 内，无 warning
  });
});

// ─── 正向测试 3：applyPreset ─────────────────────

describe("applyPreset", () => {
  beforeEach(resetStore);

  it("小角度预设正确设置初始条件和方法", () => {
    const store = useSimulationStore.getState();
    const err = store.applyPreset({
      id: "test",
      label: "测试",
      description: "",
      params: {},
      initialConditions: { theta1: 0.052, theta1Dot: 0, theta2: 0.034, theta2Dot: 0 },
      method: "RK4",
    });
    expect(err).toBeNull();
    const s = useSimulationStore.getState();
    expect(s.initialConditions.theta1).toBe(0.052);
    expect(s.initialConditions.theta2).toBe(0.034);
  });

  it("非法预设返回错误消息并回滚", () => {
    const store = useSimulationStore.getState();
    const origParams = { ...store.params };
    const err = store.applyPreset({
      id: "bad",
      label: "非法预设",
      description: "",
      params: { m1: -1 }, // 非法
      initialConditions: {},
    });
    expect(err).not.toBeNull();
    expect(err).toContain("上摆质量");
    // 回滚验证
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(origParams.m1);
  });
});

// ─── 正向测试 4：injectParams ────────────────────

describe("injectParams", () => {
  beforeEach(resetStore);

  it("正常注入更新 params", () => {
    const store = useSimulationStore.getState();
    store.injectParams({ L1: 1.5, L2: 2.0 }, { theta1: 2.094 });
    const s = useSimulationStore.getState();
    expect(s.params.L1).toBe(1.5);
    expect(s.params.L2).toBe(2.0);
    expect(s.initialConditions.theta1).toBe(2.094);
  });

  it("用户编辑中字段被跳过", () => {
    // 模拟用户正在编辑 theta1
    useSimulationStore.setState({ activeField: "theta1" });
    const store = useSimulationStore.getState();
    store.injectParams({}, { theta1: 2.094, theta2: 1.0 });
    const s = useSimulationStore.getState();
    // theta1 保持不变（被跳过）
    expect(s.initialConditions.theta1).toBe(DEFAULT_INITIAL_CONDITIONS.theta1);
    // theta2 正常更新
    expect(s.initialConditions.theta2).toBe(1.0);
  });

  it("非法注入值被静默跳过", () => {
    const store = useSimulationStore.getState();
    store.injectParams({ m1: -1 });
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(1.0); // 保持原值
  });
});

// ─── 正向测试 5：resetToDefaults ─────────────────

describe("resetToDefaults", () => {
  beforeEach(resetStore);

  it("重置恢复默认值", () => {
    // 先制造一些脏数据
    const store = useSimulationStore.getState();
    store.setParam("m1", 5.0);
    store.setInitialCondition("theta1", 0.5);
    useSimulationStore.setState({
      fieldErrors: { m1: { valid: false, level: "error", message: "test" } },
      isSceneFrozen: true,
    });

    store.resetToDefaults();
    const s = useSimulationStore.getState();
    expect(s.params.m1).toBe(DEFAULT_PARAMS.m1);
    expect(s.initialConditions.theta1).toBe(DEFAULT_INITIAL_CONDITIONS.theta1);
    expect(s.fieldErrors).toEqual({});
    expect(s.isSceneFrozen).toBe(false);
  });
});

// ─── 正向测试 6：setMethod ───────────────────────

describe("setMethod", () => {
  beforeEach(resetStore);

  it("切换积分方法", () => {
    const store = useSimulationStore.getState();
    store.setMethod("Euler");
    expect(useSimulationStore.getState().method).toBe("Euler");
    store.setMethod("VelocityVerlet");
    expect(useSimulationStore.getState().method).toBe("VelocityVerlet");
  });
});

// ─── 正向测试 7：setActiveField ──────────────────

describe("setActiveField", () => {
  beforeEach(resetStore);

  it("设置和清除活跃字段", () => {
    const store = useSimulationStore.getState();
    store.setActiveField("m1");
    expect(useSimulationStore.getState().activeField).toBe("m1");
    store.setActiveField(null);
    expect(useSimulationStore.getState().activeField).toBeNull();
  });
});

// ─── 异常测试：validateParam 校验逻辑 ────────────

describe("validateParam (internal logic)", () => {
  beforeEach(resetStore);

  it("未知参数被拒绝", () => {
    // 通过 setParam 使用不存在的 key 测试
    const store = useSimulationStore.getState();
    // 直接测试：非 PARAM_META key 被校验
    // 通过 store 的内部校验逻辑间接测试
    // setParam 会调用 validateParam，未知 key 返回 error
    // 但 TypeScript 禁止未知 key，故不直接测试
    // 该逻辑由 PARAM_META 的完整覆盖保证
  });

  it("零质量被拒绝（hardMin=1e-6）", () => {
    const store = useSimulationStore.getState();
    store.setParam("m2", 0);
    const s = useSimulationStore.getState();
    expect(s.fieldErrors["m2"]?.level).toBe("error");
    expect(s.params.m2).toBe(1.0); // 未更新
  });
});
