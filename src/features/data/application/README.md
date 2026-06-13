# data — Application 层

## 职责
数据功能的用例编排——快照保存/恢复、数据导出。

## 依赖方向
- 可以依赖: ../domain/
- 禁止依赖: React、Zustand、../viewModel/、../infrastructure/实现
- 被依赖方: ../viewModel/

## 内容清单
### useCases/
- `SaveSnapshot.ts`: 保存快照用例
- `ExportData.ts`: 数据导出用例

### ports/
- `ISnapshotRepository.ts`: 快照持久化接口
