# control — Domain 层

## 职责
全局控制的纯领域逻辑——参数校验规则、导航状态机定义。

## 依赖方向
- 可以依赖: shared/domain/valueObjects/
- 禁止依赖: React、Zustand、../viewModel/、../view/
- 被依赖方: ../application/

## 设计决策
- 本 feature 目前仅定义了契约层（contracts/），Domain 层待实现
- 参数校验逻辑应实现为纯函数服务

## 内容清单
- `entities/`: 控制实体（待定义）
- `valueObjects/`: 控制值对象（待定义）
