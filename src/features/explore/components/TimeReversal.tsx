/**
 * 模块: explore.components.TimeReversal
 * 职责: 时间反演实验 UI 组件——双模式反演（精确/数值）、漂移曲线展示、教学注释。
 *       EXP-05 的核心交互：以当前状态为初值反向积分 ODE，可视化混沌的数值不可逆性。
 * 边界:
 *   - 依赖: contracts (ReversalMode, ReversalPhase, DriftSample, InsufficientHistoryError)
 *           domain/drift-calculator (漂移距离纯计算)
 *           simulation (useSimulationStore, useSimulationHistory 等)
 *   - 被依赖: ExplorePage
 */

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import {
  useSimulationStore,
  useSimulationHistory,
  getSimulationHistory,
  ball2Position,
  pauseHistoryRecording,
  resumeHistoryRecording,
} from "@/features/simulation";
import { useExploreStore } from "../store";
import { commandBus } from "@/shared/infrastructure/commandBus";
import {
  updateTrajectoryData,
  clearTrajectoryData,
  startTrajectoryFadeOut,
} from "./TimeReversalTrajectory";
import { notify } from "@/shared/infrastructure/error-handling/notify";
import { Dialog } from "@/shared/view/components/ui/dialog";
import { Button } from "@/shared/view/components/ui/button";
import { cn } from "@/shared/infrastructure/cn";
import { REVERSAL_DEFAULTS, InsufficientHistoryError } from "../contracts";
import { driftCalculator } from "../domain/drift-calculator";
import { DriftCurvePanel } from "./DriftCurvePanel";
import { TeachingAnnotationPopup } from "./TeachingAnnotationPopup";

interface TimeReversalProps {
  className?: string;
}

export function TimeReversal({ className = "" }: TimeReversalProps) {
  // ── Store 订阅 ──
  const mode = useExploreStore((s) => s.timeReversalMode);
  const setMode = useExploreStore((s) => s.setTimeReversalMode);
  const active = useExploreStore((s) => s.timeReversalActive);
  const setActive = useExploreStore((s) => s.setTimeReversalActive);
  const phase = useExploreStore((s) => s.reversalPhase);
  const setPhase = useExploreStore((s) => s.setReversalPhase);
  const startTime = useExploreStore((s) => s.timeReversalStartTime);
  const setStartTime = useExploreStore((s) => s.setTimeReversalStartTime);
  const driftHistory = useExploreStore((s) => s.driftHistory);
  const clearDriftHistory = useExploreStore((s) => s.clearDriftHistory);
  const annotationDismissed = useExploreStore((s) => s.annotationDismissed);
  const dismissAnnotation = useExploreStore((s) => s.dismissAnnotation);
  const resetAnnotation = useExploreStore((s) => s.resetAnnotation);

  const history = useSimulationHistory();
  const simTime = useSimulationStore((s) => s.t);
  const params = useSimulationStore((s) => s.params);
  const engineError = useSimulationStore((s) => s.engineError);
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);

  // ── 本地 ref ──
  const reversalStartRef = useRef<{
    theta1: number;
    omega1: number;
    theta2: number;
    omega2: number;
  } | null>(null);
  const startSimTimeRef = useRef(0);
  const exactRafRef = useRef(0);
  const exactFrameIdxRef = useRef(0);
  const prevSimTimeRef = useRef(simTime);
  const isReversingRef = useRef(false);
  const fwdSnapshotRef = useRef<ReturnType<typeof getSimulationHistory>>([]);
  const reversalTrailRef = useRef<THREE.Vector3[]>([]);
  const awaitingConfirmRef = useRef(false);

  // ── 本地 UI 状态 ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogPhase, setDialogPhase] = useState<"loading" | "ready">("loading");
  const [completedOpen, setCompletedOpen] = useState(false);

  // ── 派生状态 ──
  const minFrames = REVERSAL_DEFAULTS.minHistoryFrames;
  const historyInsufficient = history.length < minFrames;
  const buttonDisabled = historyInsufficient || phase === "awaitingConfirm";
  const tooltipText =
    phase === "awaitingConfirm"
      ? "反向积分数据准备中…"
      : historyInsufficient
        ? `需要至少运行 2 秒才能反演（当前已运行 ${(history.length / 60).toFixed(1)} 秒）`
        : mode === "exact"
          ? "精确反演（对照）— 仅视觉回放，无误差"
          : "数值反演（实验）— 真实反向积分，展示浮点误差指数放大";

  const showAnnotation =
    mode === "numerical" &&
    phase === "reversing" &&
    !annotationDismissed &&
    driftHistory.some((d) => d.driftDistance > REVERSAL_DEFAULTS.teachingThreshold);

  // ── 精确反演 RAF 循环 ──
  function exactPlaybackLoop() {
    const fwdArray = history.toArray();
    const idx = exactFrameIdxRef.current;

    if (idx >= fwdArray.length) {
      setPhase("completed");
      setActive(false);
      isReversingRef.current = false;
      const firstState = fwdArray[0]!;
      commandBus.emit({
        type: "scheduler:reset",
        initialConditions: {
          theta1: firstState.theta1,
          theta1Dot: firstState.omega1,
          theta2: firstState.theta2,
          theta2Dot: firstState.omega2,
        },
      });
      commandBus.emit({ type: "scheduler:resume" });
      return;
    }

    const sv = fwdArray[fwdArray.length - 1 - idx]!;
    commandBus.emit({
      type: "simulation:overrideState",
      state: {
        theta1: sv.theta1,
        omega1: sv.omega1,
        theta2: sv.theta2,
        omega2: sv.omega2,
      },
    });

    const reversalTime = idx / REVERSAL_DEFAULTS.reversalFps;
    useExploreStore.getState().appendDriftSample({
      reversalTime,
      driftDistance: 0,
      forwardSimTime: startSimTimeRef.current - reversalTime,
    });

    const pos = ball2Position(sv, useSimulationStore.getState().params);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({
      reversalPoints: [...reversalTrailRef.current],
    });

    exactFrameIdxRef.current++;
    exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
  }

  // ── 开始反演 ──
  const startReversal = useCallback(() => {
    const store = useSimulationStore.getState();
    const fwdArray = history.toArray();

    if (fwdArray.length < minFrames) {
      throw new InsufficientHistoryError(fwdArray.length, minFrames);
    }

    reversalStartRef.current = { ...store.state };
    startSimTimeRef.current = store.t;
    clearDriftHistory();
    resetAnnotation();
    reversalTrailRef.current = [];
    setStartTime(store.t);
    setActive(true);
    isReversingRef.current = true;
    prevSimTimeRef.current = store.t;

    fwdSnapshotRef.current = getSimulationHistory();

    clearTrajectoryData();
    const fwdPts = fwdArray.map((sv) => {
      const p = ball2Position(sv, store.params);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    updateTrajectoryData({
      forwardPoints: fwdPts,
      reversalPoints: [],
      reversalColor: mode === "exact" ? "#ffd700" : "#00ffff",
      visible: true,
      fadeOutAt: null,
    });

    if (mode === "exact") {
      setPhase("reversing");
      exactFrameIdxRef.current = 0;
      commandBus.emit({ type: "scheduler:pause" });
      exactRafRef.current = requestAnimationFrame(exactPlaybackLoop);
    } else {
      awaitingConfirmRef.current = true;
      setPhase("awaitingConfirm");
      pauseHistoryRecording();
      commandBus.emit({ type: "scheduler:pause" });
      commandBus.emit({
        type: "scheduler:reset",
        initialConditions: {
          theta1: store.state.theta1,
          theta1Dot: store.state.omega1,
          theta2: store.state.theta2,
          theta2Dot: store.state.omega2,
        },
        simTime: store.t,
      });
      commandBus.emit({ type: "scheduler:setDirection", direction: -1 });
      setDialogPhase("loading");
      setConfirmOpen(true);
      commandBus.emit({ type: "scheduler:prefetchBatch" });
      void commandBus.once("scheduler:prefetchReady", () => {
        if (!awaitingConfirmRef.current) return;
        awaitingConfirmRef.current = false;
        setDialogPhase("ready");
      });
    }
  }, [mode, history, minFrames, setActive, setStartTime, setPhase, clearDriftHistory, resetAnnotation]);

  // ── 确认 / 取消反演 ──
  const handleConfirmReversal = useCallback(() => {
    setConfirmOpen(false);
    setPhase("reversing");
    commandBus.emit({ type: "scheduler:resume" });
  }, [setPhase]);

  const handleCancelReversal = useCallback(() => {
    setConfirmOpen(false);
    commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
    commandBus.emit({ type: "scheduler:resume" });
    resumeHistoryRecording();
    setPhase("idle");
    setActive(false);
    isReversingRef.current = false;
    clearTrajectoryData();
    clearDriftHistory();
  }, [setPhase, setActive, clearDriftHistory]);

  // ── 停止反演 ──
  const stopReversal = useCallback(() => {
    isReversingRef.current = false;

    if (mode === "exact") {
      cancelAnimationFrame(exactRafRef.current);
      const start = reversalStartRef.current;
      if (start) {
        commandBus.emit({
          type: "scheduler:reset",
          initialConditions: {
            theta1: start.theta1,
            theta1Dot: start.omega1,
            theta2: start.theta2,
            theta2Dot: start.omega2,
          },
        });
      }
      commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      commandBus.emit({ type: "scheduler:resume" });
      startTrajectoryFadeOut();
      setPhase("completed");
      setActive(false);
    } else {
      resumeHistoryRecording();
      commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      commandBus.emit({ type: "simulation:setRunning", isRunning: false });
      setPhase("completed");
      setActive(false);
      setCompletedOpen(true);
    }
  }, [mode, setPhase, setActive]);

  // ── 反演完成后操作 ──
  const handleRestoreState = useCallback(() => {
    setCompletedOpen(false);
    const start = reversalStartRef.current;
    if (start) {
      useSimulationStore.setState({
        initialConditions: {
          theta1: start.theta1,
          theta1Dot: start.omega1,
          theta2: start.theta2,
          theta2Dot: start.omega2,
        },
      });
      useSimulationStore.getState().applyCurrentSettings();
      startTrajectoryFadeOut();
    }
  }, []);

  const handleResetAfterComplete = useCallback(() => {
    setCompletedOpen(false);
    clearTrajectoryData();
    useSimulationStore.getState().applyCurrentSettings();
  }, []);

  // ── 数值反演逐帧漂移检测 ──
  useEffect(() => {
    if (mode !== "numerical" || phase !== "reversing" || !isReversingRef.current) return;

    const store = useSimulationStore.getState();
    const currentSimTime = store.t;

    if (prevSimTimeRef.current > 0 && currentSimTime >= prevSimTimeRef.current) {
      prevSimTimeRef.current = currentSimTime;
      return;
    }
    prevSimTimeRef.current = currentSimTime;

    if (currentSimTime <= 0.001) {
      stopReversal();
      return;
    }

    if (store.engineError) {
      notify({
        title: "数值反演发散",
        description: `于反演时间 t≈${(startSimTimeRef.current - currentSimTime).toFixed(2)}s — 误差已远超可追踪范围`,
        variant: "error",
        durationMs: 5000,
      });
      stopReversal();
      return;
    }

    const fwdArray = fwdSnapshotRef.current;
    const reversalTime = startSimTimeRef.current - currentSimTime;
    const fwdIdx = Math.round(
      fwdArray.length - 1 - reversalTime * REVERSAL_DEFAULTS.reversalFps,
    );

    let drift = 0;
    if (fwdIdx >= 0 && fwdIdx < fwdArray.length) {
      drift = driftCalculator.compute(store.state, fwdArray[fwdIdx]!);
    }

    useExploreStore.getState().appendDriftSample({
      reversalTime: Math.max(0, reversalTime),
      driftDistance: drift,
      forwardSimTime: currentSimTime,
    });

    const pos = ball2Position(store.state, params);
    reversalTrailRef.current.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    updateTrajectoryData({ reversalPoints: [...reversalTrailRef.current] });
  }, [mode, phase, simTime, params, history, stopReversal]);

  useEffect(() => {
    if (phase === "reversing") {
      isReversingRef.current = true;
      prevSimTimeRef.current = useSimulationStore.getState().t;
    }
  }, [phase]);

  // ── 仿真重置 → 同步清空反演状态 ──
  const prevResetTriggerRef = useRef(resetTrigger);
  useEffect(() => {
    if (resetTrigger !== prevResetTriggerRef.current) {
      prevResetTriggerRef.current = resetTrigger;
      if (isReversingRef.current && mode === "numerical") {
        commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      }
      isReversingRef.current = false;
      cancelAnimationFrame(exactRafRef.current);
      clearTrajectoryData();
      useExploreStore.getState().resetReversalState();
    }
  }, [resetTrigger, mode]);

  // ── 卸载清理 ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(exactRafRef.current);
      if (isReversingRef.current && mode === "numerical") {
        commandBus.emit({ type: "scheduler:setDirection", direction: 1 });
      }
      isReversingRef.current = false;
      clearTrajectoryData();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── UI 渲染 ──
  return (
    <div className={cn("pointer-events-none", className)}>
      {/* 控制栏 */}
      <div
        className="absolute top-3 right-3 z-30 pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg
                   bg-surface-container-high/95 backdrop-blur border border-outline-variant/20 shadow-card-hover"
      >
        {/* 模式切换 */}
        <div className="flex rounded-lg overflow-hidden border border-outline-variant/30">
          <button
            type="button"
            onClick={() => !active && setMode("exact")}
            disabled={active}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium transition-colors",
              mode === "exact"
                ? "bg-amber-500/20 text-amber-300"
                : "bg-transparent text-on-surface-variant hover:text-on-surface",
              active && "opacity-50 cursor-not-allowed",
            )}
            title="精确反演（对照）— 仅视觉回放，无误差"
          >
            精确反演
          </button>
          <button
            type="button"
            onClick={() => !active && setMode("numerical")}
            disabled={active}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium transition-colors",
              mode === "numerical"
                ? "bg-primary-container text-primary"
                : "bg-transparent text-on-surface-variant hover:text-on-surface",
              active && "opacity-50 cursor-not-allowed",
            )}
            title="数值反演（实验）— 真实反向积分，展示浮点误差指数放大"
          >
            数值反演
          </button>
        </div>

        {/* 反演启停按钮 */}
        <Button
          variant={active ? "secondary" : "primary"}
          size="sm"
          disabled={buttonDisabled}
          onClick={active ? stopReversal : startReversal}
          title={tooltipText}
          className={cn(
            "text-[11px] h-7",
            active && "bg-separation-alert/15 text-separation-alert hover:bg-separation-alert/25 border border-separation-alert/20",
          )}
        >
          {phase === "awaitingConfirm"
            ? "准备中…"
            : active
              ? "停止反演"
              : "时间倒流"}
        </Button>

        {/* 历史帧数指示 */}
        <span
          className={cn(
            "text-[10px] font-mono",
            historyInsufficient ? "text-on-surface-variant/30" : "text-on-surface-variant",
          )}
        >
          {history.length}
          <span className="text-on-surface-variant/30">/6000</span>
        </span>
      </div>

      {/* 教学注释弹窗 */}
      <div className="pointer-events-auto">
        <TeachingAnnotationPopup visible={showAnnotation} onClose={dismissAnnotation} />
      </div>

      {/* 漂移曲线 */}
      <div className="pointer-events-auto">
        <DriftCurvePanel
          driftHistory={driftHistory}
          maxReversalTime={startTime > 0 ? startTime : 10}
          mode={mode}
          visible={phase === "reversing" || (phase === "completed" && driftHistory.length > 0)}
          engineError={engineError !== null}
        />
      </div>

      {/* 反演确认对话框 */}
      <div className="pointer-events-auto">
        <Dialog
          open={confirmOpen}
          onClose={dialogPhase === "ready" ? handleCancelReversal : () => {}}
          title={dialogPhase === "loading" ? "准备反演数据…" : "开始反演？"}
          description={
            dialogPhase === "loading"
              ? "正在请求反向积分批次，请稍候…"
              : "反向积分数据已就绪。确认后将开始数值反演，展示误差指数放大过程。"
          }
        >
          {dialogPhase === "loading" ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-xs text-on-surface-variant">
                等待 Worker 反向积分…
              </span>
            </div>
          ) : (
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="tertiary" size="sm" onClick={handleCancelReversal}>
                取消
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmReversal}>
                开始反演
              </Button>
            </div>
          )}
        </Dialog>
      </div>

      {/* 反演完成对话框 */}
      <div className="pointer-events-auto">
        <Dialog
          open={completedOpen}
          onClose={handleRestoreState}
          title="反演结束"
          description="数值反演已完成，仿真已停止。请选择后续操作。"
        >
          <div className="space-y-2 mt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleRestoreState}
              className="w-full justify-start"
            >
              ① 恢复时间倒流前的状态
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              onClick={handleResetAfterComplete}
              className="w-full justify-start"
            >
              ② 重置 — 以当前面板参数重新开始
            </Button>
          </div>
        </Dialog>
      </div>

      {/* 完成标注 */}
      {phase === "completed" && driftHistory.length > 0 && !completedOpen && (
        <div className="absolute bottom-3 left-3 z-20 pointer-events-auto px-3 py-1.5 rounded-lg text-[11px] text-on-surface-variant bg-surface-container-high/95 border border-outline-variant/20">
          最近一次反演（{mode === "exact" ? "精确反演" : "数值反演"}）— 漂移曲线已保留
        </div>
      )}
    </div>
  );
}
