# explore — Infrastructure 层

## 职责
探索模式的 Application 端口实现——蝴蝶效应仿真调度器、音频引擎适配器。

## 依赖方向
- 可以依赖: ../application/ports/、../contracts/、shared/infrastructure/
- 禁止依赖: ../viewModel/、../view/、React 组件
- 被依赖方: ../viewModel/（依赖注入时作为端口实现传入）

## 设计决策
- butterfly-scheduler 应拆分为 ButterflyScheduler（编排器）+ ButterflySideRunner（单侧运行器）
- 外部特征 consumer 不直接引用此目录——通过 Application UseCase 间接使用

## 内容清单
### scheduler/
- `ButterflyScheduler.ts`: 蝴蝶效应双摆并行仿真调度器（← butterfly-scheduler.ts 重构后）
- `ButterflySideRunner.ts`: 单侧仿真实例管理器（阶段 5 提取）

### 适配器（待阶段 4-5 创建）
- 音频引擎适配器
- 通知端口适配器（使用 shared/infrastructure/adapters/NotificationAdapter）
