# story — Infrastructure 层

## 职责
故事模式的基础设施实现——故事脚本数据源、Demo 模式资源加载。

## 依赖方向
- 可以依赖: ../application/ports/、../contracts/、shared/infrastructure/
- 禁止依赖: ../viewModel/、../view/
- 被依赖方: ../viewModel/

## 设计决策
- 故事脚本当前在 data feature 的 StoryScriptEngineImpl 中处理
- 本层为故事模式专用的基础设施适配器

## 内容清单
### repositories/
- StoryScriptRepository: 故事脚本数据源（已实现在 data/application/repositories/，后续迁移至此）
