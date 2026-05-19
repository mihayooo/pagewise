# VERIFICATION.md — Iteration #6 Review

> 审核人: Guard Agent
> 审核日期: 2026-05-19
> 审核范围: R109 代码静态检查 ESLintSetup

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 5 项 AC 中仅 AC-1 部分完成；AC-2 规则级别错误；AC-3 缺 lint:fix；AC-4 未确定实际 N 值；AC-5 CI 集成完全缺失 |
| 代码质量 | ⚠️ | eslint.config.js 结构正确、flat config 格式规范，但 eqeqeq 模式与需求 C-6 冲突，ignores 不够完整 |
| 测试覆盖 | ⚠️ | test-eslint-infra.js 新增 23 个测试用例，21 pass / 2 fail；2 个失败直指 CI 集成和设计文档缺失 |
| 文档同步 | ❌ | CHANGELOG.md 未更新 R109 条目；TODO.md R109 未标记完成；DESIGN.md 无 D023 决策记录 |

**结论: ❌ 未通过 — 需返工**

---

## 逐项验收标准检查

### AC-1: eslint.config.js flat config (ES Modules) — ⚠️ 部分通过

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件存在 | ✅ | `eslint.config.js` 已创建 |
| 使用 `export default` | ✅ | ES Modules 格式正确 |
| 配置是数组格式 | ✅ | flat config 标准格式 |
| ESLint v9+ | ✅ | `eslint@^9.39.4` |
| 仅 `eslint` 一个 devDependency | ✅ | 未引入额外扩展包 |

### AC-2: 四条核心规则 — ❌ 未通过

| 规则 | 需求 | 实际 | 状态 |
|------|------|------|------|
| `no-unused-vars` | error | **warn** | ❌ 级别不符 |
| `no-undef` | error | **warn** | ❌ 级别不符 |
| `eqeqeq` | `["error", "smart"]` (C-6) | **`["error", "always"]`** | ❌ 模式不符 |
| `no-implicit-globals` | error | error | ✅ |

**问题详情:**
- AC-2 明确要求 4 条规则均为 `error` 级别，但 `no-unused-vars` 和 `no-undef` 设为 `warn`
- 需求 C-6 明确要求 `eqeqeq` 配置为 `["error", "smart"]`（允许 `== null`/`== undefined`），但实现为 `["error", "always"]`
- `"always"` 模式导致 **100 个 eqeqeq error** 散布在现有代码中，阻断 `npm run lint` 正常通过
- `--max-warnings 10000` 只抑制 warning，不抑制 error，因此当前 **lint 实际无法通过**

### AC-3: package.json lint scripts — ❌ 未通过

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `lint` script 存在 | ✅ | `eslint . --max-warnings 10000` |
| `lint:fix` script 存在 | ❌ | **未添加**，需求明确要求 `eslint . --fix` |
| 零配置可运行 | ⚠️ | 可运行但因 100 个 error 不通过 |

### AC-4: 基线 --max-warnings — ⚠️ 部分通过

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 初始 N 值记录 | ⚠️ | 使用 `10000` 但未记录实际基线值 |
| 实测基线 | ❌ | 当前 528 warnings + 100 errors；N=10000 过于宽松无意义 |
| 渐进计划文档 | ✅ | REQUIREMENTS-ITER6.md 包含渐进收紧表 |

**问题:** `--max-warnings 10000` 不是基于实测值，而是随意设的极大值。需求 C-5 要求 "需基于 `npm run lint` 实际输出确定初始 N 值"，应记录为 `N=528`（当前 warnings 数）。

### AC-5: CI 集成 — ❌ 完全未实现

| 检查项 | 结果 | 说明 |
|--------|------|------|
| CI lint job 包含 ESLint 步骤 | ❌ | `.github/workflows/ci.yml` 未添加 `npm run lint` 或 `npx eslint` |
| PR 阻断机制 | ❌ | 无 ESLint 相关阻断 |
| `npm install` | ❌ | lint job 无 `npm install` 步骤 |

**当前 CI lint job 内容:** 仅有 `node --check` 语法检查 + `manifest.json` 验证，**完全没有 ESLint 集成**。

---

## 发现的问题

### 🔴 严重 (Severity: Critical)

**P1: CI 集成完全缺失 (AC-5, P0)**
- `.github/workflows/ci.yml` 的 `lint` job 中未添加任何 ESLint 相关步骤
- 这是 P0 验收标准，阻断 PR 合入的核心功能未实现
- 测试 `test-eslint-infra.js:221` 明确检测到此失败

**P2: eqeqeq 模式与需求冲突 + 100 errors 阻断 lint**
- 需求 C-6 明确: `"smart"` 模式允许 `== null`
- 实现: `"always"` 模式，导致全项目 100 个 eqeqeq error
- `--max-warnings` 不覆盖 error 级别，`npm run lint` 实际报错退出
- 结果: **ESLint 完全无法作为 CI gate 使用**

**P3: 核心规则级别不匹配 (AC-2, P0)**
- `no-unused-vars` 和 `no-undef` 应为 `error`，实为 `warn`
- 这降低了代码质量门禁力度

### 🟡 中等 (Severity: Medium)

**P4: 缺少 `lint:fix` script (AC-3, P0)**
- 需求明确要求 `"lint:fix": "eslint . --fix"`
- 当前 `package.json` 只有 `lint` script

**P5: ignores 配置不完整 (C-4)**
- 需求 C-4 要求忽略: `docs/`, `icons/`, `_locales/`, `*.json`, `*.css`, `*.html`
- 实际仅忽略: `node_modules/`, `coverage/`, `docs/reference/`, `dist/`, `_metadata/`, `lib/pdf.min.mjs`, `lib/pdf.worker.min.mjs`, `lib/pdf.min.js`, `lib/pdf.worker.js`
- 缺失: `docs/`（仅忽略 `docs/reference/`）、`icons/`、`_locales/`、`*.json`、`*.css`、`*.html`

**P6: `--max-warnings` 基线值未实测 (C-5)**
- 当前使用 `10000`，应基于实际输出确定
- 实测: 528 warnings，应记录为 `N=528`

**P7: eslint-disable 注释被错误移除**
- `tests/test-bookmark-scheduler.js:682`: 删除了 `// eslint-disable-line no-throw-literal`
- `tests/test-knowledge-panel-e2e.js:197`: 删除了 `// eslint-disable-next-line no-use-before-define`
- 这些注释是为抑制合法的 lint 告警而存在的，移除后留下多余空格，且一旦规则收紧将重新触发告警

### 🟢 低 (Severity: Low)

**P8: 文档同步缺失**
- `CHANGELOG.md` 未添加 R109 变更记录
- `TODO.md` R109 未标记 `[x]` 完成
- `DESIGN.md` 未添加 D023 决策记录（但 `eslint.config.js` 注释中引用了 D023）

**P9: `pdf.worker.min.mjs` 无意义变更**
- 该文件为第三方 pdf.js 构建产物（2MB minified）
- `diff` 显示整个文件内容发生了重排/重编译
- 已在 ignores 中排除 lint，但此变更不应出现在本次 PR

---

## 返工任务清单

| # | 优先级 | 任务 | 说明 |
|---|--------|------|------|
| 1 | 🔴 P0 | CI 集成 — 在 `ci.yml` lint job 中添加 `npm install` + `npm run lint` | AC-5 要求；需在 `Check JS syntax` 步骤之后添加 |
| 2 | 🔴 P0 | 修复 eqeqeq 规则 — 改为 `["error", "smart"]` | C-6 要求；当前 `"always"` 导致 100 个 error 阻断 lint |
| 3 | 🔴 P0 | 修复规则级别 — `no-unused-vars` 和 `no-undef` 改为 `"error"` | AC-2 要求 4 条规则均为 error |
| 4 | 🟡 P1 | 添加 `lint:fix` script — `"lint:fix": "eslint . --fix"` | AC-3 要求 |
| 5 | 🟡 P1 | 补全 ignores — 添加 `docs/`, `icons/`, `_locales/`, `*.json`, `*.css`, `*.html` | C-4 要求 |
| 6 | 🟡 P1 | 确定实际 --max-warnings 基线 — 修复规则后重新运行 `npm run lint`，记录真实 N 值 | C-5 要求 |
| 7 | 🟡 P1 | 恢复 eslint-disable 注释 — 两处被删除的 eslint-disable 注释需恢复 | 避免后续告警复发 |
| 8 | 🟢 P2 | 更新文档 — CHANGELOG.md 添加 R109 条目；TODO.md 标记 R109 完成；DESIGN.md 添加 D023 | 文档同步要求 |
| 9 | 🟢 P2 | 撤回 pdf.worker.min.mjs 变更 — 非本次迭代范围内的第三方文件变更 | 减少 PR 噪音 |

---

## 测试验证结果

```
# tests 23
# pass  21
# fail  2
```

### 通过的测试 (21)
- package.json ESLint 配置验证 (4/4)
- eslint.config.js Flat Config 验证 (7/7)
- ESLint 规则配置验证 (4/4)
- ESLint 环境与语言选项 (2/2)
- ESLint 工具可用性 (2/2)
- CI 集成 — lint job 存在 (1/1)

### 失败的测试 (2)
| 测试 | 原因 | 对应返工任务 |
|------|------|-------------|
| `CI 集成 — lint job 包含 npm run lint 步骤` | ci.yml 中无 `npm run lint` 或 `eslint` 调用 | #1 |
| `设计文档验证 — TD 状态表包含 ESLint 相关记录` | DESIGN.md 中无 lint/ESLint 相关内容 | #8 |

---

## 评分

| 维度 | 得分 | 满分 | 说明 |
|------|------|------|------|
| 功能完整性 | 2/10 | 10 | 5 项 AC 仅 1 项通过，4 项不通过 |
| 代码质量 | 5/10 | 10 | 配置结构正确但规则配置全部有误 |
| 测试覆盖 | 7/10 | 10 | 测试用例全面但自身暴露了缺失项 |
| 文档同步 | 1/10 | 10 | 几乎完全未更新 |
| **综合** | **3.75/10** | **10** | **❌ 未通过，需返工** |

