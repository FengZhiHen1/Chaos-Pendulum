import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * R3F 轨迹叠加层。
 * 在 Scene3D Canvas 内渲染正向历史虚线 + 反演轨迹实线。
 * 通过模块级变量与 TimeReversal 组件共享数据。
 */

// ─── 模块级共享数据 ────────────────────────────────

interface TrajectoryData {
  forwardPoints: THREE.Vector3[];
  reversalPoints: THREE.Vector3[];
  reversalColor: string;
  visible: boolean;
}

let sharedData: TrajectoryData = {
  forwardPoints: [],
  reversalPoints: [],
  reversalColor: "#00ffff",
  visible: false,
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
  };
  notifyListeners();
}

// ─── R3F 组件 ──────────────────────────────────────

export function TimeReversalTrajectoryOverlay() {
  const [tick, setTick] = useState(0);
  const forwardLineRef = useRef<THREE.LineSegments>(null);
  const reversalLineRef = useRef<THREE.Line>(null);

  // 订阅模块级数据更新，触发重渲染
  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const data = sharedData;
  // tick 用于强制 re-render；消除未使用警告
  void tick;

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
          opacity={0.3}
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
