/** DebugPanel 工具函数和子组件 */

import { cn } from "@/shared/lib/cn";

const SPARKLINE_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values: number[]): string {
  if (values.length === 0) return "—";
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  return values.map((v) => { const idx = Math.floor(((v - min) / range) * (SPARKLINE_BLOCKS.length - 1)); return SPARKLINE_BLOCKS[Math.min(idx, SPARKLINE_BLOCKS.length - 1)]!; }).join("");
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

export function fpsColor(fps: number): string { return fps >= 55 ? "text-green-400" : fps >= 30 ? "text-yellow-400" : "text-red-400"; }
export function latencyColor(ms: number): string { return ms < 5 ? "text-green-400" : ms <= 16 ? "text-yellow-400" : "text-red-400"; }
export function errorCountColor(n: number): string { return n === 0 ? "text-green-400" : n <= 5 ? "text-yellow-400" : "text-red-400"; }

export function MetricRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-on-surface-variant">{label}</span><span className={cn("font-mono", valueClass)}>{value}</span></div>;
}

export function StatBox({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface rounded px-2 py-1.5"><div className="text-on-surface-variant text-[10px] uppercase">{label}</div><div className="text-on-surface font-mono text-xs">{value}</div></div>;
}
