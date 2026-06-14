/**
 * useExportViewModel — 数据导出功能的跨介质 UI 状态管理。
 *
 * 封装 ExportDataUseCase，管理导出状态（格式选择/配置/进度/错误）。
 *
 * 依赖方向:
 *   - 可以依赖: ../../application/useCases/、../../contracts/
 *   - 禁止依赖: ../../view/、../../infrastructure/ 实现
 *   - 被依赖方: ../../view/components/ExportPanel
 */

import { useState, useCallback } from "react";
import { ExportDataUseCaseImpl } from "../../application/useCases/ExportDataUseCase";
import { csvExporter } from "../../infrastructure/export/csvExporter";
import { jsonExporter } from "../../infrastructure/export/jsonExporter";
import { pngExporter } from "../../infrastructure/export/pngExporter";
import type {
  ExportFormat,
  CSVExportConfig,
  JSONExportConfig,
  PNGExportConfig,
} from "../../contracts";
import type { IExporter } from "../../contracts";

// ─── 单例 UseCase 实例 ─────────────────────────────

const exportUseCase = new ExportDataUseCaseImpl(
  new Map<ExportFormat, IExporter<unknown>>([
    ["csv", csvExporter],
    ["json", jsonExporter],
    ["png", pngExporter],
  ]),
);

// ─── Hook ──────────────────────────────────────────

export interface ExportViewModelState {
  /** 当前选择的导出格式 */
  selectedFormat: ExportFormat;
  /** 是否正在导出 */
  isExporting: boolean;
  /** 导出是否完成 */
  isComplete: boolean;
  /** 浏览器是否支持导出（Blob + URL API） */
  isBrowserSupported: boolean;
  /** 最近一次错误 */
  error: Error | null;
}

export interface ExportViewModelActions {
  /** 切换导出格式 */
  setFormat: (format: ExportFormat) => void;
  /** 导出 CSV */
  exportCSV: (config: CSVExportConfig) => Promise<void>;
  /** 导出 JSON */
  exportJSON: (config: JSONExportConfig) => Promise<void>;
  /** 导出 PNG */
  exportPNG: (config: PNGExportConfig) => Promise<void>;
  /** 清除错误与完成状态 */
  reset: () => void;
}

export type ExportViewModel = ExportViewModelState & ExportViewModelActions;

export function useExportViewModel(): ExportViewModel {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isBrowserSupported] = useState(() => exportUseCase.isBrowserSupported());
  const [error, setError] = useState<Error | null>(null);

  const setFormat = useCallback((format: ExportFormat) => {
    setSelectedFormat(format);
    setError(null);
    setIsComplete(false);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setIsComplete(false);
  }, []);

  const exportCSV = useCallback(async (config: CSVExportConfig) => {
    setIsExporting(true);
    setError(null);
    try {
      await exportUseCase.execute("csv", config);
      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportJSON = useCallback(async (config: JSONExportConfig) => {
    setIsExporting(true);
    setError(null);
    try {
      await exportUseCase.execute("json", config);
      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportPNG = useCallback(async (config: PNGExportConfig) => {
    setIsExporting(true);
    setError(null);
    try {
      await exportUseCase.execute("png", config);
      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsExporting(false);
    }
  }, []);

  return {
    selectedFormat,
    isExporting,
    isComplete,
    isBrowserSupported,
    error,
    setFormat,
    exportCSV,
    exportJSON,
    exportPNG,
    reset,
  };
}
