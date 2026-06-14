# Shared — 跨 Feature 共享模块

## 职责
存放多个 Feature 共同依赖的代码——领域值对象、基础设施适配器、基础 UI 组件、通用 ViewModel Hook。

## 依赖方向
- 可以依赖: 无（处于依赖链最内层）
- 禁止依赖: `features/` 任何模块
- 被依赖方: 各 Feature 的对应层

## 设计决策
- 提取到 shared 的标准：第二个 Feature 真正需要时提取，不提前共享
- 每层代码放在对应的 shared 子目录下（domain/、application/、viewModel/、view/、infrastructure/、lib/）
- `shared/lib/` 存放纯工具函数（如 `cn.ts`），不含副作用或外部 API 调用
- `shared/application/ports/` 存放跨 Feature 的端口接口定义

## 内容清单

### domain/
- `valueObjects/app.ts`: 应用模式/设备类型/加载状态定义
- `valueObjects/physics.ts`: 物理常量、参数元数据、预设计参数
- `valueObjects/simulation.ts`: 仿真相关类型（状态向量、积分方法等）

### application/
- `ports/INotificationPort.ts`: Toast 通知端口接口

### lib/
- `cn.ts`: clsx + tailwind-merge 组合工具函数

### viewModel/
- `hooks/useContainerSize.ts`: 容器尺寸观测 Hook
- `hooks/useDeviceType.ts`: 设备类型检测 Hook
- `hooks/useKeyboardShortcuts.ts`: 键盘快捷键注册 Hook
- `hooks/useToast.ts`: Toast 通知 UI 状态 Hook
- `hooks/useVisibilityChange.ts`: Tab 可见性变化 Hook

### view/
- `components/ui/`: shadcn/ui 基础组件（Button、Card、Dialog 等）
- `components/layout/`: AppShell、GlobalNavBar、ModeErrorBoundary
- `components/debug/`: DebugPanel
- `components/ToastProvider.tsx`: Toast 通知 Provider

### infrastructure/
- `storage/indexed-db.ts`: IndexedDB 通用封装
- `storage/precomputeLoader.ts`: 预计算数据加载器
- `storage/precomputePrefetch.ts`: 预计算数据预取
- `observability/`: FPS 追踪、性能标记、错误捕获
- `audio/`: AudioContext 管理、音频参数映射、噪声生成器
- `error-handling/`: 错误码定义、通知函数、全局错误处理
- `commandBus.ts`: 简单事件总线
- `adapters/NotificationAdapter.ts`: 通知端口适配器
