import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * R3F 轨迹叠加层。
 * 在 Scene3D Canvas 内渲染正向历史虚线 + 反演轨迹实线。
 * 通过模块级变量与 TimeReversal 组件共享数据。
 */

// ═══════════════════════════════════════════════════
// 模块级共享数据
// ═══════════════════════════════════════════════════

const FADE_OUT_DURATION = 10; // 秒

interface TrajectoryData {
  forwardPoints: THREE.Vector3[];
  reversalPoints: THREE.Vector3[];
  reversalColor: string;
  visible: boolean;
  /** performance.now() 时间戳 — 设置后开始 10 秒淡出 */
  fadeOutAt: number | null;
}

let sharedData: TrajectoryData = {
  forwardPoints: [],
  reversalPoints: [],
  reversalColor: "#00ffff",
  visible: false,
  fadeOutAt: null,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  for (const cb of listeners) cb();
}

export function updateTrajectoryData(patch: Partial<TrajectoryData>): void {
  sharedData = { ...sharedData, ...patch };
  notifyListeners();
}

export function clearTrajectoryData(): void {
  sharedData = {
    forwardPoints: [],
    reversalPoints: [],
    reversalColor: "#00ffff",
    visible: false,
    fadeOutAt: null,
  };
  notifyListeners();
}

export function startTrajectoryFadeOut(): void {
  sharedData = { ...sharedData, fadeOutAt: performance.now() };
  notifyListeners();
}

// ═══════════════════════════════════════════════════
// R3F 组件
// ═══════════════════════════════════════════════════

export function TimeReversalTrajectoryOverlay() {
  const [tick, setTick] = useState(0);
  const forwardLineRef = useRef<THREE.LineSegments>(null);
  const reversalLineRef = useRef<THREE.Line>(null);
  const fadeStartedRef = useRef(false);

  // 订阅模块级数据更新，触发重渲染
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const data = sharedData;
  void tick; // 用于强制 re-render

  // ── 淡出动画 ──
  useFrame(() => {
    if (!data.fadeOutAt) return;
    const elapsed = (performance.now() - data.fadeOutAt) / 1000;
    const progress = Math.min(elapsed / FADE_OUT_DURATION, 1);

    const fwdLine = forwardLineRef.current;
    const revLine = reversalLineRef.current;

    if (fwdLine?.material) {
      const mat = fwdLine.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, 0.4 * (1 - progress));
    }
    if (revLine?.material) {
      const mat = revLine.material as THREE.LineBasicMaterial;
      mat.opacity = 1 - progress;
    }

    if (progress >= 1) {
      clearTrajectoryData();
      fadeStartedRef.current = false;
    }
  });

  // 正向轨迹（虚线效果：每隔一个点取点）
  useEffect(() => {
    const line = forwardLineRef.current;
    if (!line) return;

    if (data.forwardPoints.length < 2 || !data.visible) {
      line.visible = false;
      return;
    }

    line.visible = true;
    const dashed: number[] = [];
    for (let i = 0; i < data.forwardPoints.length; i += 2) {
      const p = data.forwardPoints[i]!;
      dashed.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(dashed, 3));
    line.geometry.dispose();
    line.geometry = geo;
  }, [data.forwardPoints, data.visible]);

  // 反演轨迹（实线）
  useEffect(() => {
    const line = reversalLineRef.current;
    if (!line) return;

    if (data.reversalPoints.length < 2 || !data.visible) {
      line.visible = false;
      return;
    }

    line.visible = true;
    const pts: number[] = [];
    for (const p of data.reversalPoints) {
      pts.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    line.geometry.dispose();
    line.geometry = geo;
  }, [data.reversalPoints, data.visible]);

  return (
    <>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <lineSegments ref={forwardLineRef as any}>
        <bufferGeometry />
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.4}
          depthTest
        />
      </lineSegments>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={reversalLineRef as any}>
        <bufferGeometry />
        <lineBasicMaterial
          color={data.reversalColor}
          depthTest
        />
      </line>
    </>
  );
}
