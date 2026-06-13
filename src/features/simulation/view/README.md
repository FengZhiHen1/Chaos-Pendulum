# simulation — View 层

## 职责
仿真功能的纯表现层——参数面板、能量监控、相空间等 UI 组件。只能 import ViewModel。

## 依赖方向
- 可以依赖: ../viewModel/（Store、Hook）
- 禁止依赖: ../application/、../domain/、../infrastructure/、axios
- 被依赖方: explore/analyze/lab 等 feature 的 view/、App.tsx

## 设计决策
- 组件不包含业务逻辑——通过 Hook 获取状态和操作
- GUI 专属视觉状态（isHovered、scrollY）在组件内部
- Props 契约在 contracts/ 中定义

## 内容清单
### components/
- `ParamPanel.tsx`: 参数控制面板（Tabs + Slider 列表）
- `ParamSlider.tsx`: 单个参数滑块（含数值输入 + 合法性校验）
- `MethodSelector.tsx`: 积分方法选择器
- `PresetButtons.tsx`: 预设参数快捷按钮
- `EnergyMonitorPanel.tsx`: 能量监控面板外壳
- `EnergyCanvas.tsx`: 能量曲线 2D Canvas
- `PhaseSpacePanel.tsx`: 相空间面板外壳
- `PhaseSpaceCanvas.tsx`: 相空间 2D Canvas 散点图
- `BootManager.tsx`: 启动流程管理器（from system）
- `LoadingScreen.tsx`: 启动加载画面（from system）
- `ErrorScreen.tsx`: 启动错误画面（from system）

### contracts/
- `ParamPanel.contract.ts`: Props 衔接契约
