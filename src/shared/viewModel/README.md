# shared — ViewModel 层

## 职责
存放跨 Feature 共享的 UI 状态管理 Hook。这些 Hook 管理跨介质 UI 状态（isLoading, error, selectedTab 等），不包含业务逻辑。

## 依赖方向
- 可以依赖: ../domain/（类型引用）、React
- 禁止依赖: application/、features/、infrastructure/ 实现、axios
- 被依赖方: shared/view/、各 feature 的 viewModel/ 和 view/

## 设计决策
- 仅放真正被多个 feature 使用的 Hook
- 单个 feature 专用的 Hook 留在该 feature 的 viewModel/hooks/ 中
- 不在此处放 Zustand Store（Store 归各 feature 的 viewModel/stores/）

## 内容清单
- `useContainerSize.ts`: ResizeObserver Canvas 尺寸自适应
- `useDeviceType.ts`: Tailwind 断点响应式判断（桌面/平板/手机）
- `useToast.ts`: Toast 通知状态管理
- `useVisibilityChange.ts`: 页面可见性变化检测（后台自动暂停）
