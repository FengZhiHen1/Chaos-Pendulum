# 功能点：INF-02 持续部署管线

> **文档生成时间**：2026-04-28 21:29:46 CST
> **版本记录**：
> | 版本 | 时间 | 修改人 | 变更摘要 |
> |------|------|--------|----------|
> | v1.0 | 2026-04-28 21:29:46 | AI Assistant | 初始版本，对齐技术栈设计 §9.4 CI/CD 方案 + 现有 `.github/workflows/ci.yml` 骨架 |

> **冲突核查指引**：本模块操作 `.github/workflows/ci.yml` 和 `package.json`，不涉及任何 `src/` 下的业务代码。与已有功能规格文档无类型/接口/状态机层面的冲突可能（CI/CD 是构建时基础设施，与运行时功能正交）。若后续新增模块需要 CI 中的特殊步骤（如 LAB-03 的 Pyodide wheel 校验），在各模块规格中声明即可，本管线提供扩展钩子。

### 所属模块与溯源

- **对应总设计章节**：功能模块全拆解 §八 INF-02「持续部署管线」；技术栈设计 §2 #24「CI/CD」、§9.4「CI/CD 与自动化测试」三阶段流水线详设；项目结构设计 §4.10 `useAppStore`（仅涉及全局 store 结构参考）、§5 `.github/workflows/ci.yml`
- **依赖的其他功能模块**：
  - `SIM-01`（双摆物理引擎）— CI Stage 2 运行其 `__tests__/physics.test.ts` 中的三项物理回归测试
  - `SYS-03`（预计算数据管线）— CI Stage 2 校验预计算 JSON 文件的哈希一致性
  - `INF-03`（自动化测试体系）— CI Stage 2 执行 Vitest 测试套件（由 INF-03 定义的测试分层标准）
- **被依赖模块**：全部模块（CI 管线是所有代码变更的合流门控，任何模块的代码提交都必须通过三阶段检查才能合并）
- **行业补充说明**：设计文档聚焦功能与物理，未涉及交付自动化。但 Pyodide + WASM 资源打包复杂（~18MB Python 运行时 + JS bundle + Worker chunk + 预计算数据），需自动化管线保证评审版本一致性，避免"在我机器上能跑"的现场事故。

### 已有设计兼容性分析

- **已审查的相关规格文档**：
  - `双摆混沌实验室-技术栈设计.md` v1.2：§2 #24-25 CI/CD 与测试技术选型、§9.4 三阶段流水线详设（check → test → build → deploy）、物理回归测试代码示例、预计算数据校验逻辑
  - `双摆混沌实验室-项目结构.md` v1.0：§5 特殊文件说明（`.github/workflows/ci.yml` 三阶段流水线）、§8.1 测试分层（单元/物理回归/组件/构建验证）
  - `INF-01-应用可观测性.md` v1.0：与本模块正交（运行时监控 vs 构建时管线），无冲突
- **兼容性结论**：
  - 现有 `.github/workflows/ci.yml` 已实现基础三阶段骨架（`check` → `test` → `build`），使用 `pnpm` + Node 22 + Ubuntu latest，与设计文档要求一致
  - 当前缺失项（对照技术栈设计 §9.4）：
    1. Stage 1 缺少 ESLint 和 Prettier 检查步骤（当前仅 `tsc --noEmit`）
    2. Stage 2 缺少物理回归测试的独立步骤（当前 `pnpm test` 运行全部 vitest，物理测试未显式分离）
    3. Stage 2 缺少预计算数据哈希一致性校验步骤
    4. Stage 3 缺少部署到 GitHub Pages 的步骤（当前仅上传 artifact）
    5. 缺少 `workflow_dispatch` 手动触发入口
    6. 缺少功能开关机制（P3 模块按需启用/禁用）
  - 本规格在现有骨架基础上补充这些缺失项，不推翻已有结构
  - 无冲突
- **复用的已有定义**：`.github/workflows/ci.yml` 的 job 结构（`check`/`test`/`build`）、`pnpm` 包管理器、Node 22 运行时、Ubuntu latest 运行环境

### 技术栈绑定

- **必须使用**：
  - `GitHub Actions` — CI/CD 运行平台（仓库为 GitHub，原生集成，零额外配置）
  - `pnpm@10` — 包管理器（与项目 `package.json` 的 `packageManager` 字段一致），CI 中使用 `--frozen-lockfile` 确保依赖版本完全锁定
  - `Node.js 22` — JavaScript 运行时（与项目 `.nvmrc` 或 `package.json.engines` 一致）
  - `actions/checkout@v4` — 代码检出动作
  - `pnpm/action-setup@v4` — pnpm 安装动作
  - `actions/setup-node@v4` — Node.js 安装动作（开启 `cache: pnpm` 利用 pnpm store 缓存加速）
  - `actions/upload-artifact@v4` — 构建产物上传（`dist/` 文件夹打包为 zip）
  - `actions/download-artifact@v4` — 部署 job 中下载构建产物
  - `actions/configure-pages@v4` — GitHub Pages 配置动作
  - `actions/upload-pages-artifact@v3` — 将 `dist/` 上传为 Pages 部署物
  - `actions/deploy-pages@v4` — 触发 GitHub Pages 部署
  - `peaceiris/actions-gh-pages@v4`（备选方案）— 如需部署到 `gh-pages` 分支而非 GitHub Pages Actions
- **可选使用**（在配置变量中启用时）：
  - `vite-plugin-compression` — 构建时 Brotli 压缩（技术栈设计 §9.3 提及，配合 Nginx/CDN 静态预压缩）。默认关闭（自包含 HTML5 文件夹无需 CDN 场景），仅在部署到 CDN 时通过 `VITE_ENABLE_COMPRESSION=true` 启用
- **禁止使用**：
  - 禁止使用 Docker 容器构建（项目为纯静态前端，无服务端运行时依赖，Docker 仅增加 CI 耗时和复杂度）
  - 禁止使用 `actions/cache` 替代 `setup-node` 的 `cache: pnpm`（`setup-node` 内置的缓存机制自动处理 `pnpm-lock.yaml` 哈希，手动 `actions/cache` 需要额外维护 key 策略）
  - 禁止在 CI 中运行 `pnpm precompute`（预计算由开发者在本地手动触发，CI 仅校验已有预计算数据的哈希一致性，不重新生成）
  - 禁止在 CI 中安装 `puppeteer` / `playwright` 等 headless 浏览器（纯前端项目，组件测试使用 `jsdom` 环境）

### 输入定义（精确类型）

本模块的"输入"是指 CI 管线的触发条件和配置参数，而非 TypeScript 类型。

#### 触发事件

```yaml
# .github/workflows/ci.yml 的 on 配置块
on:
  # 触发 1：推送到 main 分支（合并 PR 后触发）
  push:
    branches: [main]

  # 触发 2：创建到 main 分支的 Pull Request（含 draft PR）
  pull_request:
    branches: [main]

  # 触发 3：手动触发（GitHub Actions 页面 → Run workflow 按钮）
  workflow_dispatch:
    inputs:
      skip_tests:
        description: "跳过测试阶段（紧急修复时使用，不推荐）"
        required: false
        type: boolean
        default: false
      deploy_to_pages:
        description: "构建后部署到 GitHub Pages"
        required: false
        type: boolean
        default: false
      enable_p3_modules:
        description: "启用 P3 优先级模块（用户可编程沙箱/快照回放与分叉/演示模式）"
        required: false
        type: boolean
        default: false

  # 触发 4：GitHub Release 发布时自动部署
  release:
    types: [published]
```

#### 功能开关（Feature Flags）

通过 Vite 环境变量在构建时控制 P3 模块的包含/排除：

```typescript
// ============================================================
// src/shared/types/build.ts（构建时常量类型，不参与运行时 bundle）
// ============================================================

/**
 * 构建时功能开关。
 * 通过 Vite 的 define 或 import.meta.env 注入。
 * 所有以 VITE_FEATURE_ 为前缀的环境变量在 vite.config.ts 中被读取。
 */
interface BuildFeatureFlags {
  /**
   * P3 模块总开关。
   * true: 包含 LAB-03（用户可编程沙箱）、DAT-03（历史回放与分叉）、STY-02（演示模式）
   * false: 上述模块的代码从 bundle 中完全 tree-shake 移除
   * 默认：false（评审版本默认不包含 P3）
   */
  VITE_FEATURE_P3_MODULES: "true" | "false";

  /**
   * 是否启用 Brotli 预压缩（构建时生成 .br 文件）。
   * 默认：false（自包含 HTML5 文件夹无需 CDN 压缩）
   */
  VITE_ENABLE_COMPRESSION: "true" | "false";

  /**
   * 是否启用调试面板快捷键（Ctrl+Shift+D）。
   * 覆盖 INF-01 的 ObservabilityConfig.enableDebugPanelInProduction。
   * 默认：false（评审版本不暴露调试面板）
   */
  VITE_ENABLE_DEBUG_PANEL: "true" | "false";
}
```

```bash
# .env.example（项目根目录，作为 CI 环境变量配置的参考模板）
# 注意：此文件仅用于文档目的。实际值在 CI workflow_dispatch 输入或仓库 Secrets/Variables 中配置。

# P3 模块开关
VITE_FEATURE_P3_MODULES=false

# Brotli 压缩开关
VITE_ENABLE_COMPRESSION=false

# 调试面板开关
VITE_ENABLE_DEBUG_PANEL=false
```

#### CI 环境依赖

```yaml
# CI 运行环境变量（在 workflow YAML 中通过 env 块设置）
env:
  # Node.js 版本（必须与 package.json.engines.node 一致）
  NODE_VERSION: "22"

  # pnpm 版本（必须与 package.json.packageManager 一致）
  PNPM_VERSION: "10"

  # 预计算数据路径（相对于仓库根目录）
  PRECOMPUTE_DATA_DIR: "src/shared/data"

  # 预计算数据证书文件（构建前由开发者生成，CI 比对哈希）
  PRECOMPUTE_CHECKSUM_FILE: "src/shared/data/.checksum.sha256"
```

### 输出定义（精确类型）

#### CI 产物

| 产物名称 | 类型 | 内容 | 保留策略 | 用途 |
|----------|------|------|----------|------|
| `dist` | artifact (zip) | Vite 构建输出文件夹完整内容：`index.html` + `assets/`（JS/CSS chunk）+ `pyodide/`（离线 WASM 包）+ 预计算 JSON 数据 | 90 天（GitHub Actions 默认） | 部署源；评审现场离线包；历史版本回退 |
| `dist` (Pages) | GitHub Pages 部署物 | 同上，经 `actions/upload-pages-artifact` 处理 | GitHub Pages 自动管理 | 在线演示 URL（`https://<owner>.github.io/<repo>/`） |
| `test-report` | artifact (json) | Vitest JSON 测试报告（`vitest --reporter=json --outputFile=test-report.json`） | 30 天 | 测试失败时下载排查 |

#### 流水线状态输出

CI 完成后，以下状态在 GitHub UI 中可见：

| 检查项 | 含义 | 通过标准 |
|--------|------|----------|
| `check (tsc)` | TypeScript 类型检查 | `tsc --noEmit` 退出码 0，无类型错误 |
| `check (eslint)` | ESLint 代码规范检查 | `eslint .` 退出码 0，无 error 级别告警 |
| `check (prettier)` | Prettier 格式一致性检查 | `prettier --check .` 退出码 0，所有文件已格式化 |
| `test (unit)` | 单元测试（Vitest） | 全部 test case 通过，无 skipped/disabled |
| `test (physics)` | 物理回归测试（三项验证） | 小角度偏差 < 2% ∧ 单摆周期误差 < 1% ∧ 能量漂移 < 0.5% |
| `test (precompute)` | 预计算数据哈希校验 | `sha256sum -c src/shared/data/.checksum.sha256` 退出码 0 |
| `build (vite)` | Vite 生产构建 | `vite build` 退出码 0，`dist/` 文件夹非空 |
| `build (artifact)` | 构建产物上传 | artifact `dist` 上传成功 |
| `deploy (pages)` | GitHub Pages 部署 | 部署成功（仅在 workflow_dispatch 或 release 触发时运行） |

#### 功能开关对构建产物的影响

```
当 VITE_FEATURE_P3_MODULES=false 时（默认）:
  dist/
  ├── assets/
  │   ├── index-[hash].js       # 不含 LAB-03/DAT-03/STY-02 代码
  │   └── index-[hash].css      # 不含 P3 组件样式
  ├── pyodide/                   # 始终包含（LAB-03 仅 P3，但 Pyodide 运行时保留以备未来）
  └── index.html

当 VITE_FEATURE_P3_MODULES=true 时:
  dist/
  ├── assets/
  │   ├── index-[hash].js       # 含全部 P3 模块代码（+ ~50KB minified）
  │   └── index-[hash].css      # 含 P3 组件样式
  ├── pyodide/
  └── index.html
```

### 核心逻辑步骤

#### Stage 1：代码检查（Job: `check`）

**步骤 1.1：检出代码**

- **操作对象**：GitHub Actions runner 的工作目录
- **具体操作**：`actions/checkout@v4` 将当前 commit 的完整代码检出到 runner
- **输入来源**：触发 CI 的 push/PR commit SHA
- **输出去向**：runner 文件系统 `$GITHUB_WORKSPACE`
- **失败行为**：网络故障 → GitHub Actions 自动重试（内置 2 次）；权限不足 → 跳过该 job

**步骤 1.2：安装 Node.js 与 pnpm**

- **操作对象**：runner 的 PATH 环境变量
- **具体操作**：
  ```yaml
  - uses: pnpm/action-setup@v4
    with:
      version: ${{ env.PNPM_VERSION }}   # "10"
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ env.NODE_VERSION }}  # "22"
      cache: pnpm
  ```
- **输入来源**：CI 环境变量 `PNPM_VERSION`、`NODE_VERSION`
- **输出去向**：`node` 和 `pnpm` 命令在后续步骤中可用；pnpm store 路径被缓存（命中时后续 `pnpm install` 耗时 < 5s）
- **失败行为**：版本号不存在 → runner 报错，job 标记失败

**步骤 1.3：安装依赖**

- **操作对象**：`node_modules/` 目录
- **具体操作**：`pnpm install --frozen-lockfile` — 严格按 `pnpm-lock.yaml` 安装，版本不匹配时立即失败（不更新 lockfile）
- **输入来源**：`pnpm-lock.yaml` + `package.json`
- **输出去向**：`node_modules/` 填充完毕
- **失败行为**：lockfile 过期（安装失败）→ job 失败，提示开发者本地运行 `pnpm install` 并提交更新的 lockfile

**步骤 1.4：TypeScript 类型检查**

- **操作对象**：`tsc --noEmit` 编译器
- **具体操作**：`pnpm tsc --noEmit` — 对 `tsconfig.json` 中 `include: ["src"]` 范围内的所有 TypeScript 文件执行完整类型检查，但不生成 JS 输出
- **输入来源**：`src/` 下所有 `.ts` / `.tsx` 文件 + `tsconfig.json` 配置
- **输出去向**：stdout 列出所有类型错误（含文件名、行号、错误描述）；退出码 0 = 通过
- **失败行为**：任一类型错误 → 退出码非 0 → job 失败；常见错误类型：`TS2345`（类型不匹配）、`TS2322`（赋值类型错误）、`TS18048`（可能为 undefined）

**步骤 1.5：ESLint 代码规范检查**（待实现——项目需添加 ESLint 配置）

- **操作对象**：ESLint 引擎
- **具体操作**：`pnpm lint`（映射为 `eslint .`）— 对所有 `.ts` / `.tsx` 文件运行 ESLint 规则
- **输入来源**：`eslint.config.js` 或 `eslint.config.mjs`（flat config 格式）+ `src/` 下所有源文件
- **输出去向**：stdout 列出所有 warning 和 error；退出码 0 = 仅有 warning 或无问题；退出码非 0 = 存在 error 级别告警
- **失败行为**：存在 error 级别告警 → job 失败。warning 级别仅输出，不阻塞
- **ESLint 配置最低要求**（待创建 `eslint.config.js`）：
  ```javascript
  // eslint.config.js（项目根目录，flat config 格式）
  import tsPlugin from "@typescript-eslint/eslint-plugin";
  import tsParser from "@typescript-eslint/parser";

  export default [
    {
      files: ["src/**/*.ts", "src/**/*.tsx"],
      plugins: { "@typescript-eslint": tsPlugin },
      languageOptions: { parser: tsParser },
      rules: {
        "no-console": "warn",                        // console.* 仅警告
        "@typescript-eslint/no-unused-vars": "error", // 未使用变量阻塞 CI
        "@typescript-eslint/no-explicit-any": "warn", // 显式 any 仅警告
        "prefer-const": "error",                      // 应使用 const 而非 let
      },
    },
  ];
  ```
- **依赖添加**（`package.json.devDependencies`）：
  ```json
  "@typescript-eslint/eslint-plugin": "^8.0.0",
  "@typescript-eslint/parser": "^8.0.0",
  "eslint": "^8.0.0"
  ```

**步骤 1.6：Prettier 格式检查**（待实现——项目需添加 Prettier 配置）

- **操作对象**：Prettier 引擎
- **具体操作**：`pnpm prettier --check "src/**/*.{ts,tsx,css,json}"` — 检查所有源文件是否符合 Prettier 格式规范
- **输入来源**：`.prettierrc` 或 `prettier.config.js` + 源文件
- **输出去向**：列出格式不符合规范的文件列表；退出码 0 = 全部文件已格式化
- **失败行为**：存在未格式化的文件 → job 失败，提示开发者运行 `pnpm prettier --write "src/**/*.{ts,tsx,css,json}"` 并提交
- **Prettier 配置**（待创建 `.prettierrc`）：
  ```json
  {
    "semi": true,
    "singleQuote": false,
    "tabWidth": 2,
    "trailingComma": "all",
    "printWidth": 100,
    "bracketSpacing": true,
    "arrowParens": "always",
    "endOfLine": "lf"
  }
  ```
- **依赖添加**（`package.json.devDependencies`）：
  ```json
  "prettier": "^3.0.0"
  ```
- **`package.json.scripts` 新增**：
  ```json
  "format": "prettier --write \"src/**/*.{ts,tsx,css,json}\"",
  "format:check": "prettier --check \"src/**/*.{ts,tsx,css,json}\""
  ```

#### Stage 2：测试（Job: `test`）

**步骤 2.1：检出代码 + 安装依赖**（同 Stage 1 的步骤 1.1-1.3）

- **具体操作**：复用 Stage 1 的安装流程
- **注意**：GitHub Actions 中 `test` job 通过 `needs: check` 声明对 Stage 1 的依赖。Stage 1 失败时跳过 Stage 2

**步骤 2.2：Vitest 单元测试与组件测试**

- **操作对象**：Vitest 测试运行器
- **具体操作**：`pnpm test`（映射为 `vitest --run`）— 运行全部 `*.test.ts` / `*.test.tsx` 文件
- **输入来源**：各 Feature `__tests__/` 目录 + `vite.config.ts` 的 `test` 配置块（`globals: true, environment: "jsdom"`）
- **输出去向**：stdout 测试报告（通过/失败/跳过数）；可选 JSON 报告 `test-report.json`
- **失败行为**：任一测试用例失败 → job 失败；超时（默认单测试 5 秒）→ 该用例失败；`vi.mock()` 错误 → 用例失败
- **生成 JSON 报告**（可选，用于下载排查）：
  ```bash
  pnpm vitest --run --reporter=json --outputFile=test-report.json
  # 将 test-report.json 上传为 artifact
  ```

**步骤 2.3：物理回归测试**（独立步骤，显式标识）

- **操作对象**：物理验证专用的测试用例（`src/features/simulation/__tests__/physics.test.ts`）
- **具体操作**：`pnpm vitest --run --reporter=verbose src/features/simulation/__tests__/physics.test.ts` — 仅运行物理回归测试，使用 verbose reporter 输出每项验证的详细结果
- **输入来源**：`physics.test.ts` 中的三个验证项：
  1. `smallAngleRegression`：初始角度 3° 以内，RK4 仿真 10s，与线性化解比较偏差 < 2%
  2. `singlePendulumDegeneration`：设置 `m2 → 0`（质量近似为 0），仿真 20s，检测周期 ≈ 2π√(L₁/g)，误差 < 1%
  3. `energyConservation`：设置 `damping = 0`，仿真 1000s，总能量漂移 < 0.5%
- **输出去向**：stdout 每项验证格式：`✓ 小角度线性化偏差 1.2% (< 2%)` 或 `✗ 能量守恒漂移 0.7% (≥ 0.5%)`
- **失败行为**：任一项不通过 → job 失败。CI 日志中显式标红不通过的验证项和实际值，开发者据此判断是否需要调整算法
- **关键约束**：此步骤必须作为独立 step 而非合并到 `pnpm test` 中运行——物理回归失败时需要快速在 CI 日志中定位，不被大量其他测试输出淹没

**步骤 2.4：预计算数据校验**

- **操作对象**：`src/shared/data/.checksum.sha256` 校验文件
- **具体操作**：
  ```bash
  # CI 中执行：
  cd src/shared/data
  sha256sum -c .checksum.sha256
  ```
- **输入来源**：`.checksum.sha256` 文件内容格式：
  ```
  abc123def456... lyapunov-default.json
  789ghi012jkl... bifurcation-default.json
  ```
  此文件由开发者在本地运行预计算脚本后生成：
  ```bash
  cd src/shared/data
  sha256sum lyapunov-default.json bifurcation-default.json > .checksum.sha256
  git add .checksum.sha256 && git commit -m "chore: 更新预计算数据校验和"
  ```
- **输出去向**：`sha256sum -c` 输出 `lyapunov-default.json: OK` / `bifurcation-default.json: OK`；退出码 0 = 全部文件哈希匹配
- **失败行为**：哈希不匹配 → 退出码非 0 → job 失败。通常原因：开发者修改了预计算 JSON 但忘记更新校验和文件。CI 日志提示："预计算数据已变更，请运行 scripts/precompute/run_all.py 并提交更新的 .checksum.sha256"
- **注意**：当 `VITE_FEATURE_P3_MODULES=true` 时不运行此步骤（P3 版本可能包含额外的预计算数据，校验规则不同）

#### Stage 3：构建（Job: `build`）

**步骤 3.1：检出代码 + 安装依赖**（同 Stage 1）

**步骤 3.2：注入功能开关环境变量**

- **操作对象**：Vite 构建进程的环境变量
- **具体操作**：
  ```yaml
  - name: Build
    env:
      VITE_FEATURE_P3_MODULES: ${{ github.event.inputs.enable_p3_modules || 'false' }}
      VITE_ENABLE_COMPRESSION: "false"
      VITE_ENABLE_DEBUG_PANEL: "false"
    run: pnpm build
  ```
- **输入来源**：`workflow_dispatch` 输入参数（`enable_p3_modules`）；release 触发时始终为 `true`
- **输出去向**：Vite 的 `import.meta.env.VITE_FEATURE_P3_MODULES` 在构建时被替换为字符串字面量 `"true"` 或 `"false"`，dead code elimination 移除不可达分支
- **失败行为**：环境变量值非法（非 `"true"` 也非 `"false"`）→ 默认回退为 `"false"`

**步骤 3.3：Vite 生产构建**

- **操作对象**：Vite 构建引擎
- **具体操作**：`pnpm build`（映射为 `tsc -b && vite build`）
  - `tsc -b`：TypeScript 项目引用构建模式（项目级类型检查，比 `tsc --noEmit` 更快）
  - `vite build`：Rollup 打包 → Tree-shaking → 代码分割 → 输出 `dist/`
- **输入来源**：`src/` 下所有源文件 + `vite.config.ts` + 功能开关环境变量 + `index.html`
- **输出去向**：`dist/` 文件夹，结构如下：
  ```
  dist/
  ├── index.html                        # 入口 HTML（含 preload hints + module script 标签）
  ├── assets/
  │   ├── index-[hash].js               # 主 bundle（React + D3 + Zustand + R3F）
  │   ├── index-[hash].css              # Tailwind Purge 后 CSS（~3KB）
  │   ├── react-vendor-[hash].js        # React/ReactDOM vendor chunk
  │   ├── three-vendor-[hash].js        # Three.js + R3F vendor chunk
  │   └── data-[hash].json              # 预计算数据（Lyapunov 矩阵 + 分岔采样）
  ├── pyodide/
  │   ├── pyodide.js                    # Pyodide 主入口
  │   ├── pyodide.asm.wasm              # WebAssembly 二进制
  │   └── python_stdlib.zip             # Python 标准库
  └── worker-[hash].js                  # Web Worker 独立 chunk（ODE 求解器）
  ```
- **失败行为**：构建失败（Rollup 错误/OOM/磁盘空间不足）→ job 失败。常见原因：import 路径错误、循环依赖导致 Rollup 无限循环、node_modules 损坏

**步骤 3.4：产物完整性校验**

- **操作对象**：`dist/` 文件夹
- **具体操作**：
  ```bash
  # 校验 1：dist/ 目录非空
  test -f dist/index.html || exit 1

  # 校验 2：关键产物存在
  test -f dist/pyodide/pyodide.js || exit 1
  test -f dist/pyodide/pyodide.asm.wasm || exit 1

  # 校验 3：index.html 引用的资源路径有效（简单检查 script 标签的 src 引用文件名在 dist/assets/ 中存在）
  # 通过 grep + 正则匹配 script src 属性 + test -f 检查逐一验证

  # 校验 4：产物总大小（gzip 前）< 30MB（防止意外包含大文件）
  SIZE=$(du -sm dist | cut -f1)
  if [ "$SIZE" -gt 30 ]; then
    echo "错误: dist/ 大小 ${SIZE}MB 超过上限 30MB"
    exit 1
  fi
  ```
- **输入来源**：`dist/` 文件夹内容
- **输出去向**：stdout 显示各项校验结果；退出码 0 = 全部通过
- **失败行为**：任一校验不通过 → job 失败

**步骤 3.5：上传构建产物**

- **操作对象**：GitHub Actions artifact 存储
- **具体操作**：
  ```yaml
  - uses: actions/upload-artifact@v4
    with:
      name: dist
      path: dist/
      retention-days: 90
  ```
- **输入来源**：`dist/` 文件夹
- **输出去向**：GitHub Actions artifact（zip 格式），可在 Actions 页面下载
- **失败行为**：上传失败（网络/权限）→ job 失败；artifact 超过大小限制（默认 10GB，远大于 dist/ 体积，不会触发）

#### Stage 4：部署（Job: `deploy`，条件执行）

**步骤 4.1：触发条件判断**

- **操作对象**：GitHub Actions 的 `if` 条件
- **具体操作**：
  ```yaml
  deploy:
    needs: build
    if: |
      github.event_name == 'release' ||
      (github.event_name == 'workflow_dispatch' && github.event.inputs.deploy_to_pages == 'true')
    runs-on: ubuntu-latest
    steps:
      # ...
  ```
- **输入来源**：`github.event_name`（`push` / `pull_request` / `workflow_dispatch` / `release`）
- **输出去向**：job 级别决定是否执行
- **行为规则**：
  - `push` 到 main → 不部署（仅构建 + 上传 artifact）
  - `pull_request` → 不部署
  - `workflow_dispatch` 且 `deploy_to_pages == true` → 部署
  - `release.published` → 自动部署

**步骤 4.2：下载构建产物 + 部署到 GitHub Pages**

- **操作对象**：GitHub Pages 服务
- **具体操作**：
  ```yaml
  steps:
    - uses: actions/download-artifact@v4
      with:
        name: dist
        path: dist/

    - uses: actions/configure-pages@v4

    - uses: actions/upload-pages-artifact@v3
      with:
        path: dist/

    - uses: actions/deploy-pages@v4
  ```
- **输入来源**：`dist` artifact（由 Stage 3 上传）→ 下载到 runner → 上传为 Pages artifact → 部署
- **输出去向**：GitHub Pages URL（`https://<owner>.github.io/<repo>/`），部署完成后在仓库 Settings → Pages 中可见
- **失败行为**：部署失败 → job 失败；Pages 未启用（仓库 Settings → Pages 未配置）→ `deploy-pages` 报错

**步骤 4.3：（备选）部署到 gh-pages 分支**

当不使用 GitHub Pages Actions 时（如使用自定义域名 + 反向代理），改用 `peaceiris/actions-gh-pages`：

```yaml
- uses: peaceiris/actions-gh-pages@v4
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./dist
    publish_branch: gh-pages
    force_orphan: true       # 单 commit 历史（保持 gh-pages 分支轻量）
    commit_message: "deploy: ${{ github.sha }} [skip ci]"
```

### 依赖与集成接口

#### CI 管线使用的外部 Actions

| Action | 版本 | 用途 | 输入 | 输出 |
|--------|------|------|------|------|
| `actions/checkout` | v4 | 检出代码 | — | `$GITHUB_WORKSPACE` |
| `pnpm/action-setup` | v4 | 安装 pnpm | `version: 10` | `pnpm` 可用 |
| `actions/setup-node` | v4 | 安装 Node.js | `node-version: 22, cache: pnpm` | `node` 可用 + pnpm store 缓存 |
| `actions/upload-artifact` | v4 | 上传构建产物 | `name: dist, path: dist/` | artifact URL |
| `actions/download-artifact` | v4 | 下载构建产物 | `name: dist, path: dist/` | `dist/` 目录 |
| `actions/configure-pages` | v4 | 配置 Pages | — | Pages 环境就绪 |
| `actions/upload-pages-artifact` | v3 | 上传 Pages 部署物 | `path: dist/` | Pages artifact |
| `actions/deploy-pages` | v4 | 触发 Pages 部署 | — | 部署到 `github.io` |
| `peaceiris/actions-gh-pages` | v4 | 部署到 gh-pages 分支 | `publish_dir, github_token` | `gh-pages` 分支更新 |

#### 需项目本身提供的配置

| 配置项 | 文件位置 | 内容要求 | CI 读取方式 |
|--------|----------|----------|------------|
| Node.js 版本 | `package.json.engines.node` | `">=22.0.0"` | CI `env.NODE_VERSION` 手动同步 |
| pnpm 版本 | `package.json.packageManager` | `"pnpm@10.x.x"` | CI `env.PNPM_VERSION` 手动同步 |
| ESLint 配置 | `eslint.config.js` | flat config 格式 | `pnpm lint` 自动读取 |
| Prettier 配置 | `.prettierrc` | JSON | `pnpm format:check` 自动读取 |
| TypeScript 配置 | `tsconfig.json` | strict 模式 | `tsc --noEmit` 自动读取 |
| 预计算校验和 | `src/shared/data/.checksum.sha256` | SHA-256 行格式 | `sha256sum -c` |
| 功能开关 | `.env.example` | VITE_FEATURE_* 变量 | CI `env` 块注入 |

#### GitHub 仓库设置依赖

CI 管线之外的仓库级配置（由仓库管理员在 GitHub UI 中设置，仅一次）：

| 设置项 | 位置 | 配置值 | 用途 |
|--------|------|--------|------|
| Pages 源 | Settings → Pages → Source | "GitHub Actions" | 允许 `actions/deploy-pages` 部署 |
| 分支保护规则 | Settings → Rules → Rulesets | `main` 分支要求 `check` + `test` + `build` 全部通过才能合并 | 强制 PR 合流门控 |
| Actions 权限 | Settings → Actions → General | "Allow all actions and reusable workflows" + "Read and write permissions" | 允许 CI 上传 artifact 和部署 Pages |

### 状态机

以下为 CI 管线从触发到完成的状态流转：

| 当前状态 | 触发事件 | 下一状态 | 前置条件 | 副作用 |
|----------|----------|----------|----------|--------|
| — | `push` / `pull_request` / `workflow_dispatch` / `release` | `check:queued` | — | GitHub Actions runner 分配（等待空闲 runner） |
| `check:queued` | runner 就绪 | `check:running` | — | 开始执行 Stage 1 job steps |
| `check:running` | `tsc` + `eslint` + `prettier` 全部通过 | `test:queued` | 所有 Step 退出码 0 | Stage 1 标记为 ✅ |
| `check:running` | 任一 Step 失败 | `check:failed` | Step 退出码非 0 | Stage 1 标记为 ❌；后续 Stage 全部跳过 |
| `test:queued` | runner 就绪 | `test:running` | Stage 1 成功 | 开始执行 Stage 2 job steps |
| `test:running` | `vitest` + `physics` + `sha256sum` 全部通过 | `build:queued` | 所有 Step 退出码 0 | Stage 2 标记为 ✅ |
| `test:running` | 任一 Step 失败 | `test:failed` | Step 退出码非 0 | Stage 2 标记为 ❌；`build` 和 `deploy` 跳过 |
| `build:queued` | runner 就绪 | `build:running` | Stage 2 成功 | 开始执行 Stage 3 job steps |
| `build:running` | `vite build` + 完整性校验 + artifact 上传 全部成功 | `build:success` | 所有 Step 退出码 0；`dist/` 非空 | Stage 3 标记为 ✅；artifact `dist` 可用 |
| `build:running` | 任一 Step 失败 | `build:failed` | Step 退出码非 0 | Stage 3 标记为 ❌ |
| `build:success` | `deploy` job 的条件满足 | `deploy:running` | `github.event_name == 'release'` 或 `workflow_dispatch.deploy_to_pages == 'true'` | 开始 GitHub Pages 部署 |
| `build:success` | `deploy` job 的条件不满足 | 完成（不部署） | push/PR 触发 | CI 全部 ✅，无部署 |
| `deploy:running` | Pages 部署成功 | `deploy:success` | 部署 API 返回 200 | GitHub Pages URL 更新为最新内容 |
| `deploy:running` | Pages 部署失败 | `deploy:failed` | 部署 API 返回错误 | `deploy` job 标记为 ❌；可手动重试（GitHub UI → Re-run jobs） |

### 异常与边界条件

#### 异常 1：CI runner 磁盘空间不足

- **触发条件**：`pnpm install` 后 `node_modules/` + 构建时临时文件超过 runner 默认磁盘（14GB）。本项目 `node_modules/` 约 300MB，不含重型原生模块，正常不会触发。但若未来引入 Playwright/Electron 等，可能出现
- **处理策略**：
  1. 在 `pnpm install` 之前添加 `df -h` 检查可用空间
  2. 空间不足 → 清理不需要的工具链：`sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc`
  3. 仍不足 → job 失败，提示"磁盘空间不足，请减少依赖或使用更大 runner"
- **重试参数**：不自动重试。通过 `workflow_dispatch` 手动重跑

#### 异常 2：预计算数据校验文件缺失

- **触发条件**：`src/shared/data/.checksum.sha256` 不存在（新项目初始化或开发者忘记提交）
- **处理策略**：
  1. Step `test (precompute)` 中先检查文件存在：`test -f src/shared/data/.checksum.sha256 || echo "WARNING: 校验文件不存在，跳过预计算数据校验"`
  2. 文件缺失 → 输出警告（WARNING 级别），不阻塞 CI（跳过该 step，持续集成允许首次构建无校验基准）
  3. 该行为定义为临时宽松策略。在首次 release 之前，必须将警告升级为 ERROR（即文件必须存在）
- **重试参数**：不重试。开发者本地生成校验文件后提交

#### 异常 3：GitHub Pages 部署冲突（多人同时触发部署）

- **触发条件**：两个 workflow run 同时进入 `deploy` job，争用同一个 GitHub Pages 环境
- **处理策略**：
  1. GitHub Actions 的 `concurrency` 机制保证：同名 `concurrency.group` 的 workflow run 排队执行
  2. CI 配置中添加：
     ```yaml
     concurrency:
       group: pages-deploy
       cancel-in-progress: false  # 不取消正在进行的部署，排队等待
     ```
  3. 后触发的 run 等待前一个部署完成后再执行
- **重试参数**：排队等待（最多 15 分钟），超时后 job 失败，需手动重试

#### 异常 4：物理回归测试在 CI 中的数值精度与本地不一致

- **触发条件**：Node.js 22 在不同平台（Ubuntu × ARM64 / x86_64）上的浮点运算结果有微小的末位差异（IEEE 754 允许的精度范围），导致物理测试的断言边界不通过
- **处理策略**：
  1. 物理测试断言使用容差而非精确相等：`expect(value).toBeCloseTo(expected, precision)` 其中 precision 按百分比转换
  2. 小角度偏差断言：`expect(deviation).toBeLessThan(0.025)`（比标准 2% 放宽 0.5% 的 CI 容差）
  3. 能量漂移断言：`expect(drift).toBeLessThan(0.0055)`（比标准 0.5% 放宽 0.05% 的 CI 容差）
  4. 若连续 3 次 CI 运行都在同一测试项失败，且本地能通过 → 可能需要增大 CI 容差或锁定 runner 平台
- **重试参数**：不自动重试。CI 容差值在物理测试文件中硬编码，调整时需提交代码变更

#### 异常 5：PR 包含未格式化的代码导致 Prettier check 失败

- **触发条件**：开发者本地未配置 pre-commit hook，提交了未格式化的代码
- **处理策略**：
  1. CI 输出中列出所有格式不符合规范的文件
  2. CI 失败消息中附带修复命令：`pnpm format`
  3. 推荐方案：项目添加 `husky` + `lint-staged` 的 pre-commit hook（可选增强，不阻塞本模块 v1.0）：
     ```json
     // package.json（可选）
     "lint-staged": {
       "src/**/*.{ts,tsx,css,json}": ["prettier --write", "eslint --fix"]
     }
     ```
  4. Pre-commit hook 是本地开发体验优化，不属于 CI 管线的强制依赖。缺少 hook 时 CI 仍能捕获问题
- **重试参数**：不重试。开发者修复格式后推送新 commit

### 原则兑现清单

| 原则来源 | 原则名称 | 代码级约束 |
|----------|----------|------------|
| 技术栈设计 §1.2 | 自包含 HTML5 文件夹 | CI 构建产物 `dist/` 必须是完整的、可独立运行的文件夹（`index.html` + 所有资源 + Pyodide 离线包），不依赖任何外部服务器 |
| 技术栈设计 §9.4 | 三阶段流水线强顺序 | `check` → `test` → `build` → `deploy` 通过 `needs` 声明依赖；前一阶段失败时后续阶段全部跳过 |
| 技术栈设计 §9.4 | 物理回归测试自动化 | Stage 2 必须包含独立的物理验证 step（脚本: `vitest --run physics.test.ts`）；三项验证（小角度 <2%、周期吻合 <1%、能量漂移 <0.5%）全部通过才允许进入构建 |
| 技术栈设计 §9.4 | 预计算数据完整性 | Stage 2 必须通过 `sha256sum -c` 校验预计算 JSON 的哈希一致性；哈希不匹配阻塞 CI |
| 功能模块全拆解 INF-02 | 功能开关机制 | 通过 `VITE_FEATURE_P3_MODULES` 环境变量控制 P3 模块的构建包含/排除；评审版本默认 `false`（tree-shake 未使用的 P3 代码） |
| 功能模块全拆解 INF-02 | 评审版本可复现 | 每次 release 的 `dist` artifact 保留 90 天，可随时下载部署回滚；release 自动部署到 GitHub Pages |
| AGENT.md 核心原则 | 不引入 MOCK 数据 | CI 管线不生成任何测试用的 mock 数据；所有测试数据来自项目源码或预计算脚本的真实输出 |
| 通用原则 | 构建幂等性 | 相同的 commit + 相同的环境变量 → 生成的 `dist/` 内容完全一致（Vite 使用内容哈希命名 chunk，保证可复现性） |

### 验收测试场景

#### 正向测试 1：PR 提交流水线全部通过

- **Given**：
  - 一个 PR 从 feature 分支合并到 `main`
  - PR 包含的文件：修改 `src/features/simulation/engine/rk4.ts`（修复 typo）+ 新增 `src/features/simulation/__tests__/rk4-edge.test.ts`（边界测试）
  - 所有代码已通过 `pnpm format` 格式化
- **When**：PR 推送到 GitHub，触发 CI 的 `pull_request` 事件
- **Then**：
  - `check` job：`tsc --noEmit` 通过，`eslint` 通过，`prettier --check` 通过
  - `test` job：全部 Vitest 测试（含新增的边界测试）通过；物理回归测试三项全部 ✅；预计算数据哈希校验 ✅
  - `build` job：`vite build` 成功；产物完整性校验全部通过；`dist` artifact 上传成功
  - `deploy` job：不触发（PR 不部署）
  - GitHub PR 页面显示全部 ✅，PR 可合并

#### 正向测试 2：Release 自动部署到 GitHub Pages

- **Given**：
  - `main` 分支的最新 commit 已通过 CI（`check` + `test` + `build` 全部 ✅）
  - 仓库 Settings → Pages 已配置为 "GitHub Actions"
- **When**：仓库管理员在 GitHub Releases 页面创建新 release（`v1.0.0`，target: `main`）
- **Then**：
  - 触发 `release.published` 事件
  - `check` → `test` → `build` 三阶段全部重新运行并通过
  - `deploy` job 触发：下载 `dist` artifact → `configure-pages` → `upload-pages-artifact` → `deploy-pages`
  - GitHub Pages URL（`https://<owner>.github.io/<repo>/`）更新为 v1.0.0 的内容
  - `dist` artifact 可在 Actions 页面下载（用于离线评审）

#### 正向测试 3：workflow_dispatch 启用 P3 模块构建

- **Given**：开发者需要预览含全部 P3 模块的完整版本
- **When**：在 GitHub Actions 页面手动触发 workflow：
  - `enable_p3_modules` = `true`
  - `deploy_to_pages` = `true`
- **Then**：
  - Stage 2 跳过预计算数据校验（P3 版本校验规则不同）
  - Stage 3 构建时 `VITE_FEATURE_P3_MODULES=true`：`dist/` 中包含 LAB-03/DAT-03/STY-02 代码
  - `deploy` job 部署到 GitHub Pages
  - 部署后的 URL 可访问完整版应用（含用户可编程沙箱、快照回放、演示模式）

#### 异常测试 1：类型错误阻塞 CI

- **Given**：一个 PR 修改了 `src/shared/types/physics.ts`，将 `theta1: number` 改为 `theta1: string`，但未更新所有引用
- **When**：PR 推送到 GitHub
- **Then**：
  - `check` job 的 `tsc --noEmit` step 失败
  - CI 日志输出类型错误：`TS2322: Type 'string' is not assignable to type 'number'`（含文件名 + 行号）
  - `test` 和 `build` job 因 `needs: check` 被跳过
  - PR 页面显示 ❌，阻止合并

#### 异常测试 2：物理回归测试失败——能量漂移超标

- **Given**：一个 PR 修改了 `odeRhs` 中的阻尼计算，引入了数值精度回归
- **When**：PR 推送到 GitHub
- **Then**：
  - `check` job 通过（类型无变化）
  - `test` job 的单元测试可能通过（如果没有覆盖阻尼精度），但物理回归测试 step 失败
  - CI 日志显示：`✗ 能量守恒漂移 0.8% (≥ 0.5%)`
  - `build` job 被跳过
  - PR 页面显示 ❌

#### 异常测试 3：预计算数据哈希不匹配

- **Given**：开发者在本地修改了 `lyapunov-default.json` 但忘记更新 `.checksum.sha256`
- **When**：PR 推送到 GitHub
- **Then**：
  - `check` job 通过
  - `test` job 的预计算数据校验 step 失败：`lyapunov-default.json: FAILED`
  - CI 日志提示："预计算数据已变更，请运行 scripts/precompute/run_all.py 并提交更新的 .checksum.sha256"
  - `build` job 被跳过

#### 异常测试 4：构建产物完整性校验失败——缺少 Pyodide WASM

- **Given**：`vite.config.ts` 中 `vite-plugin-static-copy` 配置被误删，导致 `public/pyodide/` 未复制到 `dist/`
- **When**：PR 推送到 GitHub（或 `check` + `test` 意外通过——类型检查和测试不感知 copy 插件配置缺失）
- **Then**：
  - `build` job 的产物完整性校验 step 失败：`test -f dist/pyodide/pyodide.asm.wasm` 退出码非 0
  - CI 日志显示：`错误: dist/pyodide/pyodide.asm.wasm 不存在`
  - `dist` artifact 未上传
  - `deploy` job 被跳过

### 注意事项与禁止行为

1. **【lockfile 不可变】** CI 中 `pnpm install` 必须使用 `--frozen-lockfile` 标志。此标志保证 CI 安装的依赖版本与 `pnpm-lock.yaml` 完全一致。若 lockfile 与 `package.json` 不同步，安装失败 → CI 失败 → 提示开发者在本地运行 `pnpm install` 更新 lockfile 并提交。普通 `pnpm install`（无 `--frozen-lockfile`）会静默更新 lockfile，导致 CI 中的依赖版本与本地不一致，破坏构建可复现性。

2. **【环境变量注入时机】** `VITE_` 前缀的环境变量在 Vite 构建时被静态替换为字符串字面量（通过 `define` 或 `import.meta.env`）。这意味着：(a) 环境变量在运行时不可变（已编译进 JS）；(b) 环境变量的值在构建时确定，不能通过运行时配置更改。CI 中通过 workflow YAML 的 `env` 块注入，而非 `.env` 文件（`.env` 文件不在 CI 中读取，所有配置由 CI 显式传入）。

3. **【Runner 平台一致性问题】** 当前 CI 使用 `ubuntu-latest`（x86_64 Linux）。物理回归测试中的浮点运算在某些 CPU 架构（ARM64 / Apple Silicon）上可能产生末位不同。如果未来添加 `macos-latest` runner（ARM64），物理测试断言容差可能需要调整。推荐方案：物理回归测试固定使用 `ubuntu-latest`。

4. **【artifact 保留策略与存储配额】** GitHub Actions 的 artifact 存储有配额限制（免费计划 500MB，Pro 2GB）。每个 `dist` artifact 约 20-25MB（含 Pyodide WASM）。90 天保留期 + 频繁 CI 触发可能积累大量 artifact。建议：(a) PR 的 artifact 保留 7 天（覆盖 code review 窗口即可）；(b) release 的 artifact 保留 90 天；(c) 定期清理旧 artifact（GitHub UI → Actions → 管理 artifact）。

5. **【功能开关不是运行时开关】** `VITE_FEATURE_P3_MODULES` 是通过 Vite `define` 在构建时进行的静态替换。在运行时通过 `localStorage` 或 Zustand 切换 P3 模块不可行——P3 模块的代码已经在构建时被 tree-shake 移除。如需运行时动态加载 P3 模块，需要额外的代码分割 + 动态 import 方案（超出 INF-02 v1.0 范围）。

6. **【禁止在 CI 中运行预计算脚本】** 预计算 Python 脚本（`scripts/precompute/run_all.py`）需要 NumPy + SciPy 依赖和在 CI 中配置 Python 环境，增加 CI 复杂度且耗时（100×100 网格扫描约 5-10 分钟）。约定：预计算由开发者在本地手动运行并将输出 JSON + 校验文件一并提交。CI 仅校验哈希，不重新生成。

7. **【禁止将 secrets 注入到构建产物中】** 如果未来 CI 需要访问外部 API（如部署到自定义 CDN），token 必须通过 GitHub Secrets 传入且在构建步骤中仅作为环境变量使用——绝不写入到 `dist/` 的任何文件中。当前 CI 无外部 API 依赖，无此风险。

8. **【Prettier 与 ESLint 的规则协调】** Prettier 负责格式（缩进、引号、分号、换行），ESLint 负责代码质量（未使用变量、类型安全、最佳实践）。两者的规则不应重叠。推荐使用 `eslint-config-prettier` 关闭 ESLint 中与 Prettier 冲突的格式规则。此配置在 `eslint.config.js` 中完成。

9. **【pipeline 跳过指令】** 当 commit message 包含 `[skip ci]` 或 `[ci skip]` 时，GitHub Actions 自动跳过整个 workflow。用于仅文档/注释变更的提交。但对于 `main` 分支的提交，禁止使用此指令（`main` 分支的任何提交必须经过 CI 验证）。分支保护规则中可配置强制 CI 通过。

10. **【易错点】** `actions/upload-artifact@v4` 和 `actions/download-artifact@v4` 的 `name` 参数必须完全匹配（包括大小写）。当前定义为 `name: dist`。不同 job 间的 artifact 传递通过全局名称匹配，拼写错误会导致 "artifact not found" 错误。

11. **【易错点】** `workflow_dispatch` 的 `inputs` 值在 `github.event.inputs.<name>` 中访问，且所有值都是字符串类型。`enable_p3_modules` 在 YAML 中定义为 `type: boolean` 但传入时仍是字符串 `"true"` / `"false"`。在 `env` 块中引用时无需额外转换（Vite 的 `import.meta.env` 本身也是字符串）。

12. **【偷懒红线】** CI YAML 文件中的每个 step 必须带 `name` 字段（人类可读的中文名称），以便在 GitHub Actions UI 中快速定位失败步骤。禁止省略 `name` 或使用默认的 `Run ...` 名称。
