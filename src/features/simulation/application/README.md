# simulation — Application 层

## 职责
仿真功能的用例编排层。定义无状态用例和基础设施端口接口（IWorkerGateway）。

## 依赖方向
- 可以依赖: ../domain/（纯函数）
- 禁止依赖: React、Zustand、../viewModel/、../view/、../infrastructure/（实现）
- 被依赖方: ../viewModel/（用例调用）、../infrastructure/（端口实现）

## 设计决策
- 用例类不接受 React Hook 或 Zustand Store——通过端口接口注入依赖
- 端口接口（IWorkerGateway）定义仿真 Worker 的抽象边界
- DTO 定义跨层传输的数据结构

## 内容清单
### useCases/
- `BootSequence.ts`: 启动编排——Worker 创建、Pyodide 预加载、可观测性初始化
- `ControlSimulation.ts`: 仿真控制——开始/暂停/重置/参数更新
- `MonitorEnergy.ts`: 能量漂移监控（未来）

### ports/
- `IWorkerGateway.ts`: 仿真 Worker 通信接口

### dto/
- `BootTypes.ts`: 启动进度/阶段/错误类型（← types.boot.ts）
