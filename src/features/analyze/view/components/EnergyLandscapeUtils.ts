/**
 * 模块: analyze.view.EnergyLandscapeUtils
 * 职责: 能量景观地形图纯函数工具——势能采样 + 等高线纹理生成管线。
 *       内部委托 Marching Squares 算法（EnergyLandscapeMarchingSquares.ts）
 *       和 Canvas 绘制（EnergyLandscapeContourCanvas.ts）。
 * 边界:
 *   - 纯函数，无副作用（除 CanvasTexture 创建）
 *   - 不依赖 React 或 Zustand Store
 */

import * as THREE from "three";
import type { PendulumParams } from "@/shared/domain/valueObjects";
import type { IEnergyLandscapeConfig } from "../../contracts";
import { extractContours } from "./EnergyLandscapeMarchingSquares";
import {
  computeThresholds,
  createContourTexture,
} from "./EnergyLandscapeContourCanvas";

/** 势能范围下限，避免零除 */
const MIN_POTENTIAL_RANGE = 0.001;

// ── 势能计算 ─────────────────────────────────────────

/**
 * 计算单点重力势能。
 * V(θ₁,θ₂) = -m₁gL₁cos(θ₁) - m₂g(L₁cos(θ₁) + L₂cos(θ₂))
 */
export function computePotential(
  theta1: number,
  theta2: number,
  m1: number,
  m2: number,
  L1: number,
  L2: number,
  g: number,
): number {
  return (
    -m1 * g * L1 * Math.cos(theta1) -
    m2 * g * (L1 * Math.cos(theta1) + L2 * Math.cos(theta2))
  );
}

// ── 势能网格采样 ─────────────────────────────────────

export interface PotentialGrid {
  /** row-major 一维数组，长度 (cols+1)×(rows+1) */
  readonly data: Float64Array;
  readonly cols: number;
  readonly rows: number;
  readonly minValue: number;
  readonly maxValue: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

/**
 * 在解析度 (resolution+1)×(resolution+1) 的网格上采样势能值。
 * 返回包含元数据的 PotentialGrid 对象。
 */
export function samplePotentialGrid(
  params: PendulumParams,
  config: IEnergyLandscapeConfig,
): PotentialGrid {
  const { resolution, thetaRange } = config;
  const [tMin, tMax] = thetaRange;
  const cols = resolution + 1;
  const rows = resolution + 1;
  const step = (tMax - tMin) / resolution;
  const data = new Float64Array(cols * rows);
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let iy = 0; iy < rows; iy++) {
    const theta2 = tMin + iy * step;
    for (let ix = 0; ix < cols; ix++) {
      const theta1 = tMin + ix * step;
      const v = computePotential(
        theta1, theta2,
        params.m1, params.m2, params.L1, params.L2, params.g,
      );
      const idx = iy * cols + ix;
      data[idx] = v;
      if (v < minValue) minValue = v;
      if (v > maxValue) maxValue = v;
    }
  }

  return { data, cols, rows, minValue, maxValue, xMin: tMin, xMax: tMax, yMin: tMin, yMax: tMax };
}

// ── 主入口: 生成等高线 CanvasTexture ──────────────────

/**
 * 生成能量景观等高线的 CanvasTexture。
 *
 * 管线: 势能网格采样 → 等距阈值 → Marching Squares 提取等值线
 *       → OffscreenCanvas 绘制 → THREE.CanvasTexture
 *
 * @param params 当前摆参数 (m₁, m₂, L₁, L₂, g)
 * @param config 能量景观配置 (resolution, thetaRange)
 * @returns CanvasTexture，或 null（势能范围为零时无法生成等高线）
 */
export function generateContourTexture(
  params: PendulumParams,
  config: IEnergyLandscapeConfig,
): THREE.CanvasTexture | null {
  // 1. 势能网格采样
  const pg = samplePotentialGrid(params, config);
  const valueRange = pg.maxValue - pg.minValue;
  if (valueRange < MIN_POTENTIAL_RANGE) return null;

  // 2. 计算等距阈值
  const thresholds = computeThresholds(pg.minValue, pg.maxValue);
  if (thresholds.length === 0) return null;

  // 3. Marching Squares 提取等值线
  const allSegments = extractContours(
    pg.data, pg.cols, pg.rows, thresholds,
    pg.xMin, pg.xMax, pg.yMin, pg.yMax,
  );

  // 4–5. Canvas 绘制 + 生成 CanvasTexture
  return createContourTexture(
    allSegments, thresholds,
    pg.minValue, pg.maxValue,
    pg.xMin, pg.xMax, pg.yMin, pg.yMax,
  );
}
