# control — Application 层

## 职责
全局控制用例编排——参数校验、导航状态转换。

## 依赖方向
- 可以依赖: ../domain/、../contracts/
- 禁止依赖: React、Zustand、../viewModel/、../view/
- 被依赖方: ../viewModel/

## 设计决策
- 契约已在 contracts/ 中定义（ParameterValidator、ParameterController、NavigationContract）
- Application 用例实现这些契约定义的 ABC

## 内容清单
### 用例（待 contract-driven-dev 填充）
- ParameterValidationUseCase: 参数校验编排
- NavigationControlUseCase: 导航锁定/解锁编排

### 端口接口（待定义）
