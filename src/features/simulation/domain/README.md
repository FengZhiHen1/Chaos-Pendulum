# simulation — Domain 层

## 职责
双摆物理仿真的纯领域逻辑——ODE 微分方程、数值积分器（RK4/RK45）、状态向量计算。**零框架依赖**，可在 Node.js/Vitest 环境独立测试。

## 依赖方向
- 可以依赖: shared/domain/valueObjects（物理类型定义）
- 禁止依赖: React、Zustand、Worker API、任何 UI 框架
- 被依赖方: application/（用例编排）、viewModel/（通过 Application 间接使用）

## 设计决策
- 所有函数必须是纯函数：相同输入 → 相同输出，无副作用
- 积分器不管理时间推进循环——那属于 infrastructure/worker/ 的职责
- 角度归一化（normalizeAngle）放在此层，因为它是物理概念

## 内容清单
### services/
- `derivatives.ts`: ODE 右端函数（双摆运动方程），纯数学
- `integrators.ts`: RK4 固定步长 + RK45 自适应步长积分器
- `stateVector.ts`: computeDerived、normalizeAngle、能量计算、球坐标转换

### valueObjects/
- `PhysicsParams.ts`: 参数校验规则、硬约束常量、预设定义
