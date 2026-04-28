## 已知遗留

- 预计算 JSON 文件（.json）尚未实际生成——需在本地 Python 环境下运行 python scripts/precompute/run_all.py（预计 4-7 小时）
- vite.config.ts 未添加 src/shared/data/ 静态资源配置——JSON 文件构建时需确认 Vite 的静态资源处理策略（public/ vs new URL() vs ?url import）
- ANL-01/ANL-02 组件中 dataPaths/dataPath 的 URL 获取方式（new URL('...', import.meta.url)）需在 JSON 文件就位后填入实际路径
- 移动端单视口的 A/B 幽灵尾迹叠加（半透明虚线）待后续 EXP-02 支持 colorMode="solid" 不同颜色时完善
- Pyodide WASM 实际实例化：当前缓存层负责下载 + 存储 ArrayBuffer，但实际的 loadPyodide({ indexURL }) 调用需待 LAB-03 引入 pyodide npm 包后补全。框架已预留
    yodideLoadStrategy 和 getGlobalWorker() / getPyodide() 接口。
- "跳过"按钮：设计文档在异常 1 中要求 LoadingScreen 显示"跳过"按钮主动中断 Pyodide 下载，当前未实现 UI 按钮（AbortController 逻辑已预留）。