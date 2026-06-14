import { useRef, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAppStore } from "@/stores/useAppStore";
import type { TrailPoint } from "../../viewModel/hooks/useTrailBuffer";

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

const MAX_OBSERVED_VELOCITY = 15.0;

// DESIGN: interpolated from trail-slow (#3B82F6) to trail-fast (#EF4444) via HSL path
const DEFAULT_COLOR_STOPS: VelocityColorStop[] = [
  { position: 0.0, color: "#3B82F6" }, // trail-slow
  { position: 1.0, color: "#EF4444" }, // trail-fast
];

const DEFAULT_OPACITY = 0.9;

// 圆角粗线预分配上限
const MAX_TRAIL_POINTS = 6000;
const CAP_SEGMENTS = 8;
// strip 顶点：每原始点 2 个；两端 cap：各 1 圆心 + (CAP_SEGMENTS-1) 弧点
const MAX_VERTICES = 2 * MAX_TRAIL_POINTS + 2 * CAP_SEGMENTS;
// strip 索引：每段 6；两端 cap：各 3*CAP_SEGMENTS
const MAX_INDICES = 6 * (MAX_TRAIL_POINTS - 1) + 6 * CAP_SEGMENTS * 2;

// ─── 颜色工具函数 ────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0.5, g: 0.5, b: 0.5 };
  return {
    r: parseInt(result[1]!, 16) / 255,
    g: parseInt(result[2]!, 16) / 255,
    b: parseInt(result[3]!, 16) / 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r, g, b };
}

function lerpColorHsl(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const hsl1 = rgbToHsl(c1.r, c1.g, c1.b);
  const hsl2 = rgbToHsl(c2.r, c2.g, c2.b);
  let dh = hsl2.h - hsl1.h;
  if (dh > 0.5) dh -= 1;
  if (dh < -0.5) dh += 1;
  const h = (hsl1.h + dh * t + 1) % 1;
  const s = hsl1.s + (hsl2.s - hsl1.s) * t;
  const l = hsl1.l + (hsl2.l - hsl1.l) * t;
  return hslToRgb(h, s, l);
}

function velocityToColor(
  velocity: number,
  gradient: VelocityColorStop[],
  maxVelocityRef: { current: number },
): { r: number; g: number; b: number } {
  if (isNaN(velocity)) return { r: 0.5, g: 0.5, b: 0.5 };
  if (velocity > maxVelocityRef.current) maxVelocityRef.current = velocity;
  const t = Math.max(0, Math.min(1, velocity / maxVelocityRef.current));
  for (let i = 0; i < gradient.length - 1; i++) {
    const s1 = gradient[i]!;
    const s2 = gradient[i + 1]!;
    if (t >= s1.position && t <= s2.position) {
      const localT = (t - s1.position) / (s2.position - s1.position);
      return lerpColorHsl(hexToRgb(s1.color), hexToRgb(s2.color), localT);
    }
  }
  return hexToRgb(gradient[gradient.length - 1]!.color);
}

// ─── 移动端降级：固定宽度 Line ───────────────────

// ─── 桌面端/平板端：圆角粗线三角形带 ──────────────

function RoundCapTrail({
  points,
  colorMode,
  solidColor,
  opacity,
  maxWidth,
  colorGradient,
}: TrailRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const gradient = colorGradient ?? DEFAULT_COLOR_STOPS;
  const solidRgb = useMemo(() => hexToRgb(solidColor ?? "#f0c040"), [solidColor]);
  const maxVelocityRef = useMemo(() => ({ current: MAX_OBSERVED_VELOCITY }), []);

  const propsRef = useRef({
    colorMode,
    solidRgb,
    gradient,
    maxVelocityRef,
    targetMaxWidth: maxWidth ?? 3,
  });
  propsRef.current = {
    colorMode,
    solidRgb,
    gradient,
    maxVelocityRef,
    targetMaxWidth: maxWidth ?? 3,
  };

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(MAX_VERTICES * 3);
    const colorArray = new Float32Array(MAX_VERTICES * 3);
    const indexArray = new Uint16Array(MAX_INDICES);

    geo.setAttribute("position", new THREE.Float32BufferAttribute(posArray, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colorArray, 3));
    geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
    return geo;
  }, []);

  useFrame((state) => {
    const pts = pointsRef.current;
    const n = pts.length;
    if (n < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const pos = (geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const col = (geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const idx = (geometry.index as THREE.BufferAttribute).array as Uint16Array;

    const {
      colorMode: mode,
      solidRgb: solid,
      gradient: grad,
      maxVelocityRef: velRef,
      targetMaxWidth: targetPixelW,
    } = propsRef.current;

    // 将像素宽度转换为世界单位，确保视觉粗细恒定
    const { viewport, size } = state;
    const pixelToWorld = size.height > 0 ? viewport.height / size.height : 0.01;
    const targetWorldW = targetPixelW * pixelToWorld;
    const minWorldW = pixelToWorld; // 最小 1 像素

    let v = 0;

    // ── 第一遍：生成所有 strip 顶点（left / right） ──
    for (let i = 0; i < n; i++) {
      const pt = pts[i]!;
      const px = pt.position.x;
      const py = pt.position.y;
      const pz = pt.position.z;

      // 计算切线（miter / 角平分线）
      let tx: number;
      let ty: number;

      if (i === 0) {
        const dx = pts[1]!.position.x - px;
        const dy = pts[1]!.position.y - py;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) { tx = 1; ty = 0; }
        else { tx = dx / len; ty = dy / len; }
      } else if (i === n - 1) {
        const dx = px - pts[n - 2]!.position.x;
        const dy = py - pts[n - 2]!.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) { tx = 1; ty = 0; }
        else { tx = dx / len; ty = dy / len; }
      } else {
        const dx1 = px - pts[i - 1]!.position.x;
        const dy1 = py - pts[i - 1]!.position.y;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const dx2 = pts[i + 1]!.position.x - px;
        const dy2 = pts[i + 1]!.position.y - py;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len1 < 1e-6 && len2 < 1e-6) {
          tx = 1; ty = 0;
        } else if (len1 < 1e-6) {
          tx = dx2 / len2; ty = dy2 / len2;
        } else if (len2 < 1e-6) {
          tx = dx1 / len1; ty = dy1 / len1;
        } else {
          const ux = dx1 / len1 + dx2 / len2;
          const uy = dy1 / len1 + dy2 / len2;
          const ulen = Math.sqrt(ux * ux + uy * uy);
          if (ulen < 1e-6) {
            tx = dx1 / len1; ty = dy1 / len1;
          } else {
            tx = ux / ulen; ty = uy / ulen;
          }
        }
      }

      // 法线（XY 平面）
      const nx = -ty;
      const ny = tx;

      // 半宽（世界单位）
      const width = Math.max(minWorldW, Math.min(targetWorldW, targetWorldW * (pt.velocity / velRef.current)));
      const hw = width * 0.5;

      // 颜色
      let cr: number, cg: number, cb: number;
      if (mode === "velocity") {
        const c = velocityToColor(pt.velocity, grad, velRef);
        cr = c.r; cg = c.g; cb = c.b;
      } else {
        cr = solid.r; cg = solid.g; cb = solid.b;
      }

      // left vertex
      pos[v * 3] = px + nx * hw;
      pos[v * 3 + 1] = py + ny * hw;
      pos[v * 3 + 2] = pz;
      col[v * 3] = cr; col[v * 3 + 1] = cg; col[v * 3 + 2] = cb;
      v++;

      // right vertex
      pos[v * 3] = px - nx * hw;
      pos[v * 3 + 1] = py - ny * hw;
      pos[v * 3 + 2] = pz;
      col[v * 3] = cr; col[v * 3 + 1] = cg; col[v * 3 + 2] = cb;
      v++;
    }

    // ── 第二遍：生成索引 ──
    let ii = 0;

    // strip: 每段 2 个三角形（6 个索引）
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = i * 2 + 2;
      const d = i * 2 + 3;

      idx[ii++] = a;
      idx[ii++] = b;
      idx[ii++] = c;

      idx[ii++] = b;
      idx[ii++] = d;
      idx[ii++] = c;
    }

    // ── start cap（尾迹起点） ──
    // 圆心
    const startCenter = v;
    const p0 = pts[0]!;
    const p1 = pts[1]!;
    const pLast = pts[n - 1]!;
    const pPrev = pts[n - 2]!;
    pos[v * 3] = p0.position.x;
    pos[v * 3 + 1] = p0.position.y;
    pos[v * 3 + 2] = p0.position.z;
    const c0r = col[0]!;
    const c0g = col[1]!;
    const c0b = col[2]!;
    col[v * 3] = c0r; col[v * 3 + 1] = c0g; col[v * 3 + 2] = c0b;
    v++;

    // 半径 = hw0
    const hw0 = Math.sqrt(
      (pos[0]! - p0.position.x) ** 2 +
      (pos[1]! - p0.position.y) ** 2
    );

    // 轨迹方向（从 p0 到 p1）
    const tx0 = p1.position.x - p0.position.x;
    const ty0 = p1.position.y - p0.position.y;
    const tlen0 = Math.sqrt(tx0 * tx0 + ty0 * ty0);
    const ndx0 = tlen0 < 1e-6 ? -1 : -tx0 / tlen0;
    const ndy0 = tlen0 < 1e-6 ? 0 : -ty0 / tlen0;
    const baseAngle0 = Math.atan2(ndy0, ndx0);

    // right = 顶点 1, left = 顶点 0
    // 从 right 顺时针到 left，经过外侧（baseAngle0 方向）
    const rightAngle0 = baseAngle0 + Math.PI / 2;

    for (let k = 1; k < CAP_SEGMENTS; k++) {
      const angle = rightAngle0 - (k * Math.PI) / CAP_SEGMENTS;
      pos[v * 3] = p0.position.x + Math.cos(angle) * hw0;
      pos[v * 3 + 1] = p0.position.y + Math.sin(angle) * hw0;
      pos[v * 3 + 2] = p0.position.z;
      col[v * 3] = c0r; col[v * 3 + 1] = c0g; col[v * 3 + 2] = c0b;
      v++;
    }

    // start cap triangles (fan)
    idx[ii++] = startCenter;
    idx[ii++] = 1; // right[0]
    idx[ii++] = startCenter + 1;

    for (let k = 1; k < CAP_SEGMENTS - 1; k++) {
      idx[ii++] = startCenter;
      idx[ii++] = startCenter + k;
      idx[ii++] = startCenter + k + 1;
    }

    idx[ii++] = startCenter;
    idx[ii++] = startCenter + CAP_SEGMENTS - 1;
    idx[ii++] = 0; // left[0]

    // ── end cap（尾迹终点） ──
    const endCenter = v;
    pos[v * 3] = pLast.position.x;
    pos[v * 3 + 1] = pLast.position.y;
    pos[v * 3 + 2] = pLast.position.z;
    const cNr = col[(n - 1) * 2 * 3]!;
    const cNg = col[(n - 1) * 2 * 3 + 1]!;
    const cNb = col[(n - 1) * 2 * 3 + 2]!;
    col[v * 3] = cNr; col[v * 3 + 1] = cNg; col[v * 3 + 2] = cNb;
    v++;

    const hwN = Math.sqrt(
      (pos[(n - 1) * 2 * 3]! - pLast.position.x) ** 2 +
      (pos[(n - 1) * 2 * 3 + 1]! - pLast.position.y) ** 2
    );

    const txN = pLast.position.x - pPrev.position.x;
    const tyN = pLast.position.y - pPrev.position.y;
    const tlenN = Math.sqrt(txN * txN + tyN * tyN);
    const ndxN = tlenN < 1e-6 ? 1 : txN / tlenN;
    const ndyN = tlenN < 1e-6 ? 0 : tyN / tlenN;
    const baseAngleN = Math.atan2(ndyN, ndxN);

    const leftAngleN = baseAngleN + Math.PI / 2;

    for (let k = 1; k < CAP_SEGMENTS; k++) {
      const angle = leftAngleN - (k * Math.PI) / CAP_SEGMENTS;
      pos[v * 3] = pLast.position.x + Math.cos(angle) * hwN;
      pos[v * 3 + 1] = pLast.position.y + Math.sin(angle) * hwN;
      pos[v * 3 + 2] = pLast.position.z;
      col[v * 3] = cNr; col[v * 3 + 1] = cNg; col[v * 3 + 2] = cNb;
      v++;
    }

    const leftN = (n - 1) * 2;
    const rightN = (n - 1) * 2 + 1;

    idx[ii++] = endCenter;
    idx[ii++] = leftN;
    idx[ii++] = endCenter + 1;

    for (let k = 1; k < CAP_SEGMENTS - 1; k++) {
      idx[ii++] = endCenter;
      idx[ii++] = endCenter + k + 1;
      idx[ii++] = endCenter + k;
    }

    idx[ii++] = endCenter;
    idx[ii++] = rightN;
    idx[ii++] = endCenter + CAP_SEGMENTS - 1;

    geometry.setDrawRange(0, ii);
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
    geometry.index!.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshBasicMaterial
        vertexColors
        side={THREE.DoubleSide}
        transparent
        opacity={opacity ?? DEFAULT_OPACITY}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── 主组件 ──────────────────────────────────────

function TrailRendererImpl({
  points,
  colorMode = "velocity",
  solidColor = "#f0c040",
  opacity = DEFAULT_OPACITY,
  maxWidth = 15,
  colorGradient,
}: TrailRendererProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const isMobile = deviceType === "mobile";

  if (points.length < 2) return null;

  // 手机端完全关闭尾迹（设计文档要求 + 性能降级）
  if (isMobile) return null;

  return (
    <RoundCapTrail
      points={points}
      colorMode={colorMode}
      solidColor={solidColor}
      opacity={opacity}
      maxWidth={maxWidth}
      colorGradient={colorGradient}
    />
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
