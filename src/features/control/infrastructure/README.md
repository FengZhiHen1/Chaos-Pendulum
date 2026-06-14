# control — Infrastructure 层

## 职责
全局控制的基础设施实现——参数持久化存储、导航状态序列化。

## 依赖方向
- 可以依赖: ../application/ports/、../contracts/、shared/infrastructure/storage/
- 禁止依赖: ../viewModel/、../view/
- 被依赖方: ../viewModel/（依赖注入）

## 设计决策
- 目前参数持久化和导航序列化委托给 shared/infrastructure/storage/

## 内容清单
### repositories/
- 参数持久化仓库（待实现）
