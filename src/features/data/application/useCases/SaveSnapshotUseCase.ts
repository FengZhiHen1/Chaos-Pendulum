/**
 * 模块: data.application.useCases.SaveSnapshotUseCase
 * 职责: SaveSnapshotUseCase 契约的 Application 层实现——构建完整快照实体并持久化。
 * 依赖: ISnapshotRepository, IThumbnailGenerator, Snapshot 类型
 */

import { SaveSnapshotUseCase as SaveSnapshotUseCaseABC } from "../../contracts";
import type { Snapshot, SnapshotID, SaveSnapshotInput } from "../../contracts";
import type { ISnapshotRepository, IThumbnailGenerator } from "../../contracts";

/** 生成 UUID v4 格式的快照 ID */
function generateSnapshotId(): SnapshotID {
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return uuid as SnapshotID;
}

/**
 * 保存快照用例实现。
 *
 * 在 _doExecute 钩子中完成快照构建和持久化。
 * 输入校验、LRU 驱逐和输出校验由父类 ABC 处理。
 */
export class SaveSnapshotUseCaseImpl extends SaveSnapshotUseCaseABC {
  constructor(
    snapshotRepo: ISnapshotRepository,
    thumbnailGen: IThumbnailGenerator,
  ) {
    super(snapshotRepo, thumbnailGen);
  }

  /**
   * 构建完整 Snapshot 实体并持久化。
   *
   * 不需要关心:
   *   - 输入校验——execute() 入口已处理
   *   - LRU 驱逐——execute() 入口已处理
   *   - 输出校验——execute() 入口已处理
   */
  protected async doExecute(input: SaveSnapshotInput): Promise<Snapshot> {
    const thumbnail = this.thumbnailGen.generate(input.canvas);
    const id = generateSnapshotId();
    const timestamp = new Date().toISOString();

    const snapshot: Snapshot = {
      id,
      timestamp,
      params: input.params,
      stateVector: input.stateVector,
      trail: input.trail,
      thumbnail,
      mode: input.mode,
      cameraConfig: input.cameraConfig,
      simTime: input.simTime,
      label: input.label,
    };

    await this.snapshotRepo.save(snapshot);
    return snapshot;
  }
}
