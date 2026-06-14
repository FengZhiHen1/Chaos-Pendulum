# control — ViewModel 层

## 职责
全局控制的跨介质 UI 状态——导航锁定状态、参数校验错误状态。

## 依赖方向
- 可以依赖: ../application/useCases/、../contracts/
- 禁止依赖: ../view/
- 被依赖方: ../view/

## 设计决策
- 导航锁定/解锁状态由 useAppStore 管理（shared/domain/valueObjects/app.ts 的 ModeRegistry）
- 如需独立 slice，在此创建

## 内容清单
### stores/
- 导航控制状态（待实现，当前委托给 useAppStore）

### hooks/
- 参数面板控制 Hook（待实现）
