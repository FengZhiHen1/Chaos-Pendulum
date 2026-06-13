# data — ViewModel 层

## 职责
数据功能的 UI 状态管理——快照列表、导出状态、回放位置。

## 依赖方向
- 可以依赖: ../application/、../domain/
- 禁止依赖: ../view/、../infrastructure/实现
- 被依赖方: ../view/

## 内容清单
### stores/
- `dataStore.ts`: Zustand Store（快照列表/导出状态/回放位置）

### hooks/
- (待创建)
