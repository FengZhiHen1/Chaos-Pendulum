# simulation — ViewModel 层

## 职责
仿真功能的 UI 状态管理层——Zustand Store、React Hook、Presenter 数据转换。

## 依赖方向
- 可以依赖: ../application/（用例调用）、../domain/（类型引用）
- 禁止依赖: ../view/、../infrastructure/ 实现、axios
- 被依赖方: ../view/（组件）、其他 feature 的 viewModel/

## 设计决策
- Store 是仿真数据的唯一真相源（StateVector/参数/能量/Worker状态）
- Hook 封装 UseCase 调用 + UI 状态管理（isLoading/error）
- Presenter 将领域数据转换为视图就绪格式

## 内容清单
### stores/
- `simulationStore.ts`: Zustand Store（参数/状态向量/能量/Worker 消息总线）

### hooks/
- `useSimulationControls.ts`: 开始/暂停/重置 UI 控制
- `useEnergyMonitor.ts`: 能量实时监控 + 漂移检测
- `usePhaseSpace.ts`: 相空间数据收集
- `useAutoPause.ts`: 后台自动暂停（from system）
- `useLongRunningDetector.ts`: 长运行降级检测（from system）
- `useWorkerRecovery.ts`: Worker 崩溃恢复（from system）

### presenters/
- `ParameterPresenter.ts`: 参数验证、格式化、单位转换
