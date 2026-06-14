# control — View 层

## 职责
全局控制的纯表现层——参数面板（当前在 simulation feature 中共享）、导航栏（在 shared view 中）。

## 依赖方向
- 可以依赖: ../viewModel/
- 禁止依赖: ../application/、../domain/、../infrastructure/
- 被依赖方: 路由配置

## 设计决策
- 参数面板当前在 simulation feature 中作为 view 组件实现，由 control contracts 约束
- 未来如需要独立的 control View 组件，在此实现

## 内容清单
### components/
- 全局控制组件（待实现）

### pages/
- 控制面板页面（待实现）

### contracts/
- Props 衔接契约（待 contract-driven-dev 创建）
