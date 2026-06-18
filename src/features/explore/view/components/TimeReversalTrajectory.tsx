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
  reversalColor: "#00FFFF",
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
    reversalColor: "#00FFFF",
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
  const forwardLineRef = useRef<THREE.Line>(null);
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
      const mat = fwdLine.material as THREE.LineDashedMaterial;
      mat.opacity = Math.max(0, 0.4 * (1 - progress));
    }
    if (revLine?.material) {
      const mat = revLine.material as THREE.LineBasicMaterial;
      mat.opacity = 1 - progress;
    }

    if (progress >= 1) {
      // 延迟 clear 到下一帧，避免在 R3F useFrame 中触发 React setState
      requestAnimationFrame(() => clearTrajectoryData());
      fadeStartedRef.current = false;
    }
  });

  // ── 正向轨迹（虚线：Line + LineDashedMaterial + computeLineDistances）──
  useEffect(() => {
    const line = forwardLineRef.current;
    if (!line) return;

    if (data.forwardPoints.length < 2 || !data.visible) {
      line.visible = false;
      return;
    }

    line.visible = true;
    const pts: number[] = [];
    for (const p of data.forwardPoints) {
      pts.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    line.geometry.dispose();
    line.geometry = geo;
    // computeLineDistances 是 LineDashedMaterial 正常工作的必要条件
    line.computeLineDistances();
  }, [data.forwardPoints, data.visible]);

  // ── 反演轨迹（实线）──
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
      {/* 正向轨迹：白色虚线 */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={forwardLineRef as any}>
        <bufferGeometry />
        <lineDashedMaterial
          color="#FFFFFF"
          transparent
          opacity={0.4}
          depthTest
          dashSize={0.3}
          gapSize={0.15}
        />
      </line>

      {/* 反演轨迹：实线（颜色由模式决定：精确=金色，数值=青色） */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <line ref={reversalLineRef as any}>
        <bufferGeometry />
        <lineBasicMaterial
          color={data.reversalColor}
          transparent
          depthTest
        />
      </line>
    </>
  );
}
