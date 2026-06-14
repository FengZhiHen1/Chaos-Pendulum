/**
 * 模块: data.infrastructure.export.csvExporter
 * 职责: IExporter<CSVExportConfig> 的 CSV 实现——14 字段时序数据导出。
 * 依赖: validateCSVConfig (contracts), Blob/URL API
 */

import type { IExporter, CSVExportConfig, ExportFormat } from "../../contracts";
import { validateCSVConfig } from "../../contracts";
import { DataExportError } from "../../contracts";

/**
 * CSV 导出器——14 字段时序数据。
 *
 * 实现 IExporter<CSVExportConfig> 端口。
 */
class CsvExporterImpl implements IExporter<CSVExportConfig> {
  readonly format: ExportFormat = "csv";

  /**
   * 验证 CSV 配置有效性。
   * @throws DataExportError — 校验失败
   */
  validateConfig(config: CSVExportConfig): void {
    validateCSVConfig(config);
  }

  /**
   * 执行 CSV 导出——触发浏览器下载。
   * @throws DataExportError — CSV 内容生成或下载失败
   */
  async export(config: CSVExportConfig): Promise<void> {
    try {
      const csvContent = [
        config.headers.join(","),
        ...config.rows.map((row) => row.join(",")),
      ].join("\n");

      this.downloadBlob(csvContent, `${config.filename}.csv`, "text/csv");
    } catch (err) {
      throw new DataExportError(
        "EXPORT_FAILED",
        `CSV 导出失败: ${err instanceof Error ? err.message : String(err)}`,
        "CsvExporterImpl.export()",
        "csv",
        err instanceof Error ? err.message : "unknown",
      );
    }
  }

  /**
   * 触发浏览器 Blob 下载。
   * @throws DataExportError — Blob API 不可用
   */
  private downloadBlob(content: string, filename: string, mimeType: string): void {
    if (typeof Blob === "undefined" || typeof URL === "undefined") {
      throw new DataExportError(
        "EXPORT_FAILED",
        "当前浏览器不支持 Blob/URL API",
        "CsvExporterImpl.downloadBlob()",
        "csv",
        "browser_unsupported",
      );
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/** 全局单例 CSV 导出器 */
export const csvExporter: IExporter<CSVExportConfig> = new CsvExporterImpl();

/**
 * @deprecated 使用 csvExporter.export(config) 代替。保留用于向后兼容。
 */
export function exportCSV(filename: string, headers: string[], rows: number[][]): void {
  const config: CSVExportConfig = { headers, rows, filename };
  csvExporter.validateConfig(config);
  void csvExporter.export(config);
}
