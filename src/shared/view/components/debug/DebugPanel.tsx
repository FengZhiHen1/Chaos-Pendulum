import { useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/shared/lib/cn";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/view/components/ui/tabs";
import { Button } from "@/shared/view/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import { Bug, X, Copy, Trash2, Activity, AlertTriangle, Clock } from "lucide-react";

type TabValue = "overview" | "errors" | "performance";

const SPARKLINE_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function sparkline(values: number[]): string {
  if (values.length === 0) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const ratio = (v - min) / range;
      const idx = Math.floor(ratio * (SPARKLINE_BLOCKS.length - 1));
      return SPARKLINE_BLOCKS[Math.min(idx, SPARKLINE_BLOCKS.length - 1)];
    })
    .join("");
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function fpsColor(fps: number): string {
  if (fps >= 55) return "text-green-400";
  if (fps >= 30) return "text-yellow-400";
  return "text-red-400";
}

function latencyColor(ms: number): string {
  if (ms < 5) return "text-green-400";
  if (ms <= 16) return "text-yellow-400";
  return "text-red-400";
}

function errorCountColor(n: number): string {
  if (n === 0) return "text-green-400";
  if (n <= 5) return "text-yellow-400";
  return "text-red-400";
}

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  const debugInfo = useAppStore((s) => s.debugInfo);
  const activeMode = useAppStore((s) => s.activeMode);
  const deviceType = useAppStore((s) => s.deviceType);
  const updateDebugInfo = useAppStore((s) => s.updateDebugInfo);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleClearErrors = useCallback(() => {
    updateDebugInfo({ errors: [] });
  }, [updateDebugInfo]);

  const handleCopyErrors = useCallback(async () => {
    const text = debugInfo.errors.join("\n");
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* 静默降级 */
      }
    }
  }, [debugInfo.errors]);

  // Worker 延迟统计
  const latencyStats = useMemo(() => {
    const arr = [...debugInfo.workerLatencyMs].sort((a, b) => a - b);
    return {
      p50: percentile(arr, 50),
      p95: percentile(arr, 95),
      p99: percentile(arr, 99),
      max: arr.length > 0 ? arr[arr.length - 1] : 0,
      avg: arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
    };
  }, [debugInfo.workerLatencyMs]);

  const avgLatency = latencyStats.avg;
  const errorCount = debugInfo.errors.length;

  // Pyodide 状态文本
  const pyodideText =
    debugInfo.pyodideLoadPct === -1
      ? "error"
      : debugInfo.pyodideLoadPct === 100
        ? "ready"
        : debugInfo.pyodideLoadPct === 0
          ? "idle"
          : `${debugInfo.pyodideLoadPct}%`;

  return (
    <>
      {/* 遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 面板 */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-[400px] max-w-[90vw] bg-surface-container-low border-l border-white/5 shadow-2xl transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 text-on-surface">
            <Bug className="w-4 h-4" />
            <span className="text-sm font-medium">调试面板</span>
          </div>
          <Button
            variant="tertiary"
            size="icon"
            className="h-7 w-7 text-on-surface-variant hover:text-on-surface"
            onClick={() => setOpen(false)}
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">
              <Activity className="w-3 h-3 mr-1" />
              概览
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex-1">
              <AlertTriangle className="w-3 h-3 mr-1" />
              错误日志
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex-1">
              <Clock className="w-3 h-3 mr-1" />
              性能
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: 概览 */}
          <TabsContent value="overview" className="mt-4 space-y-3">
            <MetricRow label="FPS" value={`${debugInfo.fps.toFixed(1)} fps`} valueClass={fpsColor(debugInfo.fps)} />
            <MetricRow
              label="Worker 延迟"
              value={`${avgLatency.toFixed(1)} ms`}
              valueClass={latencyColor(avgLatency)}
            />
            <MetricRow
              label="Pyodide"
              value={pyodideText}
              valueClass={debugInfo.pyodideLoadPct === -1 ? "text-red-400" : "text-green-400"}
            />
            <MetricRow
              label="未捕获异常"
              value={String(errorCount)}
              valueClass={errorCountColor(errorCount)}
            />
            <MetricRow label="当前模式" value={activeMode} valueClass="text-on-surface-variant" />
            <MetricRow label="设备类型" value={deviceType} valueClass="text-on-surface-variant" />
          </TabsContent>

          {/* Tab 2: 错误日志 */}
          <TabsContent value="errors" className="mt-4">
            <div className="flex gap-2 mb-3">
              <Button variant="secondary" size="sm" className="text-xs" onClick={handleClearErrors}>
                <Trash2 className="w-3 h-3 mr-1" />
                清空日志
              </Button>
              <Button variant="secondary" size="sm" className="text-xs" onClick={handleCopyErrors}>
                <Copy className="w-3 h-3 mr-1" />
                复制全部
              </Button>
            </div>
            <div className="h-[calc(100vh-220px)] overflow-y-auto space-y-1 pr-1">
              {debugInfo.errors.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-4 text-center">暂无错误</p>
              ) : (
                debugInfo.errors.map((err, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-red-300 bg-red-900/20 rounded px-2 py-1.5 break-all"
                  >
                    {err}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Tab 3: 性能 */}
          <TabsContent value="performance" className="mt-4 space-y-4">
            {/* Worker 耗时分布 */}
            <div>
              <h4 className="text-xs font-medium text-on-surface mb-2">
                Worker 耗时分布（最近 {debugInfo.workerLatencyMs.length} 次）
              </h4>
              {debugInfo.workerLatencyMs.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-2">暂无性能数据</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <StatBox label="p50" value={`${latencyStats.p50.toFixed(1)}ms`} />
                  <StatBox label="p95" value={`${latencyStats.p95.toFixed(1)}ms`} />
                  <StatBox label="p99" value={`${latencyStats.p99.toFixed(1)}ms`} />
                  <StatBox label="max" value={`${(latencyStats.max ?? 0).toFixed(1)}ms`} />
                </div>
              )}
            </div>

            {/* FPS 时间线 */}
            <div>
              <h4 className="text-xs font-medium text-on-surface mb-2">FPS 时间线（最近 10s）</h4>
              {debugInfo.fpsHistory.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-2">暂无数据</p>
              ) : (
                <div className="font-mono text-xs text-green-400 leading-tight">
                  {sparkline(debugInfo.fpsHistory)}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span className={cn("font-mono", valueClass)}>{value}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded px-2 py-1.5">
      <div className="text-on-surface-variant text-[10px] uppercase">{label}</div>
      <div className="text-on-surface font-mono text-xs">{value}</div>
    </div>
  );
}
