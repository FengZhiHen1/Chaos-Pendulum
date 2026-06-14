/**
 * data.contracts — 演示与数据管理功能域的契约聚合出口。
 *
 * 吸收 5 个子模块：STY-01 故事脚本引擎、STY-02 演示模式、
 * DAT-01 状态快照、DAT-02 数据导出、DAT-03 历史回放与分叉。
 *
 * 提供 N 大契约：
 * 1. story-script: 故事脚本引擎（7 阶段自动演示，ABC 模板方法）
 * 2. demo-mode: 演示模式管理器（大屏纯净视图 + 自动巡游，ABC 模板方法）
 * 3. snapshot: 快照保存/加载/对比用例（ABC + 仓储端口）
 * 4. data-export: 数据导出用例（CSV/JSON/PNG，策略模式 + 校验器）
 * 5. history-playback: 历史回放与分叉用例（RingBuffer 随机访问 + Worker 分叉）
 *
 * 核心类型：
 *   - StoryStage: 故事阶段定义（时间/模式/字幕/高亮/相机/参数）
 *   - Snapshot: 完整快照实体（参数 + 状态 + 尾迹 + 缩略图）
 *   - SnapshotMeta: 快照列表元数据（轻量视图）
 *   - DemoModeConfig: 演示模式配置（autoRotate/水印/空闲超时）
 *   - ExportFormat: 导出格式枚举（csv | json | png）
 *   - PlaybackState: 回放状态（当前时间/总时长/RingBuffer 容量）
 *   - ForkConfig: 分叉配置（时间点/初始状态/修改参数）
 *   - GhostTrailConfig: 幽灵尾迹配置（透明度/颜色/轨迹数据）
 *
 * 端口接口：
 *   - IStoryScriptRepository: 故事脚本仓储
 *   - ISnapshotRepository: 快照持久化仓储
 *   - IThumbnailGenerator: 缩略图生成器
 *   - IExporter<T>: 数据导出器（策略接口）
 *   - IOrbitControlsAdapter: 相机轨道控制适配器
 *   - IWatermarkRenderer: 水印渲染器
 *   - IUIVisibilityController: UI 可见性控制
 *   - IRingBufferReader: RingBuffer 只读访问
 *
 * 异常层次：
 *   - DataError → SnapshotNotFoundError | SnapshotFullError | SnapshotInvalidError
 *              | DataExportError | PlaybackOutOfRangeError | PlaybackNotPausedError
 *              | ForkError | StoryScriptError | DemoModeError | StorageError
 *
 * Usage:
 *     import { StoryScriptEngine, IStoryScriptRepository } from "@/features/data/contracts";
 *     import { SaveSnapshotUseCase, ISnapshotRepository } from "@/features/data/contracts";
 *     import { DataError, SnapshotNotFoundError } from "@/features/data/contracts";
 *     import type { Snapshot, StoryStage, ExportFormat } from "@/features/data/contracts";
 */

// ─── 类型定义 ─────────────────────────────────────

export type {
  // 品牌类型
  SnapshotID,
  ScriptVersion,
  // STY-01: 故事脚本
  StoryStage,
  CameraConfig,
  StoryPlaybackState,
  // STY-02: 演示模式
  DemoModeConfig,
  // DAT-01: 快照
  Snapshot,
  SnapshotMeta,
  SnapshotComparison,
  ParamDiff,
  // DAT-02: 导出
  ExportFormat,
  CSVExportConfig,
  JSONExportConfig,
  PNGExportConfig,
  // DAT-03: 回放与分叉
  PlaybackState,
  ForkConfig,
  GhostTrailConfig,
} from "./types.contract";

export {
  // 常量
  DEFAULT_DEMO_CONFIG,
  SNAPSHOT_DB_NAME,
  SNAPSHOT_DB_VERSION,
  SNAPSHOT_STORE_NAME,
  SNAPSHOT_MAX_COUNT,
  RING_BUFFER_CAPACITY,
  STORY_TOTAL_DURATION,
  STORY_STAGE_COUNT,
  PNG_MAX_RESOLUTION,
  THUMBNAIL_SIZE,
  CSV_FIELD_COUNT,
  CSV_HEADERS,
} from "./types.contract";

// ─── 异常 ─────────────────────────────────────────

export {
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
} from "./exceptions";

export type { DataErrorCode } from "./exceptions";

// ─── STY-01: 故事脚本引擎 ─────────────────────────

export { StoryScriptEngine } from "./story-script.contract";
export type { IStoryScriptRepository } from "./story-script.contract";

// ─── STY-02: 演示模式 ─────────────────────────────

export { DemoModeManager } from "./demo-mode.contract";
export type {
  IOrbitControlsAdapter,
  IWatermarkRenderer,
  IUIVisibilityController,
} from "./demo-mode.contract";

// ─── DAT-01: 状态快照 ─────────────────────────────

export {
  SaveSnapshotUseCase,
  LoadSnapshotUseCase,
  CompareSnapshotsUseCase,
} from "./snapshot.contract";
export type {
  ISnapshotRepository,
  IThumbnailGenerator,
  SaveSnapshotInput,
} from "./snapshot.contract";

// ─── DAT-02: 数据导出 ─────────────────────────────

export { ExportDataUseCase, validateCSVConfig, validateJSONConfig, validatePNGConfig } from "./data-export.contract";
export type { IExporter } from "./data-export.contract";

// ─── DAT-03: 历史回放与分叉 ───────────────────────

export {
  HistoryPlaybackUseCase,
  ForkSimulationUseCase,
  extractStateAtTime,
  createDefaultGhostTrail,
} from "./history-playback.contract";
export type { IRingBufferReader } from "./history-playback.contract";
