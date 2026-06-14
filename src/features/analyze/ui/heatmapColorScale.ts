/**
 * 模块: analyze.view.components.heatmapColorScale
 * 职责: 为 Lyapunov 热力图提供符合 DESIGN.md 语义色的颜色映射。
 * 边界:
 *   - 仅返回 CSS 颜色字符串，不依赖 React
 */

import type { LyapunovLayerType } from "../types";

const STABLE_RGB = { r: 30, g: 58, b: 95 };      // lyapunov-stable #1E3A5F
const NEUTRAL_RGB = { r: 45, g: 212, b: 191 };   // lyapunov-neutral #2DD4BF
const CHAOTIC_RGB = { r: 249, g: 115, b: 22 };   // lyapunov-chaotic #F97316

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toChannel = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
}

function interpolateRgb(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number,
): string {
  return rgbToHex(
    lerp(from.r, to.r, t),
    lerp(from.g, to.g, t),
    lerp(from.b, to.b, t),
  );
}

/**
 * 生成 Lyapunov 热力图颜色映射函数。
 *
 * - lyapunov_max / lyapunov_min: 稳定 → 中性 → 混沌的语义渐变
 * - energy_curvature: 暗室风格的 surface-container-high → primary → tertiary 渐变
 */
export function createHeatmapColorScale(
  layerType: LyapunovLayerType,
  minVal: number,
  maxVal: number,
): (value: number) => string {
  if (layerType === "energy_curvature") {
    return (value: number) => {
      const t = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
      const low = { r: 49, g: 53, b: 61 };
      const mid = { r: 75, g: 159, b: 255 };
      const high = { r: 45, g: 212, b: 191 };
      if (t < 0.5) {
        return interpolateRgb(low, mid, t * 2);
      }
      return interpolateRgb(mid, high, (t - 0.5) * 2);
    };
  }

  const hasNegative = minVal < 0;
  const hasPositive = maxVal > 0;

  return (value: number) => {
    if (hasNegative && hasPositive) {
      if (value <= 0) {
        const t = minVal === 0 ? 0 : (value - minVal) / (0 - minVal);
        return interpolateRgb(STABLE_RGB, NEUTRAL_RGB, Math.max(0, Math.min(1, t)));
      }
      const t = maxVal === 0 ? 1 : value / maxVal;
      return interpolateRgb(NEUTRAL_RGB, CHAOTIC_RGB, Math.max(0, Math.min(1, t)));
    }

    if (hasNegative) {
      const t = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
      return interpolateRgb(STABLE_RGB, NEUTRAL_RGB, t);
    }

    const t = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
    return interpolateRgb(NEUTRAL_RGB, CHAOTIC_RGB, t);
  };
}
