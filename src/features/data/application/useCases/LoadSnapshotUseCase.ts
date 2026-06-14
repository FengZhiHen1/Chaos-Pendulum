/**
 * 模块: data.application.useCases.LoadSnapshotUseCase
 * 职责: LoadSnapshotUseCase 契约的 Application 层实现——从 IndexedDB 加载完整快照。
 * 依赖: ISnapshotRepository
 */

import { LoadSnapshotUseCase as LoadSnapshotUseCaseABC } from "../../contracts";
import type { Snapshot, SnapshotID } from "../../contracts";
import type { ISnapshotRepository } from "../../contracts";

/**
 * 加载快照用例实现。
 *
 * 在 doExecute 钩子中从仓储加载快照。
 * ID 校验和不存在检查由父类 ABC 处理。
 */
export class LoadSnapshotUseCaseImpl extends LoadSnapshotUseCaseABC {
  constructor(snapshotRepo: ISnapshotRepository) {
    super(snapshotRepo);
  }

  /**
   * 从 IndexedDB 加载完整快照。
   *
   * 不需要关心:
   *   - ID 校验——execute() 入口已处理
   *   - 不存在检查——execute() 入口已处理
   */
  protected async doExecute(id: SnapshotID): Promise<Snapshot> {
    return this.snapshotRepo.load(id);
  }
}
