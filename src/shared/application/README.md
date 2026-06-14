# shared — Application 层

## 职责
跨 Feature 共享的应用层端口接口和用例——通知端口、错误翻译端口等。

## 依赖方向
- 可以依赖: ../domain/
- 禁止依赖: React、Zustand、../viewModel/、../view/、../infrastructure/
- 被依赖方: 各 Feature 的 application/ 和 viewModel/

## 设计决策
- 端口接口在此定义，由 shared/infrastructure/adapters/ 实现
- 跨 Feature 的用例编排也可放置于此

## 内容清单
### ports/
- `INotificationPort.ts`: Toast 通知端口（按严重度：notify/warn/error/info/success）
