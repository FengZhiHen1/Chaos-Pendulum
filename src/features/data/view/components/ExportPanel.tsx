/**
 * ExportPanel — 数据导出面板。
 *
 * 格式选择器 + CSV/JSON/PNG 导出按钮 + 分辨率滑块。
 * 浏览器不兼容时显示降级警告。
 *
 * 边界:
 *   - 依赖: useExportViewModel (ViewModel Hook)
 * 禁止: import application/domain/infrastructure
 */

import { ExportPanelProps } from "../contracts/ExportPanel.contract";
import type { ExportFormat } from "../../contracts";

/** 支持的导出格式及其标签 */
const FORMAT_OPTIONS: { value: ExportFormat; label: string; desc: string }[] = [
  { value: "csv", label: "CSV", desc: "14 字段时序数据" },
  { value: "json", label: "JSON", desc: "场景文件，可分享复现" },
  { value: "png", label: "PNG", desc: "截图，最高 4K 分辨率" },
];

/** 分辨率选项 */
const RESOLUTION_OPTIONS = [1, 2, 4] as const;

export function ExportPanel({ viewModel }: ExportPanelProps) {
  const {
    selectedFormat,
    isExporting,
    isComplete,
    isBrowserSupported,
    error,
    setFormat,
    reset,
  } = viewModel;

  const hasError = error !== null;

  if (!isBrowserSupported) {
    return (
      <div className="rounded-lg bg-surface-container-low p-6">
        <p className="text-on-surface-variant text-sm text-center">
          当前浏览器不支持 Blob/URL API——无法导出文件。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-surface-container-low p-5 space-y-5">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <h2 className="text-on-surface font-semibold text-sm">导出数据</h2>
        {isComplete && (
          <span className="text-xs text-primary animate-in fade-in">
            ✓ 导出完成
          </span>
        )}
      </div>

      {/* 格式选择器 */}
      <div className="grid grid-cols-3 gap-2">
        {FORMAT_OPTIONS.map((opt) => {
          const isSelected = selectedFormat === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              disabled={isExporting}
              className={`
                rounded-lg px-3 py-3 text-center transition-all duration-150
                ${isSelected
                  ? "bg-primary-container text-primary ring-1 ring-primary/40"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                }
                disabled:opacity-50
              `}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className="block text-xs mt-0.5 opacity-70">{opt.desc}</span>
            </button>
          );
        })}
      </div>

      {/* PNG 分辨率选择器 */}
      {selectedFormat === "png" && (
        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs">分辨率倍数</label>
          <div className="flex gap-2">
            {RESOLUTION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isExporting}
                className="flex-1 rounded-md bg-surface-container px-3 py-2 text-xs
                           text-on-surface-variant hover:bg-surface-container-high
                           transition-colors"
              >
                {r}x {r === 4 ? "(4K)" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {hasError && (
        <div className="rounded-md bg-red-900/20 px-3 py-2 text-xs text-red-300">
          {error.message}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={isExporting}
          onClick={() => {/* 由父组件 DataPage 注入具体导出逻辑 */}}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold
                     text-on-surface transition-all hover:bg-primary-hover
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? "导出中…" : `导出 ${selectedFormat.toUpperCase()}`}
        </button>
        {isComplete && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-surface-container px-3 py-2.5 text-sm
                       text-on-surface-variant hover:text-on-surface transition-colors"
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}
