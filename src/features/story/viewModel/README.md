# story — ViewModel 层

## 职责
故事模式页面的 UI 状态管理。当前提供基础的 Zustand Store（storySlice），
建议后续重构为直接消费 data/ 模块的 `useStoryViewModel` Hook。

## 依赖方向
- 可以依赖: @/features/data/viewModel/（跨 feature 依赖——故事页面需要故事引擎的 ViewModel）
- 禁止依赖: ../view/、直接操作 DOM
- 被依赖方: ../view/StoryPage

## 设计决策
- **当前过渡方案**: storySlice 提供基础的 play/pause/reset/demoMode 状态
- **推荐方案**: story/StoryPage 直接 import `useStoryViewModel` from `@/features/data/viewModel`
- 理由: StoryScriptEngine 的实现和契约都在 data/ 模块中，story/ 是纯 View 层消费方

## 内容清单

### stores/
- `storySlice.ts`: Zustand Store Slice（过渡方案——后续可移除，全部迁移到 useStoryViewModel）

## 后续任务
- [ ] StoryPage.tsx 改为使用 `useStoryViewModel` 替代 `useStoryStore`
- [ ] 移除 storySlice（如果不再需要）
- [ ] 确认 story/ 模块与 data/ 模块的从属关系（故事是 data 的子 View？还是独立 feature？）
