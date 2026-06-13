# data — Domain 层

## 职责
数据与记录系统的纯领域逻辑——环形缓冲区数据结构、快照实体定义。

## 依赖方向
- 可以依赖: shared/domain/valueObjects/
- 禁止依赖: React、Zustand、IndexedDB API
- 被依赖方: application/、viewModel/

## 内容清单
- `valueObjects/RingBuffer.ts`: 固定容量环形缓冲区（← ring-buffer/ring-buffer.ts）
- `entities/SnapshotEntity.ts`: 快照实体类型定义
