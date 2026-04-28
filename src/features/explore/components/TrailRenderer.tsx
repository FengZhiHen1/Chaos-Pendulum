import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";
import { useAppStore } from "@/stores/useAppStore";
import type { TrailPoint } from "../hooks/useTrailBuffer";

// ─── 类型定义 ────────────────────────────────────

interface VelocityColorStop {
  position: number;
  color: string;
}

export interface TrailRendererProps {
  points: TrailPoint[];
  colorMode?: "velocity" | "solid";
  solidColor?: string;
  opacity?: number;
  maxWidth?: number;
  colorGradient?: VelocityColorStop[];
}

// ─── 常量 ────────────────────────────────────────

const DEFAULT_VELOCITY_COLOR_GRADIENT: VelocityColorStop[] = [
  { position: 0.0, color: "#0044ff" },
  { position: 0.2, color: "#00ccff" },
  { position: 0.4, color: "#00ff88" },
  { position: 0.6, color: "#ffdd00" },
  { position: 0.8, color: "#ff6600" },
  { position: 1.0, color: "#ff0000" },
];

const MAX_OBSERVED_VELOCITY = 15.0;

// ─── 辅助函数 ────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0.5, g: 0.5, b: 0.5 };
  return {
    r: parseInt(result[1]!, 16) / 255,
    g: parseInt(result[2]!, 16) / 255,
    b: parseInt(result[3]!, 16) / 255,
  };
}

function lerpColor(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  };
}

function velocityToColor(
  velocity: number,
  gradient: VelocityColorStop[],
  maxVelocityRef: { current: number },
): { r: number; g: number; b: number } {
  if (isNaN(velocity)) return { r: 0.5, g: 0.5, b: 0.5 };

  // 自动扩展最大速度
  if (velocity > maxVelocityRef.current) {
    maxVelocityRef.current = velocity;
  }

  const t = Math.max(0, Math.min(1, velocity / maxVelocityRef.current));

  // 在断点间插值
  for (let i = 0; i < gradient.length - 1; i++) {
    const s1 = gradient[i]!;
    const s2 = gradient[i + 1]!;
    if (t >= s1.position && t <= s2.position) {
      const localT = (t - s1.position) / (s2.position - s1.position);
      return lerpColor(hexToRgb(s1.color), hexToRgb(s2.color), localT);
    }
  }

  // 超出最后一个断点（t === 1.0）
  if (t >= gradient[gradient.length - 1]!.position) {
    return hexToRgb(gradient[gradient.length - 1]!.color);
  }

  return hexToRgb(gradient[0]!.color);
}

// ─── 三角形带宽度计算 ────────────────────────────

function computeSegmentWidth(
  v1: number,
  v2: number,
  maxWidth: number,
  maxVelocity: number,
): number {
  const avgV = (v1 + v2) / 2;
  const w = maxWidth * (avgV / maxVelocity);
  return Math.max(1.0, Math.min(maxWidth, w));
}

// ─── 主组件 ──────────────────────────────────────

function TrailRendererImpl({
  points,
  colorMode = "velocity",
  solidColor = "#f0c040",
  opacity = 0.85,
  maxWidth = 3,
  colorGradient,
}: TrailRendererProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const gradient= colorGradient ?? DEFAULT_VELOCITY_COLOR_GRADIENT;
  const solidRgb = useMemo(() => hexToRgb(solidColor), [solidColor]);

  // 内部可变值（不触发 React 重渲染）
  const maxVelocityRef = useRef(MAX_OBSERVED_VELOCITY);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  // 设备降级参数
  const isMobile = deviceType === "mobile";
  const isTablet = deviceType === "tablet";
  const effectiveMaxWidth = isMobile ? 1 : isTablet ? 3 : maxWidth;
  const maxVertices = isMobile ? 500 * 6 : isTablet ? 2000 * 6 : 6000 * 6;

  // 创建/复用 BufferGeometry（三角形带方案）
  const positionArray = useMemo(() => new Float32Array(maxVertices), [maxVertices]);
  const colorArray = useMemo(() => new Float32Array(maxVertices), [maxVertices]);

  // ── 每帧更新 ──
  useFrame(() => {
    if (points.length < 2) {
      if (meshRef.current) meshRef.current.visible = false;
      return;
    }

    if (isMobile) return; // 移动端使用下方 Line 渲染

    if (!geometryRef.current) return;
    if (meshRef.current) meshRef.current.visible = true;

    const posAttr = geometryRef.current.attributes.position as THREE.BufferAttribute;
    const colAttr = geometryRef.current.attributes.color as THREE.BufferAttribute;

    let vi = 0; // 写入的顶点索引

    for (let i = 0; i < points.length - 1 && vi + 6 <= maxVertices; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;

      const dir = new Vector3().subVectors(p2.position, p1.position);
      const dist = dir.length();
      if (dist < 0.0001) continue;
      dir.normalize();

      const perp = new Vector3(-dir.y, dir.x, 0);
      const width = computeSegmentWidth(p1.velocity, p2.velocity, effectiveMaxWidth, maxVelocityRef.current);
      const halfW = width / 2;

      const left1 = new Vector3().copy(p1.position).addScaledVector(perp, halfW);
      const right1 = new Vector3().copy(p1.position).addScaledVector(perp, -halfW);
      const left2 = new Vector3().copy(p2.position).addScaledVector(perp, halfW);
      const right2 = new Vector3().copy(p2.position).addScaledVector(perp, -halfW);

      // 写入位置
      const positions = [
        left1, right1, left2,
        right1, right2, left2,
      ];

      let color: { r: number; g: number; b: number };
      if (colorMode === "velocity") {
        const vAvg = (p1.velocity + p2.velocity) / 2;
        color = velocityToColor(vAvg, gradient, maxVelocityRef);
      } else {
        color = solidRgb;
      }

      for (const pos of positions) {
        const idx = vi * 3;
        posAttr.array[idx] = pos.x;
        posAttr.array[idx + 1] = pos.y;
        posAttr.array[idx + 2] = pos.z;

        colAttr.array[idx] = color.r;
        colAttr.array[idx + 1] = color.g;
        colAttr.array[idx + 2] = color.b;

        vi++;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geometryRef.current.setDrawRange(0, vi);
  });

  // 创建 Geometry（仅挂载时）
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positionArray, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [positionArray, colorArray]);

  // 存储 ref
  geometryRef.current = geometry;

  // ── 移动端降级：使用 drei <Line> ──
  if (isMobile) {
    if (points.length < 2) return null;
    const linePoints = points.map((p) => p.position.toArray());
    const lineColors = points.map((p) => {
      if (colorMode === "velocity") {
        const c = velocityToColor(p.velocity, gradient, maxVelocityRef);
        return [c.r, c.g, c.b] as [number, number, number];
      }
      return [solidRgb.r, solidRgb.g, solidRgb.b] as [number, number, number];
    });
    return (
      <Line
        points={linePoints as [number, number, number][]}
        color={colorMode === "solid" ? solidColor : undefined}
        vertexColors={colorMode === "velocity" ? lineColors : undefined}
        lineWidth={1}
        transparent
        opacity={opacity}
      />
    );
  }

  // ── 桌面/平板端：三角形带 ──
  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <meshBasicMaterial
        vertexColors
        side={THREE.DoubleSide}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── 带 Canvas 检测的包装器 ─────────────────────

export function TrailRenderer(props: TrailRendererProps) {
  try {
    useThree();
  } catch {
    console.error("EXP-02: TrailRenderer must be rendered inside R3F <Canvas>");
    return null;
  }

  return <TrailRendererImpl {...props} />;
}
