# explore — Application 层

## 职责
探索模式的用例编排层——蝴蝶效应仿真编排、时间反演管理、声音化参数映射。

## 依赖方向
- 可以依赖: ../domain/、../contracts/、shared/application/ports/
- 禁止依赖: React、Zustand、Three.js、../viewModel/、../view/、../infrastructure/
- 被依赖方: ../viewModel/（用例实例化）、../infrastructure/（端口实现）

## 设计决策
- 端口接口在 contracts/ 中定义，由 infrastructure/ 实现
- 用例为无状态类，构造注入端口依赖

## 内容清单
### 用例（待 contract-driven-dev 填充）
- ButterflySimulationUseCase: 双摆分叉仿真编排
- TimeReversalUseCase: 时间反演状态机与漂移管理
- SonificationUseCase: 物理参数→音频参数映射编排

### 端口接口（由 infrastructure 实现）
- 声音化引擎端口
- 蝴蝶效应调度器端口
