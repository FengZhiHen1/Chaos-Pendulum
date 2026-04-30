import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
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

const MAX_OBSERVED_VELOCITY = 15.0;

const DEFAULT_COLOR_STOPS: VelocityColorStop[] = [
  { position: 0.0, color: "#3B82F6" },
  { position: 0.25, color: "#06B6D4" },
  { position: 0.5, color: "#10B981" },
  { position: 0.75, color: "#F59E0B" },
  { position: 1.0, color: "#EF4444" },
];

const DEFAULT_OPACITY = 0.9;

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

// ─── 主组件 ──────────────────────────────────────

function TrailRendererImpl({
  points,
  colorMode = "velocity",
  solidColor = "#f0c040",
  opacity = DEFAULT_OPACITY,
  colorGradient,
}: TrailRendererProps) {
  const deviceType = useAppStore((s) => s.deviceType);
  const gradient = colorGradient ?? DEFAULT_COLOR_STOPS;
  const solidRgb = useMemo(() => hexToRgb(solidColor), [solidColor]);
  const maxVelocityRef = useMemo(() => ({ current: MAX_OBSERVED_VELOCITY }), []);

  const isMobile = deviceType === "mobile";

  if (points.length < 2) return null;

  const linePoints = points.map((p) => p.position.toArray());
  const lineColors = points.map((p) => {
    if (colorMode === "velocity") {
      const c = velocityToColor(p.velocity, gradient, maxVelocityRef);
      return [c.r, c.g, c.b] as [number, number, number];
    }
    return [solidRgb.r, solidRgb.g, solidRgb.b] as [number, number, number];
  });

  const lineWidth = isMobile ? 1 : 2;

  return (
    <Line
      points={linePoints as [number, number, number][]}
      color={colorMode === "solid" ? solidColor : undefined}
      vertexColors={colorMode === "velocity" ? lineColors : undefined}
      lineWidth={lineWidth}
      transparent
      opacity={opacity}
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
