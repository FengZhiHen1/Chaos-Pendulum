# data — View 层

## 职责
数据功能的纯表现层——快照管理器、导出面板、故事播放器、演示模式切换、历史时间轴。

## 依赖方向
- 可以依赖: ../viewModel/、view/contracts/
- 禁止依赖: ../application/、../domain/、../infrastructure/、直接操作 IndexedDB/Three.js
- 被依赖方: 路由配置、AppShell

## 设计决策
- 每个组件通过 Props 衔接契约接收 ViewModel——组件不知道数据从哪来
- GUI 专属状态（isHovered、scrollY、animationProgress）保持在组件内部
- 组件不直接 import UseCase 或 Repository——所有副作用通过 ViewModel 方法触发

## 内容清单

### contracts/（Props 衔接契约）
- `SnapshotManager.contract.ts`: useSnapshotViewModel ↔ SnapshotManager 双向约定
- `ExportPanel.contract.ts`: useExportViewModel ↔ ExportPanel 双向约定
- `StoryPlayer.contract.ts`: useStoryViewModel ↔ StoryPlayer 双向约定
- `DemoModeIndicator.contract.ts`: useDemoModeViewModel ↔ DemoModeIndicator 双向约定
- `HistoryTimeline.contract.ts`: useHistoryPlaybackViewModel ↔ HistoryTimeline 双向约定

### components/（待 frontend-visual 实现）
- `SnapshotManager`: 快照缩略卡片列表 + 保存按钮 + 双快照对比面板
- `ExportPanel`: 格式选择器 + CSV/JSON/PNG 导出按钮 + 分辨率滑块
- `StoryPlayer`: 故事播放/暂停/继续控制 + 进度条 + 底部字幕条
- `DemoModeIndicator`: 演示模式状态指示器（不渲染控件——仅场景水印可见）
- `HistoryTimeline`: 可拖拽时间轴 + 分叉参数修改面板 + 幽灵尾迹图例

### pages/（待 frontend-visual 实现）
- `DataPage`: 数据管理主页面（整合 SnapshotManager + ExportPanel + HistoryTimeline）

## frontend-visual 任务

### 组件
- 以上 components/ 中列出的 5 个组件 + 1 个页面
- Props 来源: view/contracts/ 下对应的 `.contract.ts` 文件

### 允许的 View 内部状态
- isHovered, isFocused, scrollY, animationProgress, isExpanded, isDragging

### 禁止
- import application/useCases 或 infrastructure/repositories
- 写业务规则（如 "trail.length > 1200 时裁剪"——这应该在 Application 层处理）
- isLoading 在 View 内部定义（应从 ViewModel 来）
