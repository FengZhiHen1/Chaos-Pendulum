# shared — Domain 层

## 职责
存放跨 Feature 共享的领域实体和值对象类型定义。这些类型是纯数据结构，不含任何框架依赖。

## 依赖方向
- 可以依赖: 无（Domain 是最内层，不依赖任何模块）
- 禁止依赖: React、Zustand、axios、任何 features/ 模块、任何 infrastructure
- 被依赖方: shared 内其他层、各 feature 的 domain/application 层

## 设计决策
- 从 `shared/types/` 迁移而来——原 types 目录被拆解，纯领域类型移入此处
- 不在此处定义业务规则函数（纯函数归各 feature 的 domain/services/）
- 仅当两个以上 feature 真正需要同一个类型时，才放入 shared

## 内容清单
- `physics.ts`: PendulumParams, InitialConditions, StateVector, EnergySnapshot 等物理类型
- `simulation.ts`: WorkerMessage, FrameData, IntegratorType 等仿真消息类型
- `app.ts`: AppMode, DeviceType, SnapshotMeta 等应用级类型
