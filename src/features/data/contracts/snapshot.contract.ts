/**
 * 模块: data.contracts.snapshot
 * 职责: DAT-01 状态快照契约——一键保存与恢复完整仿真状态，支持快照对比。
 *       保存完整参数+状态向量+尾迹历史+缩略图，以缩略卡片排列，
 *       支持双快照参数差异表和轨迹叠加显示。
 * 数据来源:
 *   - PendulumParams (shared/domain/valueObjects): MUST — 快照保存的完整参数
 *   - StateVector (shared/domain/valueObjects): MUST — 当前状态向量
 *   - RingBuffer (data/domain): MUST — 尾迹历史
 *   - 3D Canvas: MUST — 64px 缩略图生成
 *   - IndexedDB (shared/infrastructure/storage): MUST — 持久化存储
 * 边界:
 *   - 依赖: shared/domain/valueObjects, data/domain (RingBuffer)
 *   - 被依赖: DataPage (View), DataSlice (ViewModel)
 * 禁止行为:
 *   - 禁止在快照中保存超过 1200 个坐标点的尾迹数据（控制存储体积）
 *   - 禁止不经验证直接存储——所有快照必须通过 validateSnapshot 校验
 *   - 禁止在 Import 中包含 React/Zustand（Application 层无状态）
 *   - 禁止绕过 LRU 上限直接写入——必须在写入前检查并驱逐最旧快照
 */

import type {
  Snapshot,
  SnapshotMeta,
  SnapshotID,
  SnapshotComparison,
  CameraConfig,
} from "./types.contract";
import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";
import type { AppMode } from "@/shared/domain/valueObjects";
import { SnapshotNotFoundError, SnapshotInvalidError } from "./exceptions";
import { SNAPSHOT_MAX_COUNT } from "./types.contract";

// ─── 端口接口 ─────────────────────────────────────

/**
 * @contract ISnapshotRepository — 快照持久化仓储端口。
 *
 * 提供快照的 CRUD 操作，底层使用 IndexedDB。
 * 实现者负责 LRU 驱逐策略、事务管理和错误恢复。
 *
 * 前置: IndexedDB 可用且数据库已初始化
 * 后置: 快照持久化到 browser storage
 * 输入约束:
 *   - snapshot: 完整有效的 Snapshot 实体
 *   - id: 有效的 SnapshotID
 * 输出约束:
 *   - list() 按时间戳降序排列
 * 异常:
 *   - SnapshotNotFoundError: 指定 id 不存在
 *   - SnapshotFullError: 已达存储上限
 * Side Effects: 读写 IndexedDB
 */
export interface ISnapshotRepository {
  /** 保存快照。触发 LRU 驱逐如果已达上限。 */
  save(snapshot: Snapshot): Promise<void>;

  /** 加载完整快照。 */
  load(id: SnapshotID): Promise<Snapshot>;

  /** 列出所有快照元数据（轻量视图）。 */
  list(): Promise<SnapshotMeta[]>;

  /** 删除指定快照。 */
  delete(id: SnapshotID): Promise<void>;

  /** 当前存储数量。 */
  count(): Promise<number>;

  /** 是否已达存储上限。 */
  isFull(): Promise<boolean>;
}

/**
 * @contract IThumbnailGenerator — 缩略图生成器端口。
 *
 * 从 3D Canvas 生成 64px 缩略图。
 *
 * 前置: Canvas 已挂载且已渲染至少一帧
 * 后置: 返回 base64 编码的 64x64 PNG
 * 输入约束:
 *   - canvas: 有效的 HTMLCanvasElement
 *   - size: 缩略图尺寸 (px)，默认 64
 * 输出约束:
 *   - 返回 data URL 格式字符串 (data:image/png;base64,...)
 * 异常: SnapshotInvalidError — canvas 为 null 或尺寸无效
 * Side Effects: 读取 Canvas 像素数据
 */
export interface IThumbnailGenerator {
  generate(canvas: HTMLCanvasElement, size?: number): string;
}

// ─── 行为契约（抽象类） ──────────────────────────

/**
 * @contract SaveSnapshotUseCase — 保存快照用例。
 *
 * 一键保存完整仿真状态（参数 + StateVector + 尾迹历史 + 缩略图 + 相机姿态）。
 * 快照以缩略卡片排列于 IndexedDB 中（LRU 上限 50）。
 *
 * 前置: 仿真处于运行或暂停状态
 * 后置: 快照持久化到 IndexedDB，可通过 list() 查询
 * 输入约束:
 *   - params: 完整的 PendulumParams
 *   - stateVector: 有效的 StateVector（四个字段均为有限值）
 *   - trail: 尾迹坐标数组（长度 ≤ 1200）
 *   - canvas: 已渲染的 3D Canvas
 *   - mode: 当前 AppMode
 *   - cameraConfig: 当前相机姿态
 *   - simTime: 当前仿真时间 (s)
 *   - label?: 可选手动标签
 * 输出约束:
 *   - 返回新创建 Snapshot 的完整实体
 *   - 若超出 LRU 上限，已自动驱逐最旧快照
 * 异常:
 *   - SnapshotInvalidError: 任何字段无效
 *   - SnapshotFullError: 存储满且 LRU 驱逐失败
 * Side Effects:
 *   - 写入 IndexedDB
 *   - 可能删除最旧快照（LRU 驱逐）
 *   - 记录审计日志
 */
export abstract class SaveSnapshotUseCase {
  constructor(
    protected readonly snapshotRepo: ISnapshotRepository,
    protected readonly thumbnailGen: IThumbnailGenerator,
  ) {}

  /**
   * 执行快照保存。
   *
   * 子类不得覆写此方法。
   */
  async execute(input: SaveSnapshotInput): Promise<Snapshot> {
    this.validateSaveInput(input);
    const snapshot = await this.doExecute(input);
    this.validateSnapshotOutput(snapshot);
    await this.enforceLRULimit();
    return snapshot;
  }

  // ── 模板钩子 ──

  /**
   * 实现快照构建和持久化。
   *
   * 不需要关心:
   *   - 输入校验——execute() 入口已处理
   *   - LRU 驱逐——execute() 入口已处理
   *   - 输出校验——execute() 入口已处理
   */
  protected abstract doExecute(input: SaveSnapshotInput): Promise<Snapshot>;

  // ── 基线校验器 ──

  /** 基线：校验保存输入。 */
  protected validateSaveInput(input: SaveSnapshotInput): void {
    if (!input.params || Object.keys(input.params).length === 0) {
      throw new SnapshotInvalidError(
        "快照参数为空", "SaveSnapshotUseCase.execute()", "params",
      );
    }
    if (!input.stateVector) {
      throw new SnapshotInvalidError(
        "状态向量为空", "SaveSnapshotUseCase.execute()", "stateVector",
      );
    }
    if (
      !Number.isFinite(input.stateVector.theta1) ||
      !Number.isFinite(input.stateVector.omega1) ||
      !Number.isFinite(input.stateVector.theta2) ||
      !Number.isFinite(input.stateVector.omega2)
    ) {
      throw new SnapshotInvalidError(
        "状态向量含非有限值", "SaveSnapshotUseCase.execute()", "stateVector",
      );
    }
    if (!input.canvas) {
      throw new SnapshotInvalidError(
        "Canvas 为 null——无法生成缩略图", "SaveSnapshotUseCase.execute()", "canvas",
      );
    }
    if (input.trail.length > 1200) {
      throw new SnapshotInvalidError(
        `尾迹数据超限: ${input.trail.length} > 1200 坐标点`, "SaveSnapshotUseCase.execute()", "trail",
      );
    }
  }

  /** 基线：校验输出快照完整性。 */
  protected validateSnapshotOutput(snapshot: Snapshot): void {
    if (!snapshot.id) {
      throw new SnapshotInvalidError(
        "快照 ID 为空", "SaveSnapshotUseCase.validateSnapshotOutput()", "id",
      );
    }
    if (!snapshot.thumbnail || !snapshot.thumbnail.startsWith("data:image/png")) {
      throw new SnapshotInvalidError(
        "缩略图格式无效", "SaveSnapshotUseCase.validateSnapshotOutput()", "thumbnail",
      );
    }
  }

  /** 基线：执行 LRU 驱逐。 */
  protected async enforceLRULimit(): Promise<void> {
    const count = await this.snapshotRepo.count();
    if (count > SNAPSHOT_MAX_COUNT) {
      // LRU：删除最旧的快照（按时间戳升序第一条）
      const all = await this.snapshotRepo.list();
      const oldest = all.length > 0 ? all[all.length - 1] : undefined; // 时间戳升序 = 最早在最后
      if (oldest) {
        await this.snapshotRepo.delete(oldest.id as SnapshotID);
      }
    }
  }
}

/**
 * @contract LoadSnapshotUseCase — 加载快照用例。
 *
 * 从 IndexedDB 加载完整的快照数据并恢复仿真状态。
 *
 * 前置: 快照存在于 IndexedDB 中
 * 后置: 返回完整的 Snapshot 实体
 * 输入约束:
 *   - id: 有效的 SnapshotID
 * 输出约束:
 *   - 返回的 Snapshot 包含完整参数/状态/尾迹/缩略图
 * 异常:
 *   - SnapshotNotFoundError: 指定 id 不存在
 * Side Effects:
 *   - 读取 IndexedDB
 *   - 可选：将快照数据注入仿真引擎恢复状态
 */
export abstract class LoadSnapshotUseCase {
  constructor(
    protected readonly snapshotRepo: ISnapshotRepository,
  ) {}

  async execute(id: SnapshotID): Promise<Snapshot> {
    this.validateId(id);
    const snapshot = await this.doExecute(id);
    this.validateSnapshotExists(snapshot, id);
    return snapshot;
  }

  /** 实现加载逻辑。不需要关心 ID 校验和不存在检查——execute() 入口已处理。 */
  protected abstract doExecute(id: SnapshotID): Promise<Snapshot>;

  protected validateId(id: SnapshotID): void {
    if (!id || typeof id !== "string" || id.length === 0) {
      throw new SnapshotNotFoundError("快照 ID 为空", "LoadSnapshotUseCase.execute()", String(id));
    }
  }

  protected validateSnapshotExists(snapshot: Snapshot | undefined, id: SnapshotID): asserts snapshot is Snapshot {
    if (!snapshot) {
      throw new SnapshotNotFoundError(
        `快照不存在: ${id}`, "LoadSnapshotUseCase.execute()", String(id),
      );
    }
  }
}

/**
 * @contract CompareSnapshotsUseCase — 双快照对比用例。
 *
 * 选择两个快照，自动生成参数差异表，支持轨迹叠加显示。
 *
 * 前置: 两个快照均已加载
 * 后置: 返回 SnapshotComparison 含完整差异表
 * 输入约束:
 *   - idA, idB: 两个不同的快照 ID
 * 输出约束:
 *   - paramDiffs 包含所有 10 个参数的差异
 *   - hasDifference: 是否存在任何差异
 * 异常:
 *   - SnapshotNotFoundError: 任一快照不存在
 *   - SnapshotInvalidError: idA === idB（不能对比同一快照）
 * Side Effects: 无——纯计算
 */
export abstract class CompareSnapshotsUseCase {
  constructor(
    protected readonly snapshotRepo: ISnapshotRepository,
  ) {}

  async execute(idA: SnapshotID, idB: SnapshotID): Promise<SnapshotComparison> {
    this.validateDifferentIds(idA, idB);
    const snapshotA = await this.snapshotRepo.load(idA);
    const snapshotB = await this.snapshotRepo.load(idB);
    this.validateBothExist(snapshotA, idA, snapshotB, idB);
    const result = await this.doExecute(snapshotA, snapshotB);
    this.validateComparisonOutput(result);
    return result;
  }

  protected abstract doExecute(snapshotA: Snapshot, snapshotB: Snapshot): Promise<SnapshotComparison>;

  protected validateDifferentIds(idA: SnapshotID, idB: SnapshotID): void {
    if (idA === idB) {
      throw new SnapshotInvalidError(
        "不能对比同一快照", "CompareSnapshotsUseCase.execute()", "idA===idB",
      );
    }
  }

  protected validateBothExist(
    a: Snapshot | undefined, idA: SnapshotID,
    b: Snapshot | undefined, idB: SnapshotID,
  ): void {
    if (!a) throw new SnapshotNotFoundError(`快照 A 不存在: ${idA}`, "CompareSnapshotsUseCase", String(idA));
    if (!b) throw new SnapshotNotFoundError(`快照 B 不存在: ${idB}`, "CompareSnapshotsUseCase", String(idB));
  }

  /**
   * 基线：验证对比结果的完整性。
   * @throws SnapshotInvalidError — 结果缺少差异数据
   */
  protected validateComparisonOutput(result: SnapshotComparison): void {
    if (!result.snapshotA || !result.snapshotB) {
      throw new SnapshotInvalidError(
        "对比结果缺少快照引用", "CompareSnapshotsUseCase.validateComparisonOutput()", "result",
      );
    }
  }
}

// ─── 输入类型 ─────────────────────────────────────

/**
 * @contract SaveSnapshotInput — 保存快照的输入参数。
 *
 * 前置: 所有字段由调用方从仿真引擎和 UI 状态中提取
 * 后置: 传入 SaveSnapshotUseCase.execute()
 * 输入约束: 见各字段注解
 * 输出约束: 无
 * 异常: 无
 * Side Effects: 无
 */
export interface SaveSnapshotInput {
  params: PendulumParams;
  stateVector: StateVector;
  trail: number[];
  canvas: HTMLCanvasElement;
  mode: AppMode;
  cameraConfig: CameraConfig;
  simTime: number;
  label?: string;
}
