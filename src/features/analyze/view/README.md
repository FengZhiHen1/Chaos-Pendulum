# analyze — View 层

## 职责
分析模式的纯表现层——Lyapunov 热力图、分岔图、庞加莱截面、参数填充对话框。

## 内容清单
### components/
- `LyapunovHeatmap.tsx`: Lyapunov 指数热力图
- `BifurcationPlot.tsx`: 参数空间分岔图
- `BifurcationDialog.tsx`: 分岔图点详情对话框
- `PoincareSection.tsx`: 庞加莱截面散点图
- `AnalysisControls.tsx`: 分析控件面板
- `ParameterFillDialog.tsx`: 参数填充对话框

### pages/
- `AnalyzeModePage.tsx`: 分析模式主页面
