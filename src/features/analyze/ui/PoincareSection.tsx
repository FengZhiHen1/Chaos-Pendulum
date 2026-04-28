import { useRef, useEffect, useCallback, useState } from "react";
import { useAnalyzeStore } from "../store";
import { useContainerSize } from "@/shared/hooks/useContainerSize";
import type { PoincarePoint } from "@/shared/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

const X_MIN = -Math.PI;
const X_MAX = Math.PI;
const Y_MIN_INITIAL = -10;
const Y_MAX_INITIAL = 10;
const Y_CLAMP = 50;
const Y_EXPAND_MARGIN = 0.2; // 20%
const FULL_REDRAW_INTERVAL_MS = 2000;
const POINT_RADIUS = 1.5;
const BASELINE_COLOR = "#e76f51";
const CURRENT_COLOR = "rgba(0, 180, 216, ";

interface YDomain {
  min: number;
  max: number;
}

function mapPoint(
  pt: PoincarePoint,
  xDomain: [number, number],
  yDomain: YDomain,
  width: number,
  height: number,
): [number, number] {
  const x = ((pt.theta2 - xDomain[0]) / (xDomain[1] - xDomain[0])) * width;
  const y = height - ((pt.omega2 - yDomain.min) / (yDomain.max - yDomain.min)) * height;
  return [x, y];
}

function expandDomain(value: number, domain: YDomain): YDomain | null {
  if (value >= domain.min && value <= domain.max) return null;

  let newMin = domain.min;
  let newMax = domain.max;

  if (value < domain.min) {
    const range = domain.max - domain.min;
    newMin = value - range * Y_EXPAND_MARGIN;
  }
  if (value > domain.max) {
    const range = domain.max - domain.min;
    newMax = value + range * Y_EXPAND_MARGIN;
  }

  // 硬限制
  if (newMin < -Y_CLAMP) newMin = -Y_CLAMP;
  if (newMax > Y_CLAMP) newMax = Y_CLAMP;

  return { min: newMin, max: newMax };
}

export function PoincareSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const yDomainRef = useRef<YDomain>({ min: Y_MIN_INITIAL, max: Y_MAX_INITIAL });
  const pendingPointsRef = useRef<PoincarePoint[]>([]);
  const rafRef = useRef<number>(0);
  const fullRedrawTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPointCountRef = useRef(0);
  const pointsRef = useRef<PoincarePoint[]>([]);
  const baselineRef = useRef<PoincarePoint[] | null>(null);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingCondition, setPendingCondition] = useState<{
    variable: "theta1" | "theta2" | "omega1" | "omega2";
    targetValue: number;
    direction: "positive" | "negative" | "both";
  } | null>(null);
  const [clampWarning, setClampWarning] = useState<string | null>(null);

  const size = useContainerSize({ ref: containerRef, debounceMs: 150 });

  const poincare = useAnalyzeStore((s) => s.poincareSection);
  const setCondition = useAnalyzeStore((s) => s.poincareSection.setCondition);
  const clearPoints = useAnalyzeStore((s) => s.poincareSection.clearPoints);
  const saveBaseline = useAnalyzeStore((s) => s.poincareSection.saveBaseline);
  const clearBaseline = useAnalyzeStore((s) => s.poincareSection.clearBaseline);
  const setIsActive = useCallback(
    (active: boolean) =>
      useAnalyzeStore.setState((s) => ({
        poincareSection: { ...s.poincareSection, isActive: active },
      })),
    [],
  );

  // 同步 ref 到最新 store 值（避免闭包 stale）
  useEffect(() => {
    pointsRef.current = poincare.points;
    baselineRef.current = poincare.baseline;
  });

  // 全量重绘
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
    const points = pointsRef.current;
    const baseline = baselineRef.current;

    // 绘制 baseline
    if (baseline) {
      ctx.fillStyle = BASELINE_COLOR;
      for (const pt of baseline) {
        const [x, y] = mapPoint(pt, xDomain, yDomain, w, h);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.beginPath();
        ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 绘制 current points（带 alpha aging）
    const total = points.length;
    for (let i = 0; i < total; i++) {
      const pt = points[i]!;
      const alpha = 1.0 - 0.6 * (i / total);
      ctx.fillStyle = `${CURRENT_COLOR}${alpha})`;
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
  }, [size.width, size.height, size.ready]);

  // 增量绘制（只画新点）
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
        ctx.fillStyle = `${CURRENT_COLOR}${alpha})`;
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
    [size.width, size.height, size.ready],
  );

  // 初始化 OffscreenCanvas
  useEffect(() => {
    if (!size.ready || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement("canvas");
    off.width = Math.round(size.width * dpr);
    off.height = Math.round(size.height * dpr);
    offscreenRef.current = off;

    // 初始全量绘制
    requestFullRedraw();

    return () => {
      offscreenRef.current = null;
    };
  }, [size.width, size.height, size.ready, requestFullRedraw]);

  // 监听 store 点数变化，触发增量绘制
  useEffect(() => {
    if (poincare.pointCount === lastPointCountRef.current) return;

    const newCount = poincare.pointCount;
    const oldCount = lastPointCountRef.current;
    lastPointCountRef.current = newCount;

    if (newCount < oldCount) {
      // 点数减少（截断或清空），需要全量重绘
      requestFullRedraw();
      return;
    }

    // 提取新增点
    const newPoints = poincare.points.slice(oldCount);
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
      // Y 轴扩展需要全量重绘
      requestFullRedraw();
    } else {
      // 增量绘制
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
  }, [poincare.pointCount, poincare.points, clampWarning, requestFullRedraw, drawIncremental]);

  // 2 秒全量重绘定时器
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

  // 清理 RAF
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  const handleToggleActive = () => {
    setIsActive(!poincare.isActive);
  };

  const handleConditionChange = (
    key: "variable" | "targetValue" | "direction",
    value: string | number,
  ) => {
    const next = {
      ...poincare.condition,
      [key]: value,
    } as typeof poincare.condition;

    if (poincare.points.length > 0) {
      setPendingCondition(next);
      setShowConfirmDialog(true);
    } else {
      setCondition(next);
    }
  };

  const confirmConditionChange = () => {
    if (pendingCondition) {
      setCondition(pendingCondition);
      clearPoints();
      setPendingCondition(null);
    }
    setShowConfirmDialog(false);
  };

  const cancelConditionChange = () => {
    setPendingCondition(null);
    setShowConfirmDialog(false);
  };

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  return (
    <div className="h-full w-full flex flex-col">
      {/* 控制栏 */}
      <div className="flex flex-wrap items-center gap-4 px-2 py-2 border-b border-lab-border/30">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleActive}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              poincare.isActive ? "bg-primary" : "bg-input"
            }`}
            role="switch"
            aria-checked={poincare.isActive}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-lg transition-transform ${
                poincare.isActive ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <Label className="text-sm cursor-pointer" onClick={handleToggleActive}>
            采集
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">变量</Label>
          <Select
            value={poincare.condition.variable}
            onValueChange={(v) => handleConditionChange("variable", v)}
            disabled={poincare.isActive}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="theta1">θ₁</SelectItem>
              <SelectItem value="omega1">ω₁</SelectItem>
              <SelectItem value="theta2">θ₂</SelectItem>
              <SelectItem value="omega2">ω₂</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">目标值</Label>
          <Input
            type="number"
            value={poincare.condition.targetValue}
            onChange={(e) => handleConditionChange("targetValue", parseFloat(e.target.value))}
            className="w-20 h-8 text-xs"
            disabled={poincare.isActive}
            step={0.1}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">方向</Label>
          <Select
            value={poincare.condition.direction}
            onValueChange={(v) => handleConditionChange("direction", v)}
            disabled={poincare.isActive}
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="positive">正向</SelectItem>
              <SelectItem value="negative">反向</SelectItem>
              <SelectItem value="both">双向</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">
            点数: {poincare.pointCount}
            {poincare.baseline ? ` + 基线: ${poincare.baseline.length}` : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={clearPoints}
            disabled={poincare.points.length === 0}
          >
            清空
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={saveBaseline}
            disabled={poincare.points.length === 0}
          >
            保存基线
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={clearBaseline}
            disabled={!poincare.baseline}
          >
            清除基线
          </Button>
        </div>
      </div>

      {/* 警告提示 */}
      {clampWarning && (
        <div className="px-2 py-1 bg-amber-100 text-amber-800 text-xs">
          {clampWarning}
        </div>
      )}

      {/* Canvas 容器 */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {size.ready && (
          <canvas
            ref={canvasRef}
            width={Math.round(size.width * dpr)}
            height={Math.round(size.height * dpr)}
            style={{
              width: size.width,
              height: size.height,
              display: "block",
            }}
            className="absolute inset-0"
          />
        )}

        {/* 坐标轴标签 */}
        {size.ready && (
          <>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground pointer-events-none">
              θ₂ (rad)
            </div>
            <div
              className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg) translateY(50%)" }}
            >
              ω₂ (rad/s)
            </div>
          </>
        )}
      </div>

      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border border-border shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">切换截面条件</h3>
            <p className="text-sm text-muted-foreground mb-4">
              当前已有 {poincare.points.length} 个采集点，切换条件将清空所有数据。是否继续？
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelConditionChange}>
                取消
              </Button>
              <Button onClick={confirmConditionChange}>确认</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
