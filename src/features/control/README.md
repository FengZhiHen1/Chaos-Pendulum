# control — 参数面板与模式导航

## 职责
用户与双摆非线性动力学虚拟仿真实验的"控制面"——提供全部物理参数的输入/调节/校验，管理四种工作模式的一键切换与跨模式状态保持，以及适配桌面/平板/手机三端的响应式布局外壳。

## 子模块

### SIM-02 参数控制面板
- 位置: `src/features/simulation/view/components/ParamPanel.tsx` 等（当前仍在 simulation 模块内）
- 契约: `contracts/parameter-panel.contract.ts`
- 双模式参数：连续参数（即时生效）vs 初始条件（预览→松手Reset）

### SIM-03 全局导航
- 位置: `src/shared/view/components/layout/AppShell.tsx`, `GlobalNavBar.tsx`
- 契约: `contracts/navigation.contract.ts`
- 四模式切换 + 故事模式锁定 + 键盘快捷键

## 依赖方向
- control 契约是跨模块契约——它约束 simulation（参数面板）和 shared（导航）
- 参数面板契约 → 被 simulation/view + simulation/viewModel 实现
- 导航契约 → 被 shared/view/layout 实现

## contract-driven-dev 任务
见 contracts/ 目录下的各契约文件
