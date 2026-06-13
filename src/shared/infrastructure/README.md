# shared — Infrastructure 层

## 职责
存放跨 Feature 共享的基础设施实现——浏览器 API 封装、存储抽象、可观测性、音频引擎、错误处理。这些是 Application 层定义的端口的具体实现。

## 依赖方向
- 可以依赖: ../domain/（类型引用）、浏览器原生 API
- 禁止依赖: features/、viewModel/、view/、React 组件
- 被依赖方: 各 feature 的 infrastructure/ 和 application/

## 设计决策
- 基础设施代码不感知 UI——不 import React 组件或 Hook
- 错误处理模块从 `system/error-handling/` 迁移而来（Phase 1）
- 存储层封装 IndexedDB 通用操作，不包含业务特定的存储键名

## 内容清单
### storage/
- `indexed-db.ts`: 通用 IndexedDB 读写封装（打开/事务/游标）
- `precomputeLoader.ts`: 预计算数据加载器（fetch + IndexedDB 缓存 + 校验）

### observability/
- `fps-tracker.ts`: rAF 帧间差值滑动平均（最近 60 帧）
- `perf-mark.ts`: performance.mark/measure 封装
- `error-capture.ts`: window.onerror + unhandledrejection 全局捕获（环形 50 条）

### audio/
- `audio-context.ts`: AudioContext 惰性初始化管理
- `sonification.ts`: 四维参数→音频映射（音高/和声/音色/噪声）
- `noise-generator.ts`: 白噪声 + 混响混沌听觉标记

### error-handling/
- `types.ts`: 错误码/Toast 类型定义
- `constants.ts`: 错误处理配置常量
- `error-dictionary.ts`: 错误码→中文消息映射
- `notify.ts`: Toast 通知触发函数
