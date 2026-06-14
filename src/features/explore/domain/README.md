# explore — Domain 层

## 职责
混沌现象探索的纯领域逻辑——漂移计算、分离度计算、蝴蝶效应阈值判定。

## 依赖方向
- 可以依赖: shared/domain/valueObjects/ （PendulumParams、StateVector 等物理类型）
- 禁止依赖: React、Zustand、Three.js、Web Audio API
- 被依赖方: application/、viewModel/

## 设计决策
- 所有计算函数必须是纯函数，不依赖外部状态
- 漂移距离算法和分离度算法已从 UI 组件中提取为独立 domain 服务

## 内容清单
- `drift-calculator.ts`: 时间反演漂移距离计算器（IDriftCalculator 接口实现）
- `separation-calculator.ts`: 蝴蝶效应双摆分离度计算器
- `computation/SeparationComputer.ts`: 分离度纯计算（阶段 5 从 butterfly-scheduler 提取）
