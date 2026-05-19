# 需求文档 — 迭代 6：代码静态检查 ESLintSetup

> 创建日期: 2026-05-19
> 迭代主题: R109 代码静态检查 ESLintSetup
> 前置迭代: Phase H (R108-R112)
> 历史记录: 迭代 6 标识曾用于 R046/R047 技能生态需求（已完成/废弃）

---

## R109: 代码静态检查 ESLintSetup

### 用户故事

**作为** PageWise 项目的开发者，**我希望** 在每次提交前自动运行 ESLint 静态检查，**以便** 在代码合入前捕获未定义变量、未使用变量、类型比较错误和隐式全局声明等常见 bug，防止低级错误流入生产代码。

### 验收标准

| # | 验收标准 | 优先级 |
|---|---------|--------|
| AC-1 | 项目根目录存在 `eslint.config.js`，使用 ESLint flat config 格式（ES Modules 导出），兼容 `"type": "module"` 项目的 `import` 语法 | P0 |
| AC-2 | 启用以下 4 条核心规则，且**不得**被 `overrides` 或 `off` 覆盖：`no-unused-vars`（error）、`no-undef`（error）、`eqeqeq`（error）、`no-implicit-globals`（error） | P0 |
| AC-3 | `package.json` 新增 `"lint"` script，执行 `eslint .`；新增 `"lint:fix"` script，执行 `eslint . --fix`；`npm run lint` 在项目根目录可直接运行、零配置 | P0 |
| AC-4 | 现有代码基线可通过 lint（允许 `--max-warnings N` 临时从宽，N 需记录在本需求文档中）；渐进收紧计划：每轮迭代将 N 降低 20%，目标 N=0 | P1 |
| AC-5 | CI 工作流 `.github/workflows/ci.yml` 中现有 `lint` job 增加 `npm install` + `npx eslint . --max-warnings N` 步骤；PR 不通过时阻断合入 | P0 |

### 技术约束

| # | 约束 | 原因 |
|---|------|------|
| C-1 | 使用 ESLint v9+ flat config（`eslint.config.js`），**不使用** `.eslintrc.*` 遗留格式 | Flat config 是 ESLint 官方推荐格式，ES Modules 原生支持，与项目 `"type": "module"` 一致 |
| C-2 | 仅安装 `eslint` 一个 devDependency，**不引入** `@eslint/js`、`eslint-config-*` 等扩展包 | 项目约束：最小依赖原则（D002 设计决策：不引入构建工具） |
| C-3 | `eslint.config.js` 需声明 `languageOptions.globals` 中 Chrome Extension 运行时的关键全局变量（如 `chrome`、`browser`），避免 `no-undef` 对合法的 Chrome API 调用误报 | Content script / Sidebar / Popup / Background 均依赖 `chrome.*` API |
| C-4 | `ignores` 配置排除 `node_modules/`、`coverage/`、`docs/`、`icons/`、`_locales/`、`*.json`、`*.css`、`*.html` | 仅检查 `.js` 源码文件 |
| C-5 | 不使用 `--max-warnings 0` 作为初始基线，需基于 `npm run lint` 实际输出确定初始 N 值 | 避免因历史代码批量修复引入回归风险 |
| C-6 | `eqeqeq` 规则配置为 `["error", "smart"]`，允许 `== null` 和 `== undefined` 的惯用比较 | 减少误报，`== null` 同时覆盖 `null` 和 `undefined` 是 JS 社区广泛接受的写法 |
| C-7 | `no-unused-vars` 配置 `argsIgnorePattern: "^_"`，允许以 `_` 前缀命名的未使用参数 | 回调函数签名约定（如 `(_err, data) =>`）是常见模式 |

### 依赖关系

```
R108 (TestCoverage)          ← 已完成，提供 c8 覆盖率基线
    ↓
R109 (ESLintSetup)           ← 本需求
    ↓
R112 (TechDebtCleanup)       ← 后续：README 添加 lint badge
```

| 依赖 | 方向 | 说明 |
|------|------|------|
| R108 TestCoverage | 前置（已完成） | 确认测试基础设施稳定，lint 不会干扰 `c8` 覆盖率收集 |
| R110 CoreFlowFix | 后续（无阻断） | R110 修改业务代码后需通过 lint 检查，但不依赖 R109 |
| R112 TechDebtCleanup | 后续（无阻断） | R112 将在 README 添加 lint badge，依赖本需求完成后输出 N=0 状态 |
| CI workflow `ci.yml` | 直接修改 | 现有 `lint` job 仅有 `node --check` 语法检查，需替换/增强为 ESLint |

### 范围界定

**包含：**
- `eslint.config.js` 创建与规则配置
- `package.json` 添加 `lint` / `lint:fix` scripts 和 `eslint` devDependency
- CI `lint` job 增加 ESLint 步骤
- 现有代码基线 lint 修复（仅修复 `error` 级别告警）
- `--max-warnings N` 初始值确定

**不包含：**
- Prettier 或其他代码格式化工具（后续迭代考虑）
- 自定义 ESLint 插件开发
- 代码风格规则（如 `indent`、`semi`、`quotes`）— 项目采用无分号风格，但不在本轮强制编码风格规则
- 一次性修复所有 `warning` 级别告警（渐进收紧）

### 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 现有代码 lint error 过多，修复工作量超预期 | 低 | 中 | 先统计 `--max-warnings` 实际数量，仅修 error 级别；warning 留至后续迭代 |
| Chrome Extension 全局变量误报 | 中 | 低 | `languageOptions.globals` 配置覆盖 `chrome`、`fetch`、`setTimeout` 等浏览器 API |
| ESLint v9 flat config 与 Node 22 兼容性 | 低 | 低 | ESLint v9 原生支持 Node 18+，CI 使用 Node 22 |

### 初始 `--max-warnings` 渐进计划

| 迭代 | 预期 max-warnings | 说明 |
|------|-------------------|------|
| R109（本轮） | N = 实测值 | 建立基线，不强制修 warning |
| R110 | N × 0.8 | 修代码时顺带修 lint warning |
| R111 | N × 0.6 | 安全加固时集中修 warning |
| R112 | N × 0.4 | 最终清理阶段 |
| R113+ | 0 | 零告警目标 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R109 | 新增 ESLintSetup 代码静态检查需求（迭代 6 重定义） |
| 2026-04-xx | R046/R047 | 原迭代 6 技能生态需求（已完成/废弃） |
