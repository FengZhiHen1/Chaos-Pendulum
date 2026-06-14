/**
 * 模块: data.application.useCases.ExportDataUseCase
 * 职责: ExportDataUseCase 契约的 Application 层实现——编排导出流程。
 * 依赖: IExporter<TConfig>, ExportFormat
 */

import { ExportDataUseCase as ExportDataUseCaseABC } from "../../contracts";
import type { IExporter, ExportFormat } from "../../contracts";

/**
 * 数据导出用例实现。
 *
 * 在 doExecute 钩子中调用对应 IExporter 的 export() 方法。
 * 格式校验、配置校验和浏览器兼容性检查由父类 ABC 处理。
 */
export class ExportDataUseCaseImpl extends ExportDataUseCaseABC {
  constructor(exporters: Map<ExportFormat, IExporter<unknown>>) {
    super(exporters);
  }

  /**
   * 执行导出逻辑——调用 exporter.export(config)。
   *
   * 不需要关心:
   *   - 格式校验——execute() 入口已处理
   *   - 配置校验——execute() 入口已调用 exporter.validateConfig()
   *   - 浏览器兼容性——execute() 入口已处理
   */
  protected async doExecute<TConfig>(
    exporter: IExporter<TConfig>,
    config: TConfig,
  ): Promise<void> {
    await exporter.export(config);
  }
}
