/**
 * 模块: data.infrastructure.export.jsonExporter
 * 职责: IExporter<JSONExportConfig> 的 JSON 实现——场景文件导出（参数 + 轨迹，不含尾迹历史）。
 * 依赖: validateJSONConfig (contracts), Blob/URL API
 */

import type { IExporter, JSONExportConfig, ExportFormat } from "../../contracts";
import { validateJSONConfig } from "../../contracts";
import { DataExportError } from "../../contracts";

/**
 * JSON 导出器——场景文件（参数 + 轨迹，不含尾迹历史）。
 *
 * 实现 IExporter<JSONExportConfig> 端口。
 */
class JsonExporterImpl implements IExporter<JSONExportConfig> {
  readonly format: ExportFormat = "json";

  /**
   * 验证 JSON 配置有效性。
   * @throws DataExportError — 校验失败
   */
  validateConfig(config: JSONExportConfig): void {
    validateJSONConfig(config);
  }

  /**
   * 执行 JSON 导出——触发浏览器下载。
   * @throws DataExportError — JSON 序列化或下载失败
   */
  async export(config: JSONExportConfig): Promise<void> {
    try {
      const json = JSON.stringify(
        {
          params: config.params,
          trajectory: config.trajectory,
          metadata: config.metadata,
        },
        null,
        2,
      );

      this.downloadBlob(json, `${config.filename}.json`, "application/json");
    } catch (err) {
      throw new DataExportError(
        "EXPORT_FAILED",
        `JSON 导出失败: ${err instanceof Error ? err.message : String(err)}`,
        "JsonExporterImpl.export()",
        "json",
        err instanceof Error ? err.message : "unknown",
      );
    }
  }

  /**
   * 触发浏览器 Blob 下载。
   */
  private downloadBlob(content: string, filename: string, mimeType: string): void {
    if (typeof Blob === "undefined" || typeof URL === "undefined") {
      throw new DataExportError(
        "EXPORT_FAILED",
        "当前浏览器不支持 Blob/URL API",
        "JsonExporterImpl.downloadBlob()",
        "json",
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

/** 全局单例 JSON 导出器 */
export const jsonExporter: IExporter<JSONExportConfig> = new JsonExporterImpl();

/**
 * @deprecated 使用 jsonExporter.export(config) 代替。保留用于向后兼容。
 * 注意: 此函数不执行契约校验——新代码应使用 jsonExporter。
 */
export function exportJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
