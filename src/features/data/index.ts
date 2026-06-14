/**
 * data 功能域的 barrel 出口。
 *
 * 导出所有 Application 层用例、Infrastructure 层实现和 Domain 层实体。
 */

// ─── Store ─────────────────────────────────────
export { useDataStore } from "./store";

// ─── Domain 层 ─────────────────────────────────
export { RingBuffer } from "./domain/valueObjects/RingBuffer";

// ─── DAT-01: 快照 ──────────────────────────────
export { SaveSnapshotUseCaseImpl } from "./application/useCases/SaveSnapshotUseCase";
export { LoadSnapshotUseCaseImpl } from "./application/useCases/LoadSnapshotUseCase";
export { CompareSnapshotsUseCaseImpl } from "./application/useCases/CompareSnapshotsUseCase";
export { snapshotRepository } from "./infrastructure/repositories/snapshotDb";
export { thumbnailGenerator, generateThumbnail } from "./infrastructure/storage/thumbnailGenerator";

// ─── DAT-02: 数据导出 ──────────────────────────
export { ExportDataUseCaseImpl } from "./application/useCases/ExportDataUseCase";
export { csvExporter } from "./infrastructure/export/csvExporter";
export { jsonExporter } from "./infrastructure/export/jsonExporter";
export { pngExporter } from "./infrastructure/export/pngExporter";
// 向后兼容的独立函数
export { exportCSV } from "./infrastructure/export/csvExporter";
export { exportJSON } from "./infrastructure/export/jsonExporter";
export { exportPNG } from "./infrastructure/export/pngExporter";

// ─── STY-01: 故事脚本引擎 ──────────────────────
export { StoryScriptEngineImpl } from "./application/useCases/StoryScriptEngineImpl";
export { storyScriptRepository } from "./application/repositories/StoryScriptRepository";

// ─── STY-02: 演示模式 ──────────────────────────
export { DemoModeManagerImpl } from "./application/useCases/DemoModeManagerImpl";
export { OrbitControlsAdapter } from "./infrastructure/adapters/OrbitControlsAdapter";
export { WatermarkRendererImpl } from "./infrastructure/adapters/WatermarkRendererImpl";
export { UIVisibilityControllerImpl } from "./infrastructure/adapters/UIVisibilityControllerImpl";

// ─── DAT-03: 历史回放与分叉 ────────────────────
export { HistoryPlaybackUseCaseImpl } from "./application/useCases/HistoryPlaybackUseCaseImpl";
export { ForkSimulationUseCaseImpl } from "./application/useCases/ForkSimulationUseCaseImpl";
