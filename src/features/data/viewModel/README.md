# data — ViewModel 层

## 职责
数据功能的 UI 状态管理——将 Application 层的 UseCase 包装为 React Hook，
管理 isLoading / error / data 等跨介质 UI 状态，暴露给 View 层消费。

## 依赖方向
- 可以依赖: ../application/、../domain/、../contracts/、../infrastructure/（仅端口实现实例化）
- 禁止依赖: ../view/、直接操作 DOM
- 被依赖方: ../view/

## 设计决策
- 每个 ViewModel Hook 独立管理自己的 UI 状态（不合并到全局 Store）
- UseCase 实例在模块作用域创建为单例——无状态的 UseCase 不需要每次渲染重建
- Hook 返回扁平对象（状态 + 操作）供 View 通过 Props 衔接契约消费
- 错误状态在每次操作前自动清除（optimistic clear）

## 内容清单

### hooks/
- `useSnapshotViewModel.ts`: 快照保存/加载/对比 —— 封装 SaveSnapshotUseCase + LoadSnapshotUseCase + CompareSnapshotsUseCase
- `useExportViewModel.ts`: 数据导出（CSV/JSON/PNG）—— 封装 ExportDataUseCase
- `useStoryViewModel.ts`: 故事脚本播放 —— 封装 StoryScriptEngineImpl（250ms 轮询刷新）
- `useDemoModeViewModel.ts`: 演示模式激活/退出/空闲检测 —— 封装 DemoModeManagerImpl
- `useHistoryPlaybackViewModel.ts`: 历史回放与分叉 —— 封装 HistoryPlaybackUseCaseImpl + ForkSimulationUseCaseImpl

### stores/
- `dataSlice.ts`: Zustand Store Slice（snapshots/replayTime/isReplaying/forkActive 全局状态）

## contract-driven-dev 已完成的 Application 层
所有 UseCase 和端口接口已在 `../application/` 实现。
ViewModel Hook 通过实例化 UseCase + 注入 Infrastructure 实现来完成依赖组装。
