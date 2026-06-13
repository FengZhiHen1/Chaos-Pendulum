# shared — View 层

## 职责
存放跨 Feature 共享的纯表现层组件——UI 组件库、全局布局壳、调试面板。这些组件仅负责渲染和 GUI 视觉状态（isHovered, scrollY 等）。

## 依赖方向
- 可以依赖: ../viewModel/（共享 Hook）
- 禁止依赖: application/、domain/、infrastructure/、features/、axios
- 被依赖方: App.tsx、各 feature 的 view/

## 设计决策
- shadcn/ui 组件采用 Copy 模式，放在 `components/ui/` 下
- 全局布局壳（AppShell/NavBar）放在 `components/layout/` 下
- 调试面板仅在开发模式显示（`import.meta.env.DEV` 守卫）

## 内容清单
### components/ui/
- shadcn/ui 组件：Slider, Tabs, Dialog, Tooltip, Button 等（Copy 模式）

### components/layout/
- `AppShell.tsx`: 响应式布局壳（桌面三栏/平板两栏/手机单栏）
- `NavBar.tsx`: 全局导航栏（探索/分析/实验/故事四模式切换）

### components/debug/
- `DebugPanel.tsx`: 开发模式可观测性面板（FPS/Worker 耗时/错误日志）
