# analyze — Domain 层

## 职责
分析模式的纯领域逻辑——Lyapunov 指数分类、分岔 regime 判定、参数名映射。

## 内容清单
### services/
- `classifyLambda.ts`: 混沌/稳定/准周期判定
- `classifyRegime.ts`: 分岔 regime 判定（周期-N/倍周期/混沌）
- `resolveStoreParam.ts`: 预计算参数名→Zustand 字段映射
