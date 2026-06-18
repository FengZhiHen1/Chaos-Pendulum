import { useEffect, useRef, useState } from "react";
import type { DriftSample, ReversalMode } from "../../contracts";
import { REVERSAL_DEFAULTS } from "../../contracts";

// DESIGN.md token 色值（Canvas 2D 无法使用 Tailwind class，直接使用 token hex）
const COLOR_BG = "rgba(42, 45, 52, 0.92)";        // surface-container-high
const COLOR_TEXT = "#E8EAED";                       // on-surface
const COLOR_TEXT_MUTED = "#9BA0AA";                 // on-surface-variant
const COLOR_AXIS = "rgba(155, 160, 170, 0.35)";     // outline-variant
const COLOR_GRID = "rgba(155, 160, 170, 0.15)";     // outline-variant lighter
const COLOR_CURVE = "#4B9FFF";                      // primary
const COLOR_ALERT = "#FF3B3B";                      // separation-alert

interface DriftCurvePanelProps {
  driftHistory: readonly DriftSample[];
  maxReversalTime: number;
  mode: ReversalMode;
  visible: boolean;
  engineError: boolean;
}

/**
 * 时间反演漂移曲线 Canvas 2D 面板。
 *
 * 支持线性/对数 Y 轴切换，在数值反演模式下显示教学阈值虚线。
 */
export function DriftCurvePanel({
  driftHistory,
  maxReversalTime,
  mode,
  visible,
  engineError,
}: DriftCurvePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logScale, setLogScale] = useState(false);
  const W = 320;
  const H = 200;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    const pad = { top: 28, right: 14, bottom: 34, left: 48 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;

    // 空数据提示
    if (driftHistory.length < 2) {
      ctx.fillStyle = COLOR_TEXT_MUTED;
      ctx.font = "12px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("等待反演数据…", W / 2, H / 2);
      return;
    }

    const dataMax = Math.max(...driftHistory.map((d) => d.driftDistance));
    // 下限 1e-6 防止除零；乘 1.2 留 20% 顶部呼吸空间
    const maxDrift = Math.max(1e-6, dataMax) * 1.2;
    const maxTime = Math.max(1, maxReversalTime);

    const xS = (t: number) => pad.left + (t / maxTime) * pw;

    const yLinear = (d: number) => pad.top + ph - (d / maxDrift) * ph;
    const yLog = (d: number) => {
      if (d <= 0) return pad.top + ph;
      const logMax = Math.log10(maxDrift);
      const logMin = Math.log10(Math.max(1e-6, maxDrift * 1e-5));
      const logD = Math.log10(Math.max(d, 1e-6));
      const ratio = (logD - logMin) / (logMax - logMin);
      return pad.top + ph - Math.max(0, Math.min(1, ratio)) * ph;
    };
    const yS = logScale ? yLog : yLinear;

    // 坐标轴
    ctx.strokeStyle = COLOR_AXIS;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + ph);
    ctx.lineTo(pad.left + pw, pad.top + ph);
    ctx.stroke();

    // 教学阈值虚线（仅数值反演模式）
    if (mode === "numerical") {
      const thY = yS(REVERSAL_DEFAULTS.teachingThreshold);
      if (thY > pad.top && thY < pad.top + ph) {
        ctx.strokeStyle = COLOR_GRID;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, thY);
        ctx.lineTo(pad.left + pw, thY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLOR_TEXT_MUTED;
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.fillText("0.05", pad.left + pw - 26, thY - 4);
      }
    }

    // 轴标签
    ctx.fillStyle = COLOR_TEXT_MUTED;
    ctx.font = "10px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("反演时间 (s)", pad.left + pw / 2, H - 4);
    ctx.save();
    ctx.translate(12, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(logScale ? "相空间距离 (log)" : "相空间距离", 0, 0);
    ctx.restore();

    // 模式标题
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = "bold 11px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      mode === "exact" ? "精确反演 — 理论完全重合" : "数值反演 — 误差指数放大",
      pad.left + pw / 2,
      pad.top - 10,
    );

    // Y 轴刻度
    ctx.fillStyle = COLOR_TEXT_MUTED;
    ctx.font = "9px JetBrains Mono, monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const d = logScale
        ? Math.pow(
            10,
            Math.log10(Math.max(1e-6, maxDrift * 1e-5)) +
              ratio *
                (Math.log10(maxDrift) - Math.log10(Math.max(1e-6, maxDrift * 1e-5))),
          )
        : maxDrift * ratio;
      const y = yS(d);
      ctx.fillText(d < 0.01 ? d.toExponential(1) : d.toFixed(3), pad.left - 4, y + 3);
    }

    // 漂移曲线
    ctx.strokeStyle = COLOR_CURVE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < driftHistory.length; i++) {
      const d = driftHistory[i]!;
      const x = xS(d.reversalTime);
      const y = yS(d.driftDistance);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 发散标记
    if (engineError && driftHistory.length > 0) {
      const last = driftHistory[driftHistory.length - 1]!;
      const lx = xS(last.reversalTime);
      const ly = yS(last.driftDistance);
      ctx.fillStyle = COLOR_ALERT;
      ctx.font = "12px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✕", lx + 8, ly + 4);
    }
  }, [driftHistory, maxReversalTime, mode, logScale, engineError]);

  if (!visible) return null;

  return (
    <div
      className="absolute right-2 top-10 z-20 rounded-lg overflow-hidden border border-outline-variant/20 shadow-card-hover"
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <button
        type="button"
        onClick={() => setLogScale((v) => !v)}
        className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] bg-surface-container-low text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {logScale ? "线性" : "对数"}
      </button>
    </div>
  );
}
