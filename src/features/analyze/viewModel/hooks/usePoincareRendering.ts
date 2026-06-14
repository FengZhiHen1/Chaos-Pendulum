/**
 * 模块: analyze.viewModel.hooks.usePoincareRendering
 * 职责: 庞加莱截面 Canvas 渲染逻辑——离屏 Canvas、增量绘制、Y 域自适应、定时全量重绘。
 * 边界:
 *   - 内部订阅 Zusand store 的 poincareSection.points/baseline/pointCount
 *   - 不返回任何值，纯副作用驱动
 */

import { useCallback, useEffect, useRef } from "react";
import { useAnalyzeStore } from "../../store";
import type { PoincarePoint } from "@/shared/domain/valueObjects";
import { TERTIARY } from "../../view/components/colorTokens";
import {
  X_MIN,
  X_MAX,
  Y_MIN_INITIAL,
  Y_MAX_INITIAL,
  Y_CLAMP,
  mapPoint,
  expandDomain,
  type YDomain,
} from "../../view/components/PoincareSectionUtils";

const FULL_REDRAW_INTERVAL_MS = 2000;
const POINT_RADIUS = 1.5;
const BASELINE_COLOR = TERTIARY;
const CURRENT_COLOR_PREFIX = "rgba(75, 159, 255, ";

interface UsePoincareRenderingInput {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  size: { width: number; height: number; ready: boolean };
  clampWarning: string | null;
  setClampWarning: React.Dispatch<React.SetStateAction<string | null>>;
}

export function usePoincareRendering({
  canvasRef,
  size,
  clampWarning,
  setClampWarning,
}: UsePoincareRenderingInput) {
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const yDomainRef = useRef<YDomain>({ min: Y_MIN_INITIAL, max: Y_MAX_INITIAL });
  const pendingPointsRef = useRef<PoincarePoint[]>([]);
  const rafRef = useRef<number>(0);
  const fullRedrawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPointCountRef = useRef(0);

  // 防止闭包过期：ref 同步最新 store 值
  const points = useAnalyzeStore((s) => s.poincareSection.points);
  const baseline = useAnalyzeStore((s) => s.poincareSection.baseline);
  const pointCount = useAnalyzeStore((s) => s.poincareSection.pointCount);

  const pointsRef = useRef<PoincarePoint[]>(points);
  const baselineRef = useRef<PoincarePoint[] | null>(baseline);
  pointsRef.current = points;
  baselineRef.current = baseline;

  // ── 全量重绘 ─────────────────────────────────────
  const requestFullRedraw = useCallback(() => {
    const off = offscreenRef.current;
    const canvas = canvasRef.current;
    if (!off || !canvas || !size.ready) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = off.getContext("2d");
    const visibleCtx = canvas.getContext("2d");
    if (!ctx || !visibleCtx) return;

    const w = size.width;
    const h = size.height;

    ctx.clearRect(0, 0, off.width, off.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const xDomain: [number, number] = [X_MIN, X_MAX];
    const yDomain = yDomainRef.current;
    const currentPoints = pointsRef.current;
    const currentBaseline = baselineRef.current;

    // 绘制 baseline
    if (currentBaseline) {
      ctx.fillStyle = BASELINE_COLOR;
      for (const pt of currentBaseline) {
        const [x, y] = mapPoint(pt, xDomain, yDomain, w, h);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.beginPath();
        ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 绘制 current points（带 alpha aging）
    const total = currentPoints.length;
    for (let i = 0; i < total; i++) {
      const pt = currentPoints[i]!;
      const alpha = 1.0 - 0.6 * (i / total);
      ctx.fillStyle = `${CURRENT_COLOR_PREFIX}${alpha})`;
      const [x, y] = mapPoint(pt, xDomain, yDomain, w, h);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.beginPath();
      ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 同步到可见 canvas
    visibleCtx.clearRect(0, 0, canvas.width, canvas.height);
    visibleCtx.drawImage(off, 0, 0);
  }, [canvasRef, size.width, size.height, size.ready]);

  // ── 增量绘制（只画新点）──────────────────────────
  const drawIncremental = useCallback(
    (newPoints: PoincarePoint[]) => {
      const off = offscreenRef.current;
      const canvas = canvasRef.current;
      if (!off || !canvas || !size.ready) return;

      const dpr = window.devicePixelRatio || 1;
      const ctx = off.getContext("2d");
      const visibleCtx = canvas.getContext("2d");
      if (!ctx || !visibleCtx) return;

      const w = size.width;
      const h = size.height;
      const xDomain: [number, number] = [X_MIN, X_MAX];
      const yDomain = yDomainRef.current;
      const total = pointsRef.current.length;

      ctx.save();
      ctx.scale(dpr, dpr);

      for (let i = 0; i < newPoints.length; i++) {
        const pt = newPoints[i]!;
        const idx = total - newPoints.length + i;
        const alpha = 1.0 - 0.6 * (idx / total);
        ctx.fillStyle = `${CURRENT_COLOR_PREFIX}${alpha})`;
        const [x, y] = mapPoint(pt, xDomain, yDomain, w, h);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.beginPath();
        ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // 同步到可见 canvas
      visibleCtx.clearRect(0, 0, canvas.width, canvas.height);
      visibleCtx.drawImage(off, 0, 0);
    },
    [canvasRef, size.width, size.height, size.ready],
  );

  // ── 初始化 OffscreenCanvas ───────────────────────
  useEffect(() => {
    if (!size.ready || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement("canvas");
    off.width = Math.round(size.width * dpr);
    off.height = Math.round(size.height * dpr);
    offscreenRef.current = off;

    requestFullRedraw();

    return () => {
      offscreenRef.current = null;
    };
  }, [size.width, size.height, size.ready, requestFullRedraw]);

  // ── 监听 store 点数变化，触发增量绘制 ────────────
  useEffect(() => {
    if (pointCount === lastPointCountRef.current) return;

    const newCount = pointCount;
    const oldCount = lastPointCountRef.current;
    lastPointCountRef.current = newCount;

    if (newCount < oldCount) {
      // 点数减少（截断或清空），全量重绘
      requestFullRedraw();
      return;
    }

    // 提取新增点
    const newPoints = points.slice(oldCount);
    if (newPoints.length === 0) return;

    // 检查并扩展 Y 轴
    let domainChanged = false;
    let clamped = false;
    for (const pt of newPoints) {
      const expanded = expandDomain(pt.omega2, yDomainRef.current);
      if (expanded) {
        yDomainRef.current = expanded;
        domainChanged = true;
      }
      if (pt.omega2 <= -Y_CLAMP || pt.omega2 >= Y_CLAMP) {
        clamped = true;
      }
    }

    if (clamped && !clampWarning) {
      setClampWarning(`ω₂ 已超出安全范围 (±${Y_CLAMP})，Y 轴已截断`);
      setTimeout(() => setClampWarning(null), 3000);
    }

    if (domainChanged) {
      requestFullRedraw();
    } else {
      pendingPointsRef.current.push(...newPoints);
      if (rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const pts = pendingPointsRef.current;
          pendingPointsRef.current = [];
          drawIncremental(pts);
        });
      }
    }
  }, [pointCount, points, clampWarning, requestFullRedraw, drawIncremental, setClampWarning]);

  // ── 2 秒全量重绘定时器 ───────────────────────────
  useEffect(() => {
    fullRedrawTimerRef.current = setInterval(() => {
      requestFullRedraw();
    }, FULL_REDRAW_INTERVAL_MS);

    return () => {
      if (fullRedrawTimerRef.current) {
        clearInterval(fullRedrawTimerRef.current);
        fullRedrawTimerRef.current = null;
      }
    };
  }, [requestFullRedraw]);

  // ── 清理 RAF ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);
}
