/**
 * 异常层次契约验证测试
 *
 * 覆盖: DataError 基类及所有 9 个子异常
 * 策略: P0 (禁止行为) → P1 (诊断字段完整性) → P2 (类型检查) → P3 (instanceof 链)
 *
 * 约束: 仅依赖 contracts/ 暴露的异常定义。
 */

import { describe, it, expect } from "vitest";

// ─── 异常入口 ────────────────────────────────────
import {
  DataError,
  SnapshotNotFoundError,
  SnapshotFullError,
  SnapshotInvalidError,
  DataExportError,
  PlaybackOutOfRangeError,
  PlaybackNotPausedError,
  ForkError,
  StoryScriptError,
  DemoModeError,
  StorageError,
} from "@/features/data/contracts";



// ============================================================================
// DataError 基类
// ============================================================================

describe("DataError — 基类异常", () => {
  it("正确设置 name 为 'DataError'", () => {
    const err = new DataError("SNAPSHOT_NOT_FOUND", "测试消息", "测试上下文");
    expect(err.name).toBe("DataError");
  });

  it("code 字段可正常读取", () => {
    const err = new DataError("EXPORT_FAILED", "导出失败", "ExportDataUseCase");
    expect(err.code).toBe("EXPORT_FAILED");
  });

  it("message 字段可正常读取", () => {
    const err = new DataError("STORAGE_ERROR", "存储失败", "IndexedDB");
    expect(err.message).toBe("存储失败");
  });

  it("context 字段可正常读取", () => {
    const err = new DataError("PLAYBACK_NOT_PAUSED", "未暂停", "HistoryPlaybackUseCase");
    expect(err.context).toBe("HistoryPlaybackUseCase");
  });

  it("是 Error 的实例", () => {
    const err = new DataError("SNAPSHOT_NOT_FOUND", "msg", "ctx");
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================================
// SnapshotNotFoundError
// ============================================================================

describe("SnapshotNotFoundError — 快照未找到", () => {
  it("name = 'SnapshotNotFoundError'", () => {
    const err = new SnapshotNotFoundError("未找到", "load()", "snap-001");
    expect(err.name).toBe("SnapshotNotFoundError");
  });

  it("code = 'SNAPSHOT_NOT_FOUND'", () => {
    const err = new SnapshotNotFoundError("未找到", "load()", "snap-001");
    expect(err.code).toBe("SNAPSHOT_NOT_FOUND");
  });

  it("snapshotId 字段可读取", () => {
    const err = new SnapshotNotFoundError("未找到", "load()", "snap-xyz-123");
    expect(err.snapshotId).toBe("snap-xyz-123");
  });

  it("是 DataError 的实例", () => {
    const err = new SnapshotNotFoundError("x", "x", "x");
    expect(err).toBeInstanceOf(DataError);
  });

  it("是 Error 的实例", () => {
    const err = new SnapshotNotFoundError("x", "x", "x");
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================================
// SnapshotFullError
// ============================================================================

describe("SnapshotFullError — 快照已满", () => {
  it("name = 'SnapshotFullError'", () => {
    const err = new SnapshotFullError("已满", "save()", 50, 50);
    expect(err.name).toBe("SnapshotFullError");
  });

  it("code = 'SNAPSHOT_FULL'", () => {
    const err = new SnapshotFullError("已满", "save()", 50, 50);
    expect(err.code).toBe("SNAPSHOT_FULL");
  });

  it("maxCount 和 currentCount 字段可读取", () => {
    const err = new SnapshotFullError("已满", "save()", 50, 48);
    expect(err.maxCount).toBe(50);
    expect(err.currentCount).toBe(48);
  });

  it("是 DataError 的实例", () => {
    const err = new SnapshotFullError("x", "x", 0, 0);
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// SnapshotInvalidError
// ============================================================================

describe("SnapshotInvalidError — 快照数据无效", () => {
  it("name = 'SnapshotInvalidError'", () => {
    const err = new SnapshotInvalidError("无效", "validate()", "params");
    expect(err.name).toBe("SnapshotInvalidError");
  });

  it("code = 'SNAPSHOT_INVALID'", () => {
    const err = new SnapshotInvalidError("无效", "validate()", "params");
    expect(err.code).toBe("SNAPSHOT_INVALID");
  });

  it("invalidField 字段可读取", () => {
    const err = new SnapshotInvalidError("无效", "validate()", "stateVector");
    expect(err.invalidField).toBe("stateVector");
  });

  it("是 DataError 的实例", () => {
    const err = new SnapshotInvalidError("x", "x", "x");
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// DataExportError
// ============================================================================

describe("DataExportError — 数据导出失败", () => {
  it("name = 'DataExportError'", () => {
    const err = new DataExportError("EXPORT_FAILED", "失败", "ctx", "csv", "empty_rows");
    expect(err.name).toBe("DataExportError");
  });

  it("code = 'EXPORT_FAILED'", () => {
    const err = new DataExportError("EXPORT_FAILED", "失败", "ctx", "csv", "detail");
    expect(err.code).toBe("EXPORT_FAILED");
  });

  it("code = 'EXPORT_INVALID_CONFIG'", () => {
    const err = new DataExportError("EXPORT_INVALID_CONFIG", "无效配置", "ctx", "png", "invalid_resolution");
    expect(err.code).toBe("EXPORT_INVALID_CONFIG");
  });

  it("format 和 detail 字段可读取", () => {
    const err = new DataExportError("EXPORT_INVALID_CONFIG", "无效", "ctx", "json", "empty_trajectory");
    expect(err.format).toBe("json");
    expect(err.detail).toBe("empty_trajectory");
  });

  it("是 DataError 的实例", () => {
    const err = new DataExportError("EXPORT_FAILED", "x", "x", "x", "x");
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// PlaybackOutOfRangeError
// ============================================================================

describe("PlaybackOutOfRangeError — 回放超出范围", () => {
  it("name = 'PlaybackOutOfRangeError'", () => {
    const err = new PlaybackOutOfRangeError("超范围", "seekTo()", 10, [0, 5]);
    expect(err.name).toBe("PlaybackOutOfRangeError");
  });

  it("code = 'PLAYBACK_OUT_OF_RANGE'", () => {
    const err = new PlaybackOutOfRangeError("超范围", "seekTo()", 10, [0, 5]);
    expect(err.code).toBe("PLAYBACK_OUT_OF_RANGE");
  });

  it("requestedTime 和 availableRange 字段可读取", () => {
    const err = new PlaybackOutOfRangeError("超范围", "seekTo()", 10, [0, 5]);
    expect(err.requestedTime).toBe(10);
    expect(err.availableRange).toEqual([0, 5]);
  });

  it("是 DataError 的实例", () => {
    const err = new PlaybackOutOfRangeError("x", "x", 0, [0, 0]);
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// PlaybackNotPausedError
// ============================================================================

describe("PlaybackNotPausedError — 回放未暂停", () => {
  it("name = 'PlaybackNotPausedError'", () => {
    const err = new PlaybackNotPausedError("未暂停", "seekTo()");
    expect(err.name).toBe("PlaybackNotPausedError");
  });

  it("code = 'PLAYBACK_NOT_PAUSED'", () => {
    const err = new PlaybackNotPausedError("未暂停", "seekTo()");
    expect(err.code).toBe("PLAYBACK_NOT_PAUSED");
  });

  it("没有额外诊断字段 (仅基类字段)", () => {
    const err = new PlaybackNotPausedError("未暂停", "seekTo()");
    expect(err.message).toBe("未暂停");
    expect(err.context).toBe("seekTo()");
  });

  it("是 DataError 的实例", () => {
    const err = new PlaybackNotPausedError("x", "x");
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// ForkError
// ============================================================================

describe("ForkError — 分叉失败", () => {
  it("name = 'ForkError'", () => {
    const err = new ForkError("FORK_INIT_FAILED", "分叉失败", "execute()", 5);
    expect(err.name).toBe("ForkError");
  });

  it("code = 'FORK_INIT_FAILED'", () => {
    const err = new ForkError("FORK_INIT_FAILED", "分叉失败", "execute()", 5);
    expect(err.code).toBe("FORK_INIT_FAILED");
  });

  it("code = 'FORK_OUT_OF_RANGE'", () => {
    const err = new ForkError("FORK_OUT_OF_RANGE", "超出范围", "execute()", 100);
    expect(err.code).toBe("FORK_OUT_OF_RANGE");
  });

  it("forkTime 字段可读取", () => {
    const err = new ForkError("FORK_OUT_OF_RANGE", "超出范围", "execute()", 42.5);
    expect(err.forkTime).toBe(42.5);
  });

  it("是 DataError 的实例", () => {
    const err = new ForkError("FORK_INIT_FAILED", "x", "x", 0);
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// StoryScriptError
// ============================================================================

describe("StoryScriptError — 故事脚本异常", () => {
  it("name = 'StoryScriptError'", () => {
    const err = new StoryScriptError("STORY_SCRIPT_INVALID", "脚本无效", "play()", -1);
    expect(err.name).toBe("StoryScriptError");
  });

  it("code = 'STORY_SCRIPT_INVALID'", () => {
    const err = new StoryScriptError("STORY_SCRIPT_INVALID", "脚本为空", "play()", -1);
    expect(err.code).toBe("STORY_SCRIPT_INVALID");
  });

  it("code = 'STORY_STAGE_TRANSITION'", () => {
    const err = new StoryScriptError("STORY_STAGE_TRANSITION", "转场失败", "advance()", 3);
    expect(err.code).toBe("STORY_STAGE_TRANSITION");
  });

  it("stageIndex 字段可读取", () => {
    const err = new StoryScriptError("STORY_STAGE_TRANSITION", "转场失败", "advance()", 5);
    expect(err.stageIndex).toBe(5);
  });

  it("stageIndex = -1 表示整体脚本错误", () => {
    const err = new StoryScriptError("STORY_SCRIPT_INVALID", "整体错误", "play()", -1);
    expect(err.stageIndex).toBe(-1);
  });

  it("是 DataError 的实例", () => {
    const err = new StoryScriptError("STORY_SCRIPT_INVALID", "x", "x", 0);
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// DemoModeError
// ============================================================================

describe("DemoModeError — 演示模式异常", () => {
  it("name = 'DemoModeError'", () => {
    const err = new DemoModeError("激活失败", "activate()", "already_active");
    expect(err.name).toBe("DemoModeError");
  });

  it("code = 'DEMO_MODE_ACTIVATION'", () => {
    const err = new DemoModeError("激活失败", "activate()", "already_active");
    expect(err.code).toBe("DEMO_MODE_ACTIVATION");
  });

  it("reason 字段可读取", () => {
    const err = new DemoModeError("激活失败", "activate()", "ui_not_hidden");
    expect(err.reason).toBe("ui_not_hidden");
  });

  it("是 DataError 的实例", () => {
    const err = new DemoModeError("x", "x", "x");
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// StorageError
// ============================================================================

describe("StorageError — 持久化存储异常", () => {
  it("name = 'StorageError'", () => {
    const err = new StorageError("存储失败", "open", "open", "chaos-pendulum-snapshots");
    expect(err.name).toBe("StorageError");
  });

  it("code = 'STORAGE_ERROR'", () => {
    const err = new StorageError("存储失败", "open", "open", "chaos-pendulum-snapshots");
    expect(err.code).toBe("STORAGE_ERROR");
  });

  it("operation 和 dbName 字段可读取", () => {
    const err = new StorageError("读失败", "read", "read", "chaos-pendulum-snapshots");
    expect(err.operation).toBe("read");
    expect(err.dbName).toBe("chaos-pendulum-snapshots");
  });

  it("是 DataError 的实例", () => {
    const err = new StorageError("x", "x", "x", "x");
    expect(err).toBeInstanceOf(DataError);
  });
});

// ============================================================================
// 异常层次 instanceof 链验证
// ============================================================================

describe("异常层次 instanceof 链", () => {
  const errorInstances = [
    { label: "SnapshotNotFoundError", err: new SnapshotNotFoundError("x", "x", "x"), expectedCode: "SNAPSHOT_NOT_FOUND" },
    { label: "SnapshotFullError", err: new SnapshotFullError("x", "x", 0, 0), expectedCode: "SNAPSHOT_FULL" },
    { label: "SnapshotInvalidError", err: new SnapshotInvalidError("x", "x", "x"), expectedCode: "SNAPSHOT_INVALID" },
    { label: "DataExportError", err: new DataExportError("EXPORT_FAILED", "x", "x", "x", "x"), expectedCode: "EXPORT_FAILED" },
    { label: "PlaybackOutOfRangeError", err: new PlaybackOutOfRangeError("x", "x", 0, [0, 0]), expectedCode: "PLAYBACK_OUT_OF_RANGE" },
    { label: "PlaybackNotPausedError", err: new PlaybackNotPausedError("x", "x"), expectedCode: "PLAYBACK_NOT_PAUSED" },
    { label: "ForkError", err: new ForkError("FORK_INIT_FAILED", "x", "x", 0), expectedCode: "FORK_INIT_FAILED" },
    { label: "StoryScriptError", err: new StoryScriptError("STORY_SCRIPT_INVALID", "x", "x", 0), expectedCode: "STORY_SCRIPT_INVALID" },
    { label: "DemoModeError", err: new DemoModeError("x", "x", "x"), expectedCode: "DEMO_MODE_ACTIVATION" },
    { label: "StorageError", err: new StorageError("x", "x", "x", "x"), expectedCode: "STORAGE_ERROR" },
  ];

  for (const { label, err, expectedCode } of errorInstances) {
    describe(`${label} 层次验证`, () => {
      it(`是 Error 实例`, () => {
        expect(err).toBeInstanceOf(Error);
      });

      it(`是 DataError 实例`, () => {
        expect(err).toBeInstanceOf(DataError);
      });

      it(`是自身类型实例`, () => {
        expect(err.constructor.name).toBe(label);
      });

      it(`code = '${expectedCode}'`, () => {
        expect(err.code).toBe(expectedCode);
      });
    });
  }

  it("所有子异常都不是 DataError 基类本身", () => {
    // 交叉验证：子异常不是 DataError 的直接实例
    const de = new DataError("SNAPSHOT_NOT_FOUND", "x", "x");
    const sfe = new SnapshotFullError("x", "x", 0, 0);

    // SnapshotFullError 是 DataError 但不是 DataError 的直接构造
    expect(sfe).toBeInstanceOf(DataError);
    expect(de.constructor.name).toBe("DataError");
    expect(sfe.constructor.name).not.toBe("DataError");
  });
});

// ============================================================================
// 不使用 instanceof 而使用诊断字段的验证
// ============================================================================

describe("P3: 禁止 catch 块中解析 error.message", () => {
  it("应通过 code 字段区分异常类型，而非 message", () => {
    const err1 = new SnapshotNotFoundError("快照未找到", "ctx", "id-1");
    const err2 = new DataExportError("EXPORT_FAILED", "导出失败", "ctx", "csv", "detail");

    // 使用 code 字段区分（契约要求）
    if (err1.code === "SNAPSHOT_NOT_FOUND") {
      expect((err1 as SnapshotNotFoundError).snapshotId).toBe("id-1");
    }
    if (err2.code === "EXPORT_FAILED") {
      expect((err2 as DataExportError).format).toBe("csv");
    }
  });
});
