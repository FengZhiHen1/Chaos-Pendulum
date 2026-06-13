# simulation — Infrastructure 层

## 职责
仿真功能的基础设施实现——Web Worker 通信、Float64Array 池、仿真调度器、历史数据仓储。

## 依赖方向
- 可以依赖: ../application/ports/（实现端口接口）、../domain/（类型引用）
- 禁止依赖: ../viewModel/、../view/
- 被依赖方: ../viewModel/（通过 Application 端口间接消费）

## 设计决策
- Worker 实例生命周期由 Scheduler 管理
- Float64Pool 实现 Transferable 零拷贝通信
- Bridge 连接 Store ↔ Worker 数据流

## 内容清单
### worker/
- `OdeWorker.ts`: Worker 入口——消息分发 → ODE 积分 → 结果回传
- `Float64Pool.ts`: Transferable Float64Array 池（10块 × 4000元素）
- `SimulationScheduler.ts`: 仿真调度器——管理 Worker 生命周期 + 批量积分请求
- `SimulationBridge.ts`: Store ↔ Worker 桥接——订阅 store 变化并转发至 Worker

### repositories/
- `SimulationHistoryRepo.ts`: 仿真历史数据读写（← history.ts）
