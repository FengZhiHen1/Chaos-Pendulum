import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Vector3 } from "three";
import { RingBuffer } from "@/features/data";
import { useSimulationStore, ball2Position, normalizeAngle } from "@/features/simulation";
import { useExploreStore } from "@/features/explore";
import type { PendulumParams, StateVector } from "@/shared/types";

// ─── 类型定义 ────────────────────────────────────

export interface TrailPoint {
  position: Vector3;
  velocity: number;
}

type TrailPersistence = 50 | 200 | 1000 | 0 | -1;

export interface TrailBufferAPI {
  trailPoints: TrailPoint[];
  appendPoint: (point: TrailPoint, params: PendulumParams, state: StateVector) => void;
  clear: () => void;
  persistence: TrailPersistence;
}

// ─── 常量 ────────────────────────────────────────

const RING_BUFFER_CAPACITY = 6000;
const MAX_NAN_SKIP = 60;
const PHASE_DISTANCE_THRESHOLD = 0.05;
const MIN_STEPS_FOR_CYCLE = 100;

// ─── 辅助函数 ────────────────────────────────────

function mapPersistence(trailLength: 50 | 200 | 1000 | 0 | -1): TrailPersistence {
  return trailLength;
}

function computeTrailPoint(
  state: StateVector,
  params: PendulumParams,
): TrailPoint {
  const pos = ball2Position(state, params);
  return {
    position: new Vector3(pos.x, pos.y, pos.z),
    velocity: params.L2 * Math.abs(state.omega2),
  };
}

// ─── Hook ────────────────────────────────────────

export function useTrailBuffer(): TrailBufferAPI {
  const ringBufferRef = useRef<RingBuffer<TrailPoint> | null>(null);
  if (!ringBufferRef.current) {
    ringBufferRef.current = new RingBuffer<TrailPoint>(RING_BUFFER_CAPACITY);
  }

  const nanSkipCountRef = useRef(0);
  const lastCapacityWarnedRef = useRef(false);
  const lastAppendParamsRef = useRef<{ L1: number; L2: number } | null>(null);

  // 周期检测状态
  const cycleStartStateRef = useRef<StateVector | null>(null);
  const cycleStartPointRef = useRef<TrailPoint | null>(null);
  const stepsSinceCycleStartRef = useRef(0);
  const cycleDetectedOnceRef = useRef(false);

  const trailLength = useExploreStore((s) => s.trailLength);
  const persistence: TrailPersistence = mapPersistence(trailLength);

  // 渲染阶段同步清空：useEffect 在绘制后执行会导致闪现，此处必须在渲染阶段检测并清空
  const resetTrigger = useSimulationStore((s) => s.resetTrigger);
  const prevResetTriggerRef = useRef(resetTrigger);
  if (prevResetTriggerRef.current !== resetTrigger) {
    prevResetTriggerRef.current = resetTrigger;
    ringBufferRef.current!.clear();
    cycleStartStateRef.current = null;
    cycleStartPointRef.current = null;
    stepsSinceCycleStartRef.current = 0;
    cycleDetectedOnceRef.current = false;
    lastAppendParamsRef.current = null;
  }

  // 版本号：每次 mutation 自增，触发 React 重渲染以更新 trailPoints
  const [version, setVersion] = useState(0);

  // ── persistence 变化时的截断处理 ──
  const prevPersistenceRef = useRef(persistence);

  // ── clear ──
  const clear = useCallback(() => {
    ringBufferRef.current!.clear();
    cycleStartStateRef.current = null;
    cycleStartPointRef.current = null;
    stepsSinceCycleStartRef.current = 0;
    cycleDetectedOnceRef.current = false;
    lastAppendParamsRef.current = null;
    setVersion((v) => v + 1);
  }, []);

  // ── appendPoint ──
  const appendPoint = useCallback(
    (_point: TrailPoint, params: PendulumParams, state: StateVector) => {
      const isRunning = useSimulationStore.getState().isRunning;
      if (!isRunning) return;

      // NaN 检测
      if (
        isNaN(state.theta1) || isNaN(state.omega1) ||
        isNaN(state.theta2) || isNaN(state.omega2) ||
        !isFinite(state.theta1) || !isFinite(state.omega1) ||
        !isFinite(state.theta2) || !isFinite(state.omega2)
      ) {
        nanSkipCountRef.current++;
        if (nanSkipCountRef.current >= MAX_NAN_SKIP) {
          ringBufferRef.current!.clear();
          nanSkipCountRef.current = 0;
          console.warn("EXP-02: cleared trail buffer after 60 consecutive NaN frames");
        }
        return;
      }
      nanSkipCountRef.current = 0;

      // 计算实际的尾迹点
      const point = computeTrailPoint(state, params);

      // 检查坐标合法性
      if (
        isNaN(point.position.x) || isNaN(point.position.y) || isNaN(point.position.z) ||
        !isFinite(point.position.x) || !isFinite(point.position.y) || !isFinite(point.position.z)
      ) {
        return;
      }

      const rb = ringBufferRef.current!;

      // 参数变更检测：L1/L2 变化意味着系统已改变，旧轨迹点无效
      if (rb.length > 0 && lastAppendParamsRef.current) {
        const prev = lastAppendParamsRef.current;
        if (prev.L1 !== params.L1 || prev.L2 !== params.L2) {
          rb.clear();
        }
      }

      // 帧间跳跃检测：位移超过当前速度合理上限则视为闪现
      if (rb.length > 0) {
        const last = rb.at(rb.length - 1)!;
        const dx = point.position.x - last.position.x;
        const dy = point.position.y - last.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxSpeed = params.L1 * Math.abs(state.omega1) + params.L2 * Math.abs(state.omega2);
        const maxDispPerFrame = maxSpeed / 60;
        const minThreshold = (params.L1 + params.L2) * 0.5;
        const effectiveThreshold = Math.max(maxDispPerFrame * 3, minThreshold);
        if (dist > effectiveThreshold) {
          rb.clear();
        }
      }

      // 周期模式检测
      const currentPersistence = persistence;
      if (currentPersistence === -1) {
        if (!cycleStartStateRef.current) {
          cycleStartStateRef.current = { ...state };
          if (rb.length > 0) {
            cycleStartPointRef.current = rb.at(rb.length - 1)!;
          }
          stepsSinceCycleStartRef.current = 0;
          cycleDetectedOnceRef.current = false;
        }

        stepsSinceCycleStartRef.current++;

        if (stepsSinceCycleStartRef.current >= MIN_STEPS_FOR_CYCLE && cycleStartStateRef.current) {
          const dTheta1 = Math.abs(normalizeAngle(state.theta1 - cycleStartStateRef.current.theta1));
          const dTheta2 = Math.abs(normalizeAngle(state.theta2 - cycleStartStateRef.current.theta2));
          const phaseDistance = Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2);

          if (phaseDistance < PHASE_DISTANCE_THRESHOLD) {
            cycleDetectedOnceRef.current = true;
            // 从头覆盖旧点，保留当前周期
            rb.clear();
            cycleStartStateRef.current = { ...state };
            stepsSinceCycleStartRef.current = 0;
          }
        }

        // 周期模式未检测到时，若 buffer 满了自然循环覆盖
        if (!cycleDetectedOnceRef.current && rb.length >= RING_BUFFER_CAPACITY) {
          if (!lastCapacityWarnedRef.current) {
            console.log("EXP-02: period not detected within buffer capacity, cycling naturally");
            lastCapacityWarnedRef.current = true;
          }
        }
      } else {
        lastCapacityWarnedRef.current = false;
      }

      // 追加点
      rb.push(point);
      lastAppendParamsRef.current = { L1: params.L1, L2: params.L2 };

      // 调试：每 60 帧打印一次
      if (rb.length % 60 === 1) {
        console.log("[useTrailBuffer] pushed point:",
          "pos=", point.position.x.toFixed(3), point.position.y.toFixed(3),
          "vel=", point.velocity.toFixed(3),
          "rb.length=", rb.length);
      }

      // 无限模式下容量警告（仅首次）
      if (
        currentPersistence === 0 &&
        rb.length >= RING_BUFFER_CAPACITY &&
        !lastCapacityWarnedRef.current
      ) {
        console.log("EXP-02: ring buffer at capacity, oldest points overwritten");
        lastCapacityWarnedRef.current = true;
      }

      setVersion((v) => v + 1);
    },
    [persistence],
  );

  // ── persistence 切换截断 ──
  useEffect(() => {
    if (prevPersistenceRef.current === persistence) return;
    prevPersistenceRef.current = persistence;

    if (persistence === -1) {
      // 切换到周期模式：重置周期检测状态
      cycleStartStateRef.current = null;
      cycleStartPointRef.current = null;
      stepsSinceCycleStartRef.current = 0;
      cycleDetectedOnceRef.current = false;
    } else if (persistence > 0) {
      // 切换到有限持久度：截断
      const rb = ringBufferRef.current!;
      if (rb.length > persistence) {
        const all = rb.toArray();
        const truncated = all.slice(-persistence);
        rb.clear();
        for (const p of truncated) {
          rb.push(p);
        }
      }
    }
    lastCapacityWarnedRef.current = false;
  }, [persistence]);

  // ── trailPoints（每次渲染计算） ──
  const trailPoints = useMemo(() => {
    const rb = ringBufferRef.current!;
    if (rb.length === 0) return [];

    if (persistence === -1) {
      return rb.toArray();
    }

    const all = rb.toArray();
    if (persistence === 0) {
      return all;
    }
    return all.length > persistence ? all.slice(-persistence) : all;
  }, [persistence, version, resetTrigger]);

  return { trailPoints, appendPoint, clear, persistence };
}
