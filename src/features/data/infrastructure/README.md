# data — Infrastructure 层

## 职责
数据功能的基础设施实现——IndexedDB 快照持久化、缩略图生成、CSV/JSON/PNG 导出。

## 依赖方向
- 可以依赖: ../application/ports/、../domain/
- 禁止依赖: ../viewModel/、../view/
- 被依赖方: ../viewModel/（通过 Application 端口消费）

## 内容清单
### repositories/
- `IndexedDBSnapshotRepo.ts`: IndexedDB 快照 CRUD（← snapshot/snapshot-db.ts）

### storage/
- `ThumbnailGenerator.ts`: Canvas 64px 缩略图生成（← snapshot/thumbnail.ts）

### export/
- `CsvExporter.ts`: CSV 导出（← export/csv-export.ts）
- `JsonExporter.ts`: JSON 导出（← export/json-export.ts）
- `PngExporter.ts`: PNG 导出（← export/png-export.ts）
