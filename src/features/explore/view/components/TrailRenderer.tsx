/**
 * TrailRenderer — 运动尾迹渲染器（编排层）。
 *
 * 纯表现组件：设备自适应 + R3F Context 检测。
 * 实际渲染委托给 RoundCapTrailMesh。
 */
import { useThree } from "@react-three/fiber";
import { useAppStore } from "@/stores/useAppStore";
import type { TrailPoint } from "../../viewModel/hooks/useTrailBuffer";
import { RoundCapTrailMesh } from "./RoundCapTrailMesh";
import type { VelocityColorStop } from "./TrailColorUtils";

export interface TrailRendererProps {
  points: TrailPoint[];
  colorMode?: "velocity" | "solid";
  solidColor?: string;
  opacity?: number;
  maxWidth?: number;
  colorGradient?: VelocityColorStop[];
}

export function TrailRenderer(props: TrailRendererProps) {
  try { useThree(); } catch { return null; }

  const isMobile = useAppStore((s) => s.deviceType) === "mobile";
  if (isMobile || props.points.length < 2) return null;

  return <RoundCapTrailMesh {...props} />;
}
