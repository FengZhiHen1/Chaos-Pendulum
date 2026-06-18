/**
 * 模块: analyze.view.EnergyLandscapeContourCanvas
 * 职责: 将等值线段绘制到 OffscreenCanvas，生成 THREE.CanvasTexture。
 * 边界:
 *   - 依赖 extractContours (Marching Squares) 的输出
 *   - 不依赖 React 或 Zustand Store
 *   - 所有颜色从 colorTokens 导入
 */

import * as THREE from "three";
import {
  LYAPUNOV_STABLE,
  LYAPUNOV_NEUTRAL,
  LYAPUNOV_CHAOTIC,
} from "./colorTokens";
import type { ContourSegment } from "./EnergyLandscapeMarchingSquares";

/** 等高线层级数量 */
export const CONTOUR_LEVEL_COUNT = 12;

/** Canvas 纹理分辨率 (px × px) */
export const TEXTURE_SIZE = 1024;

/** 等高线最大不透明度 (高层级 / 混沌侧) */
const CONTOUR_MAX_OPACITY = 0.40;

/** 等高线最小不透明度 (低层级 / 稳定侧) */
const CONTOUR_MIN_OPACITY = 0.18;

/** 等高线绘制宽度 (px) */
const CONTOUR_LINE_WIDTH = 1.0;

/** 势能边界微扩比例，避免等值线紧贴纹理边缘 */
const RANGE_PADDING_RATIO = 0.02;

// ── 阈值计算 ─────────────────────────────────────────

/**
 * 根据势能范围和层级数，生成等距阈值列表。
 * 在 min/max 处微扩以留边距，避免等值线紧贴边界。
 */
export function computeThresholds(
  minValue: number,
  maxValue: number,
): number[] {
  const range = maxValue - minValue;
  if (range < 0.001) return [];
  const paddedMin = minValue - range * RANGE_PADDING_RATIO;
  const paddedMax = maxValue + range * RANGE_PADDING_RATIO;
  const paddedRange = paddedMax - paddedMin;
  const thresholds: number[] = [];
  for (let i = 0; i < CONTOUR_LEVEL_COUNT; i++) {
    thresholds.push(paddedMin + ((i + 0.5) / CONTOUR_LEVEL_COUNT) * paddedRange);
  }
  return thresholds;
}

// ── 颜色映射 ─────────────────────────────────────────

/**
 * 将势能值映射到「稳定 → 中性 → 混沌」色阶。
 * @param t 归一化势能 [0, 1]，0=最低(稳定)，1=最高(混沌)
 */
function semanticColor(t: number): THREE.Color {
  const stableColor = new THREE.Color(LYAPUNOV_STABLE);
  const neutralColor = new THREE.Color(LYAPUNOV_NEUTRAL);
  const chaoticColor = new THREE.Color(LYAPUNOV_CHAOTIC);
  const result = new THREE.Color();
  if (t < 0.5) {
    result.copy(stableColor).lerp(neutralColor, t * 2);
  } else {
    result.copy(neutralColor).lerp(chaoticColor, (t - 0.5) * 2);
  }
  return result;
}

// ── Canvas 绘制 ──────────────────────────────────────

/**
 * 在 OffscreenCanvas 上绘制所有等值线段。
 * 背景透明，等高线按层级着色，opacity 随层级递增。
 */
export function drawContoursToCanvas(
  canvas: OffscreenCanvas,
  allSegments: ContourSegment[][],
  thresholds: readonly number[],
  minValue: number,
  maxValue: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = TEXTURE_SIZE;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  /** 将逻辑坐标 (θ₁, θ₂) 映射到 Canvas 像素坐标 */
  function toCanvas(px: number, py: number): [number, number] {
    const cx = ((px - xMin) / xRange) * size;
    // Canvas y 轴向下，逻辑 y 轴向上 → 翻转
    const cy = ((yMax - py) / yRange) * size;
    return [cx, cy];
  }

  const valueRange = maxValue - minValue || 1;
  const opacityRange = CONTOUR_MAX_OPACITY - CONTOUR_MIN_OPACITY;

  for (let levelIdx = 0; levelIdx < allSegments.length; levelIdx++) {
    const segments = allSegments[levelIdx]!;
    if (segments.length === 0) continue;

    const threshold = thresholds[levelIdx]!;
    // 层级越深 (高势能)，opacity 越大
    const levelT = (threshold - minValue) / valueRange;
    const alpha = CONTOUR_MIN_OPACITY + levelT * opacityRange;
    const color = semanticColor(levelT);

    ctx.strokeStyle = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = CONTOUR_LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    for (const seg of segments) {
      const [cx1, cy1] = toCanvas(seg.x1, seg.y1);
      const [cx2, cy2] = toCanvas(seg.x2, seg.y2);
      ctx.moveTo(cx1, cy1);
      ctx.lineTo(cx2, cy2);
    }
    ctx.stroke();
  }
}

// ── 主入口: 生成 CanvasTexture ────────────────────────

/**
 * 将已计算的等值线段渲染到 CanvasTexture。
 *
 * @param allSegments 按阈值分组的等值线段
 * @param thresholds 等值线阈值列表
 * @param minValue 势能最小值
 * @param maxValue 势能最大值
 * @param xMin θ₁ 范围下限
 * @param xMax θ₁ 范围上限
 * @param yMin θ₂ 范围下限
 * @param yMax θ₂ 范围上限
 * @returns THREE.CanvasTexture
 */
export function createContourTexture(
  allSegments: ContourSegment[][],
  thresholds: readonly number[],
  minValue: number,
  maxValue: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): THREE.CanvasTexture {
  const canvas = new OffscreenCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
  drawContoursToCanvas(
    canvas,
    allSegments,
    thresholds,
    minValue,
    maxValue,
    xMin,
    xMax,
    yMin,
    yMax,
  );

  // runtime 支持 OffscreenCanvas，类型断言解决泛型差异
  const texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
