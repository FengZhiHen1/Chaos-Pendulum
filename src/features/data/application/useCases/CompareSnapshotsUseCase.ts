/**
 * 模块: data.application.useCases.CompareSnapshotsUseCase
 * 职责: CompareSnapshotsUseCase 契约的 Application 层实现——双快照参数差异表生成。
 * 依赖: ISnapshotRepository, PendulumParams, PARAM_META
 */

import { CompareSnapshotsUseCase as CompareSnapshotsUseCaseABC } from "../../contracts";
import type {
  Snapshot,
  SnapshotComparison,
  ParamDiff,
  SnapshotMeta,
} from "../../contracts";
import type { ISnapshotRepository } from "../../contracts";
import { PARAM_META } from "@/shared/domain/valueObjects";

/**
 * 双快照对比用例实现。
 *
 * 在 doExecute 钩子中生成完整的参数差异表。
 * ID 去重校验、快照存在性校验和输出校验由父类 ABC 处理。
 */
export class CompareSnapshotsUseCaseImpl extends CompareSnapshotsUseCaseABC {
  constructor(snapshotRepo: ISnapshotRepository) {
    super(snapshotRepo);
  }

  /**
   * 比较两个快照的所有参数，生成 ParamDiff 列表。
   *
   * 不需要关心:
   *   - ID 去重校验——execute() 入口已处理
   *   - 快照存在性校验——execute() 入口已处理
   *   - 输出校验——execute() 入口已处理
   */
  protected async doExecute(
    snapshotA: Snapshot,
    snapshotB: Snapshot,
  ): Promise<SnapshotComparison> {
    const paramsA = snapshotA.params;
    const paramsB = snapshotB.params;
    const paramDiffs: ParamDiff[] = [];

    // 遍历 PARAM_META 中定义的所有参数维度
    for (const meta of PARAM_META) {
      const key = meta.key;
      const valueA = this.getParamValue(paramsA as unknown as Record<string, number>, key);
      const valueB = this.getParamValue(paramsB as unknown as Record<string, number>, key);
      const delta = valueB - valueA;

      paramDiffs.push({
        key,
        label: meta.label,
        unit: meta.unit,
        valueA,
        valueB,
        delta,
      });
    }

    const hasDifference = paramDiffs.some((d) => Math.abs(d.delta) > 1e-10);

    const metaA: SnapshotMeta = this.toMeta(snapshotA);
    const metaB: SnapshotMeta = this.toMeta(snapshotB);

    return {
      snapshotA: metaA,
      snapshotB: metaB,
      paramDiffs,
      hasDifference,
    };
  }

  /**
   * 从 PendulumParams 中安全获取参数值。
   * PendulumParams 没有索引签名，因此通过显式属性访问。
   */
  private getParamValue(params: Record<string, number>, key: string): number {
    return (params as Record<string, number>)[key] ?? 0;
  }

  /** 将 Snapshot 转换为 SnapshotMeta 轻量视图。 */
  private toMeta(snapshot: Snapshot): SnapshotMeta {
    return {
      id: snapshot.id as string,
      timestamp: snapshot.timestamp,
      label: snapshot.label,
      thumbnail: snapshot.thumbnail,
      simTime: snapshot.simTime ?? 0,
      mode: snapshot.mode,
    };
  }
}
