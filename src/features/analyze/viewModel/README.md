# analyze — ViewModel 层

## 职责
分析模式的 UI 状态管理——analyzeStore、预计算数据加载 Hook。

## 内容清单
### stores/
- `analyzeStore.ts`: Zustand Store

### hooks/
- `useAnalysisView.ts`: 分析视图切换
- `usePrecomputeData.ts`: 预计算数据加载 + Toast 通知
