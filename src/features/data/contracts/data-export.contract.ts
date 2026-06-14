/**
 * 模块: data.contracts.data-export
 * 职责: DAT-02 数据导出契约——将仿真数据与可视化结果导出为多种可分享格式。
 *       支持 3 种格式：CSV 时序数据、JSON 场景文件、PNG 截图（最高 4K）。
 * 数据来源:
 *   - SimulationFrame[] (simulation/contracts): MUST — CSV 导出的 14 字段时序数据
 *   - PendulumParams (shared/domain/valueObjects): MUST — JSON 场景文件的参数
 *   - StateVector[] (shared/domain/valueObjects): MUST — JSON 场景文件的轨迹
 *   - HTMLCanvasElement: MUST — PNG 截图的数据源
 * 边界:
 *   - 依赖: simulation/contracts (SimulationFrame), shared/domain/valueObjects
 *   - 被依赖: DataPage (View), DataSlice (ViewModel)
 * 禁止行为:
 *   - 禁止导出视频/动画格式（不做 MP4/GIF 录屏）
 *   - 禁止 JSON 场景文件包含尾迹历史（数据量过大）
 *   - 禁止在非浏览器环境下直接调用 blob download（需检测 Blob API 可用性）
 *   - 禁止 PNG 分辨率超过 4x（4K 上限）
 *   - 禁止在 Import 中包含 React/Zustand（Application 层无状态）
 */

import type {
  ExportFormat,
  CSVExportConfig,
  JSONExportConfig,
  PNGExportConfig,
} from "./types.contract";
import { DataExportError } from "./exceptions";
import { PNG_MAX_RESOLUTION } from "./types.contract";

// ─── 端口接口 ─────────────────────────────────────

/**
 * @contract IExporter — 数据导出器端口。
 *
 * 每种导出格式对应一个实现：
 *   - CsvExporter: 14 字段 CSV 时序数据
 *   - JsonExporter: JSON 场景文件（参数 + 轨迹，不含尾迹历史）
 *   - PngExporter: PNG 截图（3D 视图/相空间图/分岔图/庞加莱截面，最高 4K）
 *
 * 前置: 数据已就绪（Canvas 已渲染 / 帧数组非空）
 * 后置: 浏览器触发文件下载
 * 输入约束: 取决于具体格式
 * 输出约束: 文件下载完成
 * 异常: DataExportError — 数据无效或浏览器不支持
 * Side Effects: 触发浏览器 Blob 下载
 */
export interface IExporter<TConfig> {
  /** 导出格式标识 */
  readonly format: ExportFormat;

  /** 执行导出。触发浏览器下载。 */
  export(config: TConfig): Promise<void>;

  /** 验证配置是否有效。 */
  validateConfig(config: TConfig): void;
}

// ─── 行为契约（抽象类） ──────────────────────────

/**
 * @contract ExportDataUseCase — 数据导出用例。
 *
 * 编排导出流程：格式路由 → 数据校验 → 调用对应 IExporter → 错误处理。
 * 支持 3 种格式：CSV（14 字段时序数据）、JSON（场景文件，可分享复现）、
 * PNG 截图（最高 4K 分辨率）。
 *
 * 前置: 仿真已运行至少一个批次（有数据可导出）
 * 后置: 浏览器下载文件完成
 * 输入约束:
 *   - format: 有效的 ExportFormat
 *   - config: 格式对应的配置对象
 * 输出约束:
 *   - 成功：浏览器下载文件
 *   - 失败：DataExportError
 * 异常:
 *   - DataExportError: 格式无效、数据为空、浏览器不支持 Blob API
 * Side Effects:
 *   - 创建 Blob → URL.createObjectURL → 触发下载 → URL.revokeObjectURL
 *   - 记录导出审计日志
 */
export abstract class ExportDataUseCase {
  constructor(
    protected readonly exporters: Map<ExportFormat, IExporter<unknown>>,
  ) {}

  /**
   * 执行数据导出。
   *
   * 子类不得覆写此方法。
   */
  async execute<TConfig>(format: ExportFormat, config: TConfig): Promise<void> {
    this.validateFormat(format);
    const exporter = this.getExporter(format);
    exporter.validateConfig(config);
    await this.doExecute(exporter, config);
    this.validateExportCompleted();
  }

  /**
   * 检查浏览器环境是否支持导出。
   *
   * 前置: 无
   * 后置: 返回当前浏览器是否支持 Blob + URL API
   * 异常: 无
   * Side Effects: 无
   */
  isBrowserSupported(): boolean {
    return (
      typeof Blob !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function" &&
      typeof URL.revokeObjectURL === "function"
    );
  }

  // ── 模板钩子 ──

  /**
   * 实现导出逻辑——调用 exporter.export(config)。
   *
   * 不需要关心:
   *   - 格式校验——execute() 入口已处理
   *   - 配置校验——execute() 入口已调用 exporter.validateConfig()
   *   - 浏览器兼容性——execute() 入口已处理
   */
  protected abstract doExecute<TConfig>(
    exporter: IExporter<TConfig>,
    config: TConfig,
  ): Promise<void>;

  // ── 内部辅助 ──

  /** 获取指定格式的导出器。 */
  protected getExporter<TConfig>(format: ExportFormat): IExporter<TConfig> {
    const exporter = this.exporters.get(format);
    if (!exporter) {
      throw new DataExportError(
        "EXPORT_INVALID_CONFIG",
        `未注册的导出格式: ${format}`,
        "ExportDataUseCase.getExporter()",
        format,
        "exporter_not_registered",
      );
    }
    return exporter as IExporter<TConfig>;
  }

  // ── 基线校验器 ──

  /** 基线：验证导出格式有效。 */
  protected validateFormat(format: ExportFormat): void {
    const validFormats: ExportFormat[] = ["csv", "json", "png"];
    if (!validFormats.includes(format)) {
      throw new DataExportError(
        "EXPORT_INVALID_CONFIG",
        `不支持的导出格式: ${format}。支持: ${validFormats.join(", ")}`,
        "ExportDataUseCase.validateFormat()",
        format,
        "invalid_format",
      );
    }
    if (!this.isBrowserSupported()) {
      throw new DataExportError(
        "EXPORT_FAILED",
        "当前浏览器不支持 Blob/URL API——无法导出文件",
        "ExportDataUseCase.validateFormat()",
        format,
        "browser_unsupported",
      );
    }
  }

  /** 基线：验证导出完成。 */
  protected validateExportCompleted(): void {
    // 基线实现：无额外检查。子类可叠加。
  }
}

// ─── 格式特定校验器（纯函数，可被 IExporter 实现复用） ───

/**
 * 校验 CSV 导出配置。
 *
 * 前置: 无
 * 后置: 通过或抛出 DataExportError
 * 输入约束:
 *   - headers: 含 14 个字段
 *   - rows: 非空二维数组
 *   - filename: 非空字符串
 * 异常: DataExportError — 任何校验失败
 * Side Effects: 无
 */
export function validateCSVConfig(config: CSVExportConfig): void {
  if (!config.headers || config.headers.length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "CSV 头字段为空", "validateCSVConfig", "csv", "empty_headers",
    );
  }
  if (!config.rows || config.rows.length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "CSV 数据行为空", "validateCSVConfig", "csv", "empty_rows",
    );
  }
  if (!config.filename || config.filename.trim().length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "CSV 文件名为空", "validateCSVConfig", "csv", "empty_filename",
    );
  }
}

/**
 * 校验 JSON 导出配置。
 *
 * 前置: 无
 * 后置: 通过或抛出 DataExportError
 * 输入约束:
 *   - params: 完整的 PendulumParams
 *   - trajectory: 非空轨迹数组（不含尾迹历史——数据量过大）
 *   - filename: 非空字符串
 * 异常: DataExportError — 任何校验失败
 * Side Effects: 无
 */
export function validateJSONConfig(config: JSONExportConfig): void {
  if (!config.params || Object.keys(config.params).length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "JSON 参数为空", "validateJSONConfig", "json", "empty_params",
    );
  }
  if (!config.trajectory || config.trajectory.length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "JSON 轨迹为空", "validateJSONConfig", "json", "empty_trajectory",
    );
  }
  if (!config.filename || config.filename.trim().length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "JSON 文件名为空", "validateJSONConfig", "json", "empty_filename",
    );
  }
}

/**
 * 校验 PNG 导出配置。
 *
 * 前置: 无
 * 后置: 通过或抛出 DataExportError
 * 输入约束:
 *   - canvas: 非 null HTMLCanvasElement
 *   - resolution: [1, 4] 范围内
 *   - filename: 非空字符串
 * 异常: DataExportError — 任何校验失败
 * Side Effects: 无
 */
export function validatePNGConfig(config: PNGExportConfig): void {
  if (!config.canvas || !(config.canvas instanceof HTMLCanvasElement)) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "PNG Canvas 为 null 或无效", "validatePNGConfig", "png", "invalid_canvas",
    );
  }
  if (!Number.isInteger(config.resolution) || config.resolution < 1 || config.resolution > PNG_MAX_RESOLUTION) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      `PNG 分辨率超限: ${config.resolution}，允许范围 [1, ${PNG_MAX_RESOLUTION}]`,
      "validatePNGConfig", "png", "invalid_resolution",
    );
  }
  if (!config.filename || config.filename.trim().length === 0) {
    throw new DataExportError(
      "EXPORT_INVALID_CONFIG",
      "PNG 文件名为空", "validatePNGConfig", "png", "empty_filename",
    );
  }
}
