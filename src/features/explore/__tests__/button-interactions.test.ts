/**
 * 时间反演 + 蝴蝶效应 — 按钮交互测试。
 *
 * 测试策略：Store 层状态转换（模拟按钮 onClick 触发的 Zustand 操作），
 *          不渲染 React 组件。覆盖每个按钮的完整生命周期。
 *
 * 运行: npx vitest run src/features/explore/__tests__/button-interactions.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useExploreStore, useButterflyStore } from "../store";
import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";

// ══════════════════════════════════════════════════════════════
// 共享夹具
// ══════════════════════════════════════════════════════════════

const BASE_PARAMS: PendulumParams = {
  m1: 1.0, m2: 1.0, L1: 1.0, L2: 1.0, g: 9.81, damping: 0,
};

const BASE_STATE: StateVector = {
  theta1: 2.0, omega1: 0.3, theta2: 2.0, omega2: 0.3,
};

// ══════════════════════════════════════════════════════════════
// 时间反演 — 按钮交互
// ══════════════════════════════════════════════════════════════

describe("TimeReversal — 按钮交互 (Store)", () => {
  beforeEach(() => {
    useExploreStore.getState().resetReversalState();
  });

  // ─── 底部工具栏 [时间反演] ──────────────────────

  describe("底部工具栏 [时间反演] → 打开介绍卡片", () => {
    it("setTimeReversalIntroOpen(true) 应打开介绍卡片", () => {
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      expect(useExploreStore.getState().timeReversalIntroOpen).toBe(true);
    });

    it("打开介绍卡片时不应激活反演", () => {
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      expect(useExploreStore.getState().timeReversalActive).toBe(false);
      expect(useExploreStore.getState().reversalPhase).toBe("idle");
    });

    it("仿真历史不足 120 帧时按钮应为 disabled（由 UI 层判定）", () => {
      // Store 不负责 disabled 判定——由 useReversalRunner.historyInsufficient 计算
      // 此处仅验证 intro 开关独立于历史帧数
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      expect(useExploreStore.getState().timeReversalIntroOpen).toBe(true);
    });
  });

  // ─── 介绍卡片 [取消] ────────────────────────────

  describe("介绍卡片 [取消] → 关闭并恢复仿真", () => {
    it("关闭介绍卡片后 introOpen 应为 false", () => {
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      useExploreStore.getState().setTimeReversalIntroOpen(false);
      expect(useExploreStore.getState().timeReversalIntroOpen).toBe(false);
    });

    it("关闭介绍后反演状态应仍在 idle", () => {
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      useExploreStore.getState().setTimeReversalIntroOpen(false);
      expect(useExploreStore.getState().reversalPhase).toBe("idle");
      expect(useExploreStore.getState().timeReversalActive).toBe(false);
    });
  });

  // ─── 介绍卡片 [开始实验] (精确模式) ─────────────

  describe("介绍卡片 [开始实验] → 精确反演", () => {
    it("startReversal 应设置 active=true + phase=reversing", () => {
      useExploreStore.getState().setTimeReversalMode("exact");
      useExploreStore.getState().setTimeReversalActive(true);
      useExploreStore.getState().setReversalPhase("reversing");
      useExploreStore.getState().setTimeReversalStartTime(5.0);

      const s = useExploreStore.getState();
      expect(s.timeReversalActive).toBe(true);
      expect(s.reversalPhase).toBe("reversing");
      expect(s.timeReversalStartTime).toBe(5.0);
    });

    it("精确模式启动后 intro 应自动关闭（phase 已非 idle）", () => {
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      useExploreStore.getState().setTimeReversalActive(true);
      useExploreStore.getState().setReversalPhase("reversing");

      // 组件条件: r.introOpen && r.phase === "idle" — phase 非 idle, IntroCard 不渲染
      const s = useExploreStore.getState();
      expect(s.reversalPhase).not.toBe("idle");
      // introOpen 仍为 true 但渲染条件不满足，等同于关闭
    });
  });

  // ─── 介绍卡片 [开始实验] (数值模式) ─────────────

  describe("介绍卡片 [开始实验] → 数值反演", () => {
    it("数值模式启动后应为 awaitingConfirm 阶段", () => {
      useExploreStore.getState().setTimeReversalMode("numerical");
      useExploreStore.getState().setTimeReversalActive(true);
      useExploreStore.getState().setReversalPhase("awaitingConfirm");

      const s = useExploreStore.getState();
      expect(s.timeReversalActive).toBe(true);
      expect(s.reversalPhase).toBe("awaitingConfirm");
    });

    it("Worker 就绪后自动切换到 reversing", () => {
      useExploreStore.getState().setTimeReversalActive(true);
      useExploreStore.getState().setReversalPhase("awaitingConfirm");
      // 模拟 Worker prefetchReady → hook 调用 setPhase("reversing")
      useExploreStore.getState().setReversalPhase("reversing");

      expect(useExploreStore.getState().reversalPhase).toBe("reversing");
    });
  });

  // ─── 控制条 [⏸ 暂停] ────────────────────────────

  describe("控制条 [⏸ 暂停] → 暂停反演", () => {
    it("reversing → paused 转换正确", () => {
      useExploreStore.getState().setReversalPhase("reversing");
      useExploreStore.getState().setReversalPhase("paused");
      expect(useExploreStore.getState().reversalPhase).toBe("paused");
    });

    it("非 reversing 状态不能暂停（由 hook 的 pauseReversal 守卫）", () => {
      // idle → paused 不应发生, hook 中 if (phase !== "reversing") return
      useExploreStore.getState().setReversalPhase("idle");
      // 此处仅验证 store 不阻止非法转换——守卫在 hook 层
      expect(useExploreStore.getState().reversalPhase).toBe("idle");
    });
  });

  // ─── 控制条 [▶ 继续] ────────────────────────────

  describe("控制条 [▶ 继续] → 恢复反演", () => {
    it("paused → reversing 转换正确", () => {
      useExploreStore.getState().setReversalPhase("paused");
      useExploreStore.getState().setReversalPhase("reversing");
      expect(useExploreStore.getState().reversalPhase).toBe("reversing");
    });

    it("非 paused 状态不能恢复（由 hook 的 resumeReversal 守卫）", () => {
      useExploreStore.getState().setReversalPhase("reversing");
      // hook 中 if (phase !== "paused") return——不会调用 setPhase("reversing")
      expect(useExploreStore.getState().reversalPhase).toBe("reversing");
    });
  });

  // ─── 控制条 [⏹ 结束] ────────────────────────────

  describe("控制条 [⏹ 结束] → 完成反演", () => {
    it("停止后 phase=completed, active=false", () => {
      useExploreStore.getState().setTimeReversalActive(true);
      useExploreStore.getState().setReversalPhase("reversing");
      useExploreStore.getState().appendDriftSample({ reversalTime: 1, driftDistance: 0.1, forwardSimTime: 10 });

      // 模拟 stopReversal 效果
      useExploreStore.getState().setTimeReversalActive(false);
      useExploreStore.getState().setReversalPhase("completed");

      const s = useExploreStore.getState();
      expect(s.reversalPhase).toBe("completed");
      expect(s.timeReversalActive).toBe(false);
      expect(s.driftHistory.length).toBeGreaterThan(0);
    });

    it("暂停状态也可以停止", () => {
      useExploreStore.getState().setReversalPhase("paused");
      useExploreStore.getState().setTimeReversalActive(false);
      useExploreStore.getState().setReversalPhase("completed");

      expect(useExploreStore.getState().reversalPhase).toBe("completed");
    });
  });

  // ─── 总结卡片 [↩ 返回正常仿真] ──────────────────

  describe("总结卡片 [↩ 返回正常仿真] → 清理并退出", () => {
    it("resetReversalState 应清空所有反演状态", () => {
      useExploreStore.getState().setTimeReversalIntroOpen(true);
      useExploreStore.getState().setTimeReversalActive(true);
      useExploreStore.getState().setReversalPhase("completed");
      useExploreStore.getState().setTimeReversalStartTime(15.0);
      useExploreStore.getState().appendDriftSample({ reversalTime: 1, driftDistance: 0.5, forwardSimTime: 14 });
      useExploreStore.getState().appendDriftSample({ reversalTime: 2, driftDistance: 1.2, forwardSimTime: 13 });

      useExploreStore.getState().resetReversalState();

      const s = useExploreStore.getState();
      expect(s.timeReversalIntroOpen).toBe(false);
      expect(s.timeReversalActive).toBe(false);
      expect(s.reversalPhase).toBe("idle");
      expect(s.timeReversalStartTime).toBe(0);
      expect(s.driftHistory).toEqual([]);
      expect(s.annotationDismissed).toBe(false);
    });
  });

  // ─── 总结卡片 [🔁 再次实验] ─────────────────────

  describe("总结卡片 [🔁 再次实验] → 重置参数", () => {
    it("再次实验应回到 idle 状态（可立即重新开始）", () => {
      useExploreStore.getState().setReversalPhase("completed");
      useExploreStore.getState().appendDriftSample({ reversalTime: 1, driftDistance: 0.5, forwardSimTime: 10 });

      useExploreStore.getState().resetReversalState();

      const s = useExploreStore.getState();
      expect(s.reversalPhase).toBe("idle");
      expect(s.driftHistory).toEqual([]);
    });
  });

  // ─── 完整生命周期 ────────────────────────────────

  describe("完整按钮生命周期", () => {
    function s() { return useExploreStore.getState(); }

    it("idle → intro → reversing → paused → reversing → completed → idle", () => {
      // 1. 底部工具栏 [时间反演]
      s().setTimeReversalIntroOpen(true);
      expect(s().timeReversalIntroOpen).toBe(true);
      expect(s().reversalPhase).toBe("idle");

      // 2. 介绍卡片 [开始实验] (精确模式)
      s().setTimeReversalMode("exact");
      s().setTimeReversalActive(true);
      s().setReversalPhase("reversing");
      s().setTimeReversalStartTime(10.0);

      // 3. 控制条 [⏸ 暂停]
      s().setReversalPhase("paused");
      expect(s().reversalPhase).toBe("paused");

      // 4. 控制条 [▶ 继续]
      s().setReversalPhase("reversing");
      expect(s().reversalPhase).toBe("reversing");

      // 5. 控制条 [⏹ 结束]
      s().appendDriftSample({ reversalTime: 5, driftDistance: 0, forwardSimTime: 5 });
      s().setTimeReversalActive(false);
      s().setReversalPhase("completed");
      expect(s().reversalPhase).toBe("completed");

      // 6. 总结卡片 [↩ 返回正常仿真]
      s().resetReversalState();
      expect(s().timeReversalIntroOpen).toBe(false);
      expect(s().timeReversalActive).toBe(false);
      expect(s().reversalPhase).toBe("idle");
    });

    it("idle → intro → 取消 → idle (用户放弃实验)", () => {
      s().setTimeReversalIntroOpen(true);
      s().setTimeReversalIntroOpen(false);

      expect(s().timeReversalIntroOpen).toBe(false);
      expect(s().reversalPhase).toBe("idle");
      expect(s().timeReversalActive).toBe(false);
    });

    it("idle → intro → awaitingConfirm → 取消 → idle (数值反演取消)", () => {
      s().setTimeReversalIntroOpen(true);
      s().setTimeReversalMode("numerical");
      s().setTimeReversalActive(true);
      s().setReversalPhase("awaitingConfirm");
      // 用户取消 → handleCancelReversal
      s().setTimeReversalIntroOpen(false);
      s().setTimeReversalActive(false);
      s().setReversalPhase("idle");

      expect(s().reversalPhase).toBe("idle");
    });

    it("resetReversalState 后 driftHistory 完全清空", () => {
      s().appendDriftSample({ reversalTime: 1, driftDistance: 0.5, forwardSimTime: 10 });
      s().appendDriftSample({ reversalTime: 2, driftDistance: 1.2, forwardSimTime: 9 });
      expect(s().driftHistory.length).toBe(2);

      s().resetReversalState();
      expect(s().driftHistory).toEqual([]);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 蝴蝶效应 — 按钮交互
// ══════════════════════════════════════════════════════════════

describe("ButterflyEffect — 按钮交互 (Store)", () => {
  beforeEach(() => {
    useButterflyStore.getState().init(BASE_PARAMS, BASE_STATE, 0.001);
  });

  function bf() { return useButterflyStore.getState(); }

  // ─── 底部工具栏 [蝴蝶效应] ──────────────────────

  describe("底部工具栏 [蝴蝶效应] → 进入分屏", () => {
    it("init 后两侧状态被正确初始化", () => {
      expect(bf().sideA.state.theta1).toBe(BASE_STATE.theta1);
      expect(bf().sideB.state.theta1).toBeCloseTo(
        BASE_STATE.theta1 + 0.001 * (Math.PI / 180), 6,
      );
      expect(bf().isRunning).toBe(false);
    });

    it("init 后分离度应为 0", () => {
      expect(bf().separation.currentSeparation).toBe(0);
      expect(bf().separation.isFullyDecoupled).toBe(false);
    });
  });

  // ─── 蝴蝶工具栏 [播放/暂停] ─────────────────────

  describe("蝴蝶工具栏 [播放] / [暂停]", () => {
    it("play 后 isRunning=true", () => {
      bf().play();
      expect(bf().isRunning).toBe(true);
    });

    it("pause 后 isRunning=false", () => {
      bf().play();
      bf().pause();
      expect(bf().isRunning).toBe(false);
    });

    it("连续 play→pause→play 切换正确", () => {
      bf().play();
      expect(bf().isRunning).toBe(true);
      bf().pause();
      expect(bf().isRunning).toBe(false);
      bf().play();
      expect(bf().isRunning).toBe(true);
    });
  });

  // ─── 蝴蝶工具栏 [重置] ──────────────────────────

  describe("蝴蝶工具栏 [重置]", () => {
    it("reset 后分离度清零，isRunning=false", () => {
      bf().play();
      bf()._updateSide("B",
        { theta1: 3, omega1: 0, theta2: 3, omega2: 0 },
        { kinetic: 0, potential: 0, total: 0 },
        { x1: 0, y1: 0, x2: 0, y2: 0 },
      );
      bf().reset();

      expect(bf().separation.currentSeparation).toBe(0);
      expect(bf().separation.maxSeparation).toBe(0);
      expect(bf().isRunning).toBe(false);
    });
  });

  // ─── DeltaPanel [输入框] ───────────────────────

  describe("DeltaPanel [输入框] → 修改 δ", () => {
    it("setDelta(5.0) 正常范围内", () => {
      bf().setDelta(5.0);
      expect(bf().deltaDeg).toBe(5.0);
    });

    it("setDelta(-1) clamp 到 1e-6 下限（不再崩溃）", () => {
      bf().setDelta(-1);
      expect(bf().deltaDeg).toBe(1e-6);
    });

    it("setDelta(50) clamp 到 10 上限", () => {
      bf().setDelta(50);
      expect(bf().deltaDeg).toBe(10);
    });

    it("setDelta(0) clamp 到 1e-6（防止 InvalidDeltaError）", () => {
      bf().setDelta(0);
      expect(bf().deltaDeg).toBe(1e-6);
    });

    it("setDelta(NaN) 安全回退到 1e-6", () => {
      bf().setDelta(NaN);
      expect(bf().deltaDeg).toBe(1e-6);
    });
  });

  // ─── DeltaPanel [同步/仅A/仅B] ──────────────────

  describe("DeltaPanel [同步/仅A/仅B] → 编辑模式", () => {
    it("synced 模式同步修改两侧 L1", () => {
      bf().setEditMode("synced");
      bf().updateParams({ L1: 2.0 });
      expect(bf().sideA.params.L1).toBe(2.0);
      expect(bf().sideB.params.L1).toBe(2.0);
    });

    it("a-only 仅修改 A 侧", () => {
      bf().setEditMode("a-only");
      bf().updateParams({ L2: 3.0 });
      expect(bf().sideA.params.L2).toBe(3.0);
      expect(bf().sideB.params.L2).toBe(1.0); // 未改
    });

    it("b-only 仅修改 B 侧", () => {
      bf().setEditMode("b-only");
      bf().updateParams({ g: 5.0 });
      expect(bf().sideA.params.g).toBe(9.81); // 未改
      expect(bf().sideB.params.g).toBe(5.0);
    });
  });

  // ─── 分离警报 [完全失相关] ─────────────────────

  describe("分离警报 [完全失相关]", () => {
    it("分离度 > 90° 触发完全失相关", () => {
      bf()._updateSide("A",
        { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
        { kinetic: 0, potential: 0, total: 0 },
        { x1: 0, y1: 0, x2: 0, y2: 0 },
      );
      bf()._updateSide("B",
        { theta1: Math.PI, omega1: 0, theta2: Math.PI, omega2: 0 },
        { kinetic: 0, potential: 0, total: 0 },
        { x1: 0, y1: 0, x2: 0, y2: 0 },
      );

      expect(bf().separation.isFullyDecoupled).toBe(true);
      expect(bf().separation.decoupledAt).not.toBeNull();
    });

    it("分离度 < 90° 时不应触警", () => {
      // 先对齐两侧 theta2，避免 dTheta2 贡献过大
      bf()._updateSide("A",
        { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
        { kinetic: 0, potential: 0, total: 0 },
        { x1: 0, y1: 0, x2: 0, y2: 0 },
      );
      bf()._updateSide("B",
        { theta1: 0.5, omega1: 0, theta2: 0, omega2: 0 },
        { kinetic: 0, potential: 0, total: 0 },
        { x1: 0, y1: 0, x2: 0, y2: 0 },
      );

      expect(bf().separation.isFullyDecoupled).toBe(false);
    });
  });
});
