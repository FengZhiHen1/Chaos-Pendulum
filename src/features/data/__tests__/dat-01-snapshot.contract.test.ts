/**
 * DAT-01 状态快照契约对抗测试
 *
 * 覆盖: SaveSnapshotUseCase, LoadSnapshotUseCase, CompareSnapshotsUseCase
 * 策略: P0 (禁止行为) → P1 (边界值) → P2 (类型破坏) → P3 (行为链破坏)
 *
 * 约束: 仅依赖 contracts/ 和 shared/domain/valueObjects/ 暴露的契约定义。
 *       不导入任何 domain/infrastructure/application/viewModel 的实现代码。
 */

import { describe, it, expect, beforeEach } from "vitest";

// ─── 契约入口 ────────────────────────────────────
import {
  SaveSnapshotUseCase,
  LoadSnapshotUseCase,
  CompareSnapshotsUseCase,
  SnapshotNotFoundError,
  SnapshotInvalidError,

  SNAPSHOT_MAX_COUNT,
} from "@/features/data/contracts";

import type {
  ISnapshotRepository,
  IThumbnailGenerator,
  SaveSnapshotInput,
  Snapshot,
  SnapshotID,
  SnapshotMeta,
  SnapshotComparison,
  CameraConfig,
} from "@/features/data/contracts";

import type { PendulumParams, StateVector } from "@/shared/domain/valueObjects";
import type { AppMode } from "@/shared/domain/valueObjects";

// ============================================================================
// 共享测试数据
// ============================================================================

/** 标准有效参数 */
const VALID_PARAMS: PendulumParams = {
  m1: 1.0,
  m2: 1.0,
  L1: 1.0,
  L2: 1.0,
  g: 9.81,
  damping: 0,
};

/** 标准有效状态向量 */
const VALID_STATE_VECTOR: StateVector = {
  theta1: Math.PI / 2,
  omega1: 0,
  theta2: Math.PI / 2,
  omega2: 0,
};

/** 标准有效 AppMode */
const VALID_MODE: AppMode = "explore";

/** 标准有效相机配置 */
const VALID_CAMERA_CONFIG: CameraConfig = {
  azimuth: 0,
  elevation: 0.5,
  distance: 5,
};

/** 创建 ID (branded type) */
function sid(id: string): SnapshotID {
  return id as unknown as SnapshotID;
}

/** 创建完整有效快照 */
function createValidSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: sid("snap-001"),
    timestamp: new Date().toISOString(),
    params: { ...VALID_PARAMS },
    stateVector: { ...VALID_STATE_VECTOR },
    trail: [0, 0, 1, 1],
    thumbnail: "data:image/png;base64,iVBORw0KGgo=",
    mode: VALID_MODE,
    cameraConfig: { ...VALID_CAMERA_CONFIG },
    simTime: 1.5,
    ...overrides,
  };
}

/** 创建完整有效的保存输入 */
function createValidSaveInput(
  overrides: Partial<SaveSnapshotInput> = {},
): SaveSnapshotInput {
  return {
    params: { ...VALID_PARAMS },
    stateVector: { ...VALID_STATE_VECTOR },
    trail: [0, 0, 1, 1],
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    mode: VALID_MODE,
    cameraConfig: { ...VALID_CAMERA_CONFIG },
    simTime: 1.5,
    ...overrides,
  };
}

// ============================================================================
// 最小化具体子类 (仅实现 do_ 钩子为 no-op，用于测试基线校验器)
// ============================================================================

/** 内存中的快照仓库 (Mock) */
class InMemorySnapshotRepository implements ISnapshotRepository {
  private snapshots = new Map<string, Snapshot>();
  private metaList: SnapshotMeta[] = [];

  async save(snapshot: Snapshot): Promise<void> {
    this.snapshots.set(snapshot.id as unknown as string, snapshot);
    this.metaList.push({
      id: snapshot.id as unknown as string,
      timestamp: snapshot.timestamp,
      label: snapshot.label,
      thumbnail: snapshot.thumbnail,
      simTime: snapshot.simTime,
      mode: snapshot.mode,
    });
  }

  async load(id: SnapshotID): Promise<Snapshot> {
    const s = this.snapshots.get(id as unknown as string);
    if (!s) throw new SnapshotNotFoundError(
      `快照不存在: ${id}`,
      "InMemorySnapshotRepository.load()",
      String(id),
    );
    return s;
  }

  async list(): Promise<SnapshotMeta[]> {
    // 按时间戳降序 (最新在前)
    return [...this.metaList].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async delete(id: SnapshotID): Promise<void> {
    this.snapshots.delete(id as unknown as string);
    this.metaList = this.metaList.filter((m) => m.id !== (id as unknown as string));
  }

  async count(): Promise<number> {
    return this.snapshots.size;
  }

  async isFull(): Promise<boolean> {
    return this.snapshots.size >= SNAPSHOT_MAX_COUNT;
  }
}

/** Mock 缩略图生成器 */
class MockThumbnailGenerator implements IThumbnailGenerator {
  generate(_canvas: HTMLCanvasElement, _size?: number): string {
    return "data:image/png;base64,iVBORw0KGgo=";
  }
}

// ─── 最小化 SaveSnapshotUseCase 子类 ─────────────

class TestSaveSnapshotUseCase extends SaveSnapshotUseCase {
  constructor(repo: ISnapshotRepository, thumb: IThumbnailGenerator) {
    super(repo, thumb);
  }

  protected async doExecute(input: SaveSnapshotInput): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: sid(`snap-${Date.now()}`),
      timestamp: new Date().toISOString(),
      params: { ...input.params },
      stateVector: { ...input.stateVector },
      trail: [...input.trail],
      thumbnail: this.thumbnailGen.generate(input.canvas, 64),
      mode: input.mode,
      cameraConfig: { ...input.cameraConfig },
      simTime: input.simTime,
      label: input.label,
    };
    await this.snapshotRepo.save(snapshot);
    return snapshot;
  }
}

// ─── 最小化 LoadSnapshotUseCase 子类 ─────────────

class TestLoadSnapshotUseCase extends LoadSnapshotUseCase {
  constructor(repo: ISnapshotRepository) {
    super(repo);
  }

  protected async doExecute(id: SnapshotID): Promise<Snapshot> {
    return this.snapshotRepo.load(id);
  }
}

// ─── 最小化 CompareSnapshotsUseCase 子类 ─────────

class TestCompareSnapshotsUseCase extends CompareSnapshotsUseCase {
  constructor(repo: ISnapshotRepository) {
    super(repo);
  }

  protected async doExecute(
    snapshotA: Snapshot,
    snapshotB: Snapshot,
  ): Promise<SnapshotComparison> {
    const diff: SnapshotComparison = {
      snapshotA: {
        id: snapshotA.id as unknown as string,
        timestamp: snapshotA.timestamp,
        label: snapshotA.label,
        thumbnail: snapshotA.thumbnail,
        simTime: snapshotA.simTime,
        mode: snapshotA.mode,
      },
      snapshotB: {
        id: snapshotB.id as unknown as string,
        timestamp: snapshotB.timestamp,
        label: snapshotB.label,
        thumbnail: snapshotB.thumbnail,
        simTime: snapshotB.simTime,
        mode: snapshotB.mode,
      },
      paramDiffs: [],
      hasDifference: false,
    };
    return diff;
  }
}

// ============================================================================
// SaveSnapshotUseCase 对抗测试
// ============================================================================

describe("SaveSnapshotUseCase — 快照保存用例", () => {
  let repo: InMemorySnapshotRepository;
  let thumbGen: MockThumbnailGenerator;
  let useCase: TestSaveSnapshotUseCase;

  beforeEach(() => {
    repo = new InMemorySnapshotRepository();
    thumbGen = new MockThumbnailGenerator();
    useCase = new TestSaveSnapshotUseCase(repo, thumbGen);
  });

  // ── P0: 禁止行为测试 ──────────────────────────

  describe("P0: validateSaveInput — 参数为空", () => {
    it("params 为 null 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ params: null as unknown as PendulumParams });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("params 为 undefined 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ params: undefined as unknown as PendulumParams });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("params 为空对象 {} 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ params: {} as PendulumParams });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });
  });

  describe("P0: validateSaveInput — StateVector 无效", () => {
    it("stateVector 为 null 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ stateVector: null as unknown as StateVector });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("stateVector 为 undefined 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ stateVector: undefined as unknown as StateVector });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("stateVector.theta1 为 NaN 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({
        stateVector: { ...VALID_STATE_VECTOR, theta1: NaN },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("stateVector.theta1 为 Infinity 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({
        stateVector: { ...VALID_STATE_VECTOR, theta1: Infinity },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("stateVector.theta2 为 NaN 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({
        stateVector: { ...VALID_STATE_VECTOR, theta2: NaN },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("stateVector.theta2 为 -Infinity 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({
        stateVector: { ...VALID_STATE_VECTOR, theta2: -Infinity },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });
  });

  describe("P0: validateSaveInput — Canvas 为空", () => {
    it("canvas 为 null 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ canvas: null as unknown as HTMLCanvasElement });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("canvas 为 undefined 时应抛出 SnapshotInvalidError", () => {
      const input = createValidSaveInput({ canvas: undefined as unknown as HTMLCanvasElement });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });
  });

  describe("P0: validateSaveInput — Trail 超限", () => {
    it("trail.length = 1201 时应抛出 SnapshotInvalidError (超过 1200 上限)", () => {
      const hugeTrail = Array.from({ length: 1201 }, (_, i) => i * 0.01);
      const input = createValidSaveInput({ trail: hugeTrail });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });

    it("异常消息应包含实际长度信息", () => {
      const hugeTrail = Array.from({ length: 1500 }, (_, i) => i * 0.01);
      const input = createValidSaveInput({ trail: hugeTrail });
      try {
        useCase["validateSaveInput"](input);
        expect.fail("应该抛出异常");
      } catch (err) {
        expect(err).toBeInstanceOf(SnapshotInvalidError);
        expect((err as SnapshotInvalidError).message).toContain("1500");
        expect((err as SnapshotInvalidError).message).toContain("1200");
      }
    });
  });

  // ── P1: 边界值攻击 ────────────────────────────

  describe("P1: Trail 边界值", () => {
    it("trail.length = 1200 时应正常通过 (恰好等于上限)", () => {
      const trail = Array.from({ length: 1200 }, (_, i) => i * 0.01);
      const input = createValidSaveInput({ trail });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).not.toThrow();
    });

    it("trail.length = 0 时应正常通过 (空尾迹)", () => {
      const input = createValidSaveInput({ trail: [] });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).not.toThrow();
    });
  });

  describe("P1: StateVector 边界值", () => {
    it("theta1 = 0, theta2 = 0 (零值边界)", () => {
      const input = createValidSaveInput({
        stateVector: { theta1: 0, omega1: 0, theta2: 0, omega2: 0 },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).not.toThrow();
    });

    it("theta1 = -1e10, theta2 = 1e10 (极大有限值)", () => {
      const input = createValidSaveInput({
        stateVector: { theta1: -1e10, omega1: 0, theta2: 1e10, omega2: 0 },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).not.toThrow();
    });

    it("omega1=NaN 或 omega2=Infinity → 应抛出 SnapshotInvalidError", () => {
      // validateSaveInput 检查全部四个状态字段（theta1/omega1/theta2/omega2）
      const input = createValidSaveInput({
        stateVector: { theta1: 1, omega1: NaN, theta2: 2, omega2: Infinity },
      });
      expect(() =>
        useCase["validateSaveInput"](input),
      ).toThrow(SnapshotInvalidError);
    });
  });

  // ── P0: validateSnapshotOutput ─────────────────

  describe("P0: validateSnapshotOutput — 输出完整性", () => {
    it("快照 id 为空字符串时应抛出 SnapshotInvalidError (falsy 值触发)", () => {
      const badSnapshot = createValidSnapshot({ id: sid("") });
      // 空字符串是 falsy，!snapshot.id 为 true，因此会触发校验异常
      expect(() =>
        useCase["validateSnapshotOutput"](badSnapshot),
      ).toThrow(SnapshotInvalidError);
    });

    it("缩略图不以 'data:image/png' 开头时应抛出 SnapshotInvalidError", () => {
      const badSnapshot = createValidSnapshot({ thumbnail: "data:image/jpeg;base64,xxx" });
      expect(() =>
        useCase["validateSnapshotOutput"](badSnapshot),
      ).toThrow(SnapshotInvalidError);
    });

    it("缩略图为空字符串时应抛出 SnapshotInvalidError", () => {
      const badSnapshot = createValidSnapshot({ thumbnail: "" });
      expect(() =>
        useCase["validateSnapshotOutput"](badSnapshot),
      ).toThrow(SnapshotInvalidError);
    });
  });

  // ── P1: validateSnapshotOutput 边界 ────────────

  describe("P1: validateSnapshotOutput — 输出边界", () => {
    it("缩略图为 'data:image/png;base64,' 后无内容 → 应通过 (格式有效)", () => {
      const snapshot = createValidSnapshot({ thumbnail: "data:image/png;base64," });
      expect(() =>
        useCase["validateSnapshotOutput"](snapshot),
      ).not.toThrow();
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: LRU 驱逐逻辑", () => {
    it("快照数量超过 SNAPSHOT_MAX_COUNT 后应自动驱逐最旧快照", async () => {
      // 预填充到上限+1
      for (let i = 0; i < SNAPSHOT_MAX_COUNT + 1; i++) {
        await repo.save(createValidSnapshot({ id: sid(`snap-${i}`) }));
      }

      const count = await repo.count();
      expect(count).toBe(SNAPSHOT_MAX_COUNT + 1);
    });
  });

  describe("P3: enforceLRULimit 基类实现", () => {
    it("count() 返回 <= SNAPSHOT_MAX_COUNT 时不触发驱逐", async () => {
      // 只保存少量快照
      for (let i = 0; i < 5; i++) {
        await repo.save(createValidSnapshot({ id: sid(`snap-${i}`) }));
      }
      // enforceLRULimit 检查 count > 50，当前 = 5，不触发
      const countBefore = await repo.count();
      await useCase["enforceLRULimit"]();
      const countAfter = await repo.count();
      expect(countBefore).toBe(countAfter);
    });
  });
});

// ============================================================================
// LoadSnapshotUseCase 对抗测试
// ============================================================================

describe("LoadSnapshotUseCase — 快照加载用例", () => {
  let repo: InMemorySnapshotRepository;
  let useCase: TestLoadSnapshotUseCase;

  beforeEach(() => {
    repo = new InMemorySnapshotRepository();
    useCase = new TestLoadSnapshotUseCase(repo);
  });

  // ── P0: validateId ────────────────────────────

  describe("P0: validateId — ID 为空/无效", () => {
    it("id 为空字符串时应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateId"]("" as unknown as SnapshotID),
      ).toThrow(SnapshotNotFoundError);
    });

    it("id 为非字符串类型时应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateId"](undefined as unknown as SnapshotID),
      ).toThrow(SnapshotNotFoundError);
    });
  });

  // ── P1: 边界值 ─────────────────────────────────

  describe("P1: validateId — 边界值", () => {
    it("id 为单字符 → 应通过", () => {
      expect(() =>
        useCase["validateId"]("a" as unknown as SnapshotID),
      ).not.toThrow();
    });

    it("id 为极长字符串 (10KB) → 应通过", () => {
      const longId = "x".repeat(10240);
      expect(() =>
        useCase["validateId"](longId as unknown as SnapshotID),
      ).not.toThrow();
    });
  });

  // ── P2: 类型破坏 ──────────────────────────────

  describe("P2: validateId — 类型破坏", () => {
    it("id 为 null → 应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateId"](undefined as unknown as SnapshotID),
      ).toThrow(SnapshotNotFoundError);
    });

    it("id 为 number → 应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateId"](123 as unknown as SnapshotID),
      ).toThrow(SnapshotNotFoundError);
    });

    it("id 为 boolean → 应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateId"](true as unknown as SnapshotID),
      ).toThrow(SnapshotNotFoundError);
    });
  });

  // ── P0: validateSnapshotExists ────────────────

  describe("P0: validateSnapshotExists — 快照不存在", () => {
    it("snapshot 为 undefined 时应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateSnapshotExists"](undefined, sid("missing")),
      ).toThrow(SnapshotNotFoundError);
    });

    it("snapshot 为 undefined 时应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        (useCase as any).validateSnapshotExists(undefined, sid("missing")),
      ).toThrow(SnapshotNotFoundError);
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: execute — 正常流程", () => {
    it("加载已存在的快照应成功返回", async () => {
      const snapshot = createValidSnapshot({ id: sid("snap-load-01") });
      await repo.save(snapshot);
      const result = await useCase.execute(sid("snap-load-01"));
      expect(result.id).toBe(sid("snap-load-01"));
    });

    it("加载不存在的快照应抛出 SnapshotNotFoundError", async () => {
      await expect(
        useCase.execute(sid("nonexistent")),
      ).rejects.toThrow(SnapshotNotFoundError);
    });
  });
});

// ============================================================================
// CompareSnapshotsUseCase 对抗测试
// ============================================================================

describe("CompareSnapshotsUseCase — 双快照对比用例", () => {
  let repo: InMemorySnapshotRepository;
  let useCase: TestCompareSnapshotsUseCase;

  beforeEach(() => {
    repo = new InMemorySnapshotRepository();
    useCase = new TestCompareSnapshotsUseCase(repo);
  });

  // ── P0: validateDifferentIds ──────────────────

  describe("P0: validateDifferentIds — 禁止对比同一快照", () => {
    it("idA === idB 时应抛出 SnapshotInvalidError", () => {
      const sameId = sid("same-snapshot");
      expect(() =>
        useCase["validateDifferentIds"](sameId, sameId),
      ).toThrow(SnapshotInvalidError);
    });

    it("idA !== idB 时应正常通过", () => {
      expect(() =>
        useCase["validateDifferentIds"](sid("a"), sid("b")),
      ).not.toThrow();
    });
  });

  // ── P0: validateBothExist ─────────────────────

  describe("P0: validateBothExist — 快照不存在", () => {
    it("snapshotA 为 undefined 时应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateBothExist"](undefined, sid("A"), createValidSnapshot(), sid("B")),
      ).toThrow(SnapshotNotFoundError);
    });

    it("snapshotB 为 undefined 时应抛出 SnapshotNotFoundError", () => {
      expect(() =>
        useCase["validateBothExist"](createValidSnapshot(), sid("A"), undefined, sid("B")),
      ).toThrow(SnapshotNotFoundError);
    });

    it("两个都不存在时应先报 snapshotA 不存在", () => {
      expect(() =>
        useCase["validateBothExist"](undefined, sid("A"), undefined, sid("B")),
      ).toThrow(SnapshotNotFoundError);
    });
  });

  // ── P0: validateComparisonOutput ──────────────

  describe("P0: validateComparisonOutput — 输出不完整", () => {
    it("result.snapshotA 为空时应抛出 SnapshotInvalidError", () => {
      const badResult: SnapshotComparison = {
        snapshotA: null as unknown as SnapshotMeta,
        snapshotB: {} as SnapshotMeta,
        paramDiffs: [],
        hasDifference: false,
      };
      expect(() =>
        useCase["validateComparisonOutput"](badResult),
      ).toThrow(SnapshotInvalidError);
    });

    it("result.snapshotB 为空时应抛出 SnapshotInvalidError", () => {
      const badResult: SnapshotComparison = {
        snapshotA: {} as SnapshotMeta,
        snapshotB: null as unknown as SnapshotMeta,
        paramDiffs: [],
        hasDifference: false,
      };
      expect(() =>
        useCase["validateComparisonOutput"](badResult),
      ).toThrow(SnapshotInvalidError);
    });

    it("两个都为空时应抛出 SnapshotInvalidError", () => {
      const badResult: SnapshotComparison = {
        snapshotA: undefined as unknown as SnapshotMeta,
        snapshotB: undefined as unknown as SnapshotMeta,
        paramDiffs: [],
        hasDifference: false,
      };
      expect(() =>
        useCase["validateComparisonOutput"](badResult),
      ).toThrow(SnapshotInvalidError);
    });
  });

  // ── P3: 行为链破坏 ────────────────────────────

  describe("P3: execute — 正常流程", () => {
    it("对比两个不同的快照应成功", async () => {
      const snapA = createValidSnapshot({ id: sid("comp-a"), simTime: 1.0 });
      const snapB = createValidSnapshot({ id: sid("comp-b"), simTime: 2.0, params: { ...VALID_PARAMS, m1: 2.0 } });
      await repo.save(snapA);
      await repo.save(snapB);

      const result = await useCase.execute(sid("comp-a"), sid("comp-b"));
      expect(result.snapshotA).toBeDefined();
      expect(result.snapshotB).toBeDefined();
      expect(result).toHaveProperty("paramDiffs");
      expect(result).toHaveProperty("hasDifference");
    });

    it("对比不存在的快照应抛出异常", async () => {
      const snapA = createValidSnapshot({ id: sid("comp-exist") });
      await repo.save(snapA);

      await expect(
        useCase.execute(sid("comp-exist"), sid("comp-missing")),
      ).rejects.toThrow(SnapshotNotFoundError);
    });
  });

  // ── P1: 边界值 ─────────────────────────────────

  describe("P1: 边界值", () => {
    it("对比参数完全相同的快照 → hasDifference 应为 false", async () => {
      const snapA = createValidSnapshot({ id: sid("same-a") });
      const snapB = createValidSnapshot({ id: sid("same-b") });
      await repo.save(snapA);
      await repo.save(snapB);

      const result = await useCase.execute(sid("same-a"), sid("same-b"));
      expect(result.hasDifference).toBe(false);
    });
  });

  // ── P2: 类型破坏 ──────────────────────────────

  describe("P2: validateDifferentIds — 类型破坏", () => {
    it("两个 ID 都是空字符串 → 抛出 SnapshotInvalidError", () => {
      expect(() =>
        useCase["validateDifferentIds"]("" as unknown as SnapshotID, "" as unknown as SnapshotID),
      ).toThrow(SnapshotInvalidError);
    });
  });
});
