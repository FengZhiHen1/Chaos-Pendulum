/**
 * 模块: data.infrastructure.export.pngExporter
 * 职责: IExporter<PNGExportConfig> 的 PNG 实现——截图导出（最高 4K 分辨率）。
 * 依赖: validatePNGConfig (contracts), Canvas API, Blob/URL API
 */

import type { IExporter, PNGExportConfig, ExportFormat } from "../../contracts";
import { validatePNGConfig } from "../../contracts";
import { DataExportError } from "../../contracts";

/**
 * PNG 导出器——截图导出（最高 4K 分辨率）。
 *
 * 实现 IExporter<PNGExportConfig> 端口。
 */
class PngExporterImpl implements IExporter<PNGExportConfig> {
  readonly format: ExportFormat = "png";

  /**
   * 验证 PNG 配置有效性。
   * @throws DataExportError — 校验失败
   */
  validateConfig(config: PNGExportConfig): void {
    validatePNGConfig(config);
  }

  /**
   * 执行 PNG 导出——触发浏览器下载。
   * @throws DataExportError — Canvas 渲染或下载失败
   */
  async export(config: PNGExportConfig): Promise<void> {
    try {
      await this.renderAndDownload(config);
    } catch (err) {
      throw new DataExportError(
        "EXPORT_FAILED",
        `PNG 导出失败: ${err instanceof Error ? err.message : String(err)}`,
        "PngExporterImpl.export()",
        "png",
        err instanceof Error ? err.message : "unknown",
      );
    }
  }

  /**
   * 将 canvas 渲染到指定分辨率的输出画布并触发下载。
   */
  private renderAndDownload(config: PNGExportConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const out = document.createElement("canvas");
      out.width = config.canvas.width * config.resolution;
      out.height = config.canvas.height * config.resolution;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(config.canvas, 0, 0, out.width, out.height);

      out.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob 返回 null"));
          return;
        }
        if (typeof URL === "undefined") {
          reject(new Error("当前浏览器不支持 URL API"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${config.filename}.png`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    });
  }
}

/** 全局单例 PNG 导出器 */
export const pngExporter: IExporter<PNGExportConfig> = new PngExporterImpl();

/**
 * @deprecated 使用 pngExporter.export(config) 代替。保留用于向后兼容。
 * 注意: 此函数不执行契约校验——新代码应使用 pngExporter。
 */
export function exportPNG(canvas: HTMLCanvasElement, filename: string, resolution = 1): void {
  const config: PNGExportConfig = { canvas, filename, resolution };
  pngExporter.validateConfig(config);
  void pngExporter.export(config);
}
