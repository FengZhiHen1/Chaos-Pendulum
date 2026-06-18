/**
 * 模块: analyze.view.EnergyLandscapeMarchingSquares
 * 职责: Marching Squares 等值线提取算法——将势能标量网格转为等值线段集合。
 * 边界:
 *   - 纯算法，不依赖 Canvas / React / Three.js
 *   - 输入: Float64Array 网格 + 阈值列表 + 坐标范围
 *   - 输出: ContourSegment[][]
 */

// ── Marching Squares 查找表 ──────────────────────────

/**
 * 正方形单元 4 角点坐标偏移 (col, row):
 *   0: 左下 (BL), 1: 右下 (BR), 2: 右上 (TR), 3: 左上 (TL)
 */
const CORNER_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * 4 条边的端点角点索引:
 *   边 0: BL→BR (底), 边 1: BR→TR (右), 边 2: TL→TR (顶), 边 3: BL→TL (左)
 */
const EDGE_CORNERS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [3, 2],
  [0, 3],
];

/**
 * 16 种 Marching Squares 情况的线段定义 (边索引对)。
 * 每个元素是 [[edgeA, edgeB], ...] 形式的线段数组。
 * 情况 5 (0101) 和 10 (1010) 为鞍点歧义，需用中心值裁决。
 */
const CASE_SEGMENTS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  0: [],
  1: [[0, 3]],
  2: [[0, 1]],
  3: [[1, 3]],
  4: [[1, 2]],
  5: [], // 歧义 → 运行时裁决
  6: [[0, 2]],
  7: [[2, 3]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [], // 歧义 → 运行时裁决
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[0, 3]],
  15: [],
};

/** 情况 5 的两组可能连接: [0↔1, 2↔3] vs [0↔3, 1↔2] */
const SADDLE_VARIANTS = [
  [
    [0, 1], [2, 3],
  ],
  [
    [0, 3], [1, 2],
  ],
] as const;

// ── 类型 ─────────────────────────────────────────────

export interface ContourSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

// ── 算法 ─────────────────────────────────────────────

/**
 * 线性插值计算等值线在网格边上的穿越点。
 */
function interpolateEdge(
  grid: Float64Array,
  cols: number,
  ix: number,
  iy: number,
  edgeIdx: number,
  threshold: number,
  xMin: number,
  yMin: number,
  cellW: number,
  cellH: number,
): [number, number] {
  const [c0, c1] = EDGE_CORNERS[edgeIdx]!;
  const [dx0, dy0] = CORNER_OFFSETS[c0]!;
  const [dx1, dy1] = CORNER_OFFSETS[c1]!;
  const v0 = grid[(iy + dy0) * cols + (ix + dx0)]!;
  const v1 = grid[(iy + dy1) * cols + (ix + dx1)]!;
  const denominator = v1 - v0;
  // 保护性回退: 若分母为零，取中点
  const t = Math.abs(denominator) < 1e-12 ? 0.5 : (threshold - v0) / denominator;
  const px = xMin + (ix + dx0 + t * (dx1 - dx0)) * cellW;
  const py = yMin + (iy + dy0 + t * (dy1 - dy0)) * cellH;
  return [px, py];
}

/**
 * Marching Squares 等值线提取。
 * 对每个阈值，在标量网格上追踪等值线段。
 * 返回按阈值分组的线段数组（索引对应 thresholds）。
 */
export function extractContours(
  grid: Float64Array,
  cols: number,
  rows: number,
  thresholds: readonly number[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): ContourSegment[][] {
  const cellW = (xMax - xMin) / (cols - 1);
  const cellH = (yMax - yMin) / (rows - 1);
  const results: ContourSegment[][] = thresholds.map(() => []);

  for (let iy = 0; iy < rows - 1; iy++) {
    for (let ix = 0; ix < cols - 1; ix++) {
      // 读取 4 角点值
      const vBl = grid[iy * cols + ix]!;
      const vBr = grid[iy * cols + ix + 1]!;
      const vTr = grid[(iy + 1) * cols + ix + 1]!;
      const vTl = grid[(iy + 1) * cols + ix]!;

      thresholds.forEach((threshold, levelIdx) => {
        // 构建 4 位索引
        let caseIdx = 0;
        if (vBl >= threshold) caseIdx |= 1;
        if (vBr >= threshold) caseIdx |= 2;
        if (vTr >= threshold) caseIdx |= 4;
        if (vTl >= threshold) caseIdx |= 8;

        const rawSegments = CASE_SEGMENTS[caseIdx];

        // 正常情况：查表命中且有线段 → 直接绘制
        if (rawSegments !== undefined && rawSegments.length > 0) {
          for (const [ea, eb] of rawSegments) {
            const [x1, y1] = interpolateEdge(
              grid, cols, ix, iy, ea, threshold, xMin, yMin, cellW, cellH,
            );
            const [x2, y2] = interpolateEdge(
              grid, cols, ix, iy, eb, threshold, xMin, yMin, cellW, cellH,
            );
            results[levelIdx]!.push({ x1, y1, x2, y2 });
          }
          return;
        }

        // 全内 (15) 或全外 (0)：无穿越
        if (caseIdx === 0 || caseIdx === 15) return;

        // 鞍点歧义 (5: 0101, 10: 1010)：用中心值裁决连接方式
        if (caseIdx === 5 || caseIdx === 10) {
          const centerValue = (vBl + vBr + vTr + vTl) / 4;
          const resolved = centerValue >= threshold ? SADDLE_VARIANTS[0] : SADDLE_VARIANTS[1];
          for (const [ea, eb] of resolved) {
            const [x1, y1] = interpolateEdge(
              grid, cols, ix, iy, ea, threshold, xMin, yMin, cellW, cellH,
            );
            const [x2, y2] = interpolateEdge(
              grid, cols, ix, iy, eb, threshold, xMin, yMin, cellW, cellH,
            );
            results[levelIdx]!.push({ x1, y1, x2, y2 });
          }
        }
      });
    }
  }

  return results;
}
