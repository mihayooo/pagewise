# 需求文档 — 迭代 R133: Lint 警告清零 LintWarningFinal

> 版本: 1.0 | 日期: 2026-05-19 | 复杂度: Medium | 飞轮迭代 R29

---

## 1. 用户故事

**作为** PageWise 的开发者 / 维护者，
**我希望** 代码库中不存在任何 ESLint 警告，并将 `no-unused-vars` 规则从 `warn` 收紧为 `error`，
**以便** 代码质量基线正式锁定——未来的 PR 合入时，未使用变量 / 未使用导入 / 未使用参数在 CI 阶段即被拦截，杜绝技术债重新累积。

---

## 2. 当前基线数据

| 指标 | 数值 |
|------|------|
| 受影响文件数 | 40 |
| 总警告数 | 115 |
| `no-unused-vars` 警告 | 112 |
| `no-undef` 警告 | 3（均为 `Buffer` 引用） |
| 当前 `max-warnings` 阈值 | 10000 |
| 目标 | 0 errors, 0 warnings |

### 警告分布（按文件 Top-10）

| 文件 | 警告数 | 典型问题 |
|------|--------|----------|
| `sidebar/sidebar.js` | 57 | 超大模块拆分（R130）后遗留的大量未使用导入 |
| `lib/page-sense.js` | 4 | 未使用函数参数 (`ctx`, `skillEngine`) |
| `lib/evolution.js` | 4 | 未使用函数参数 (`signal`, `interactions`, `signals`) |
| `lib/bookmark-visualizer.js` | 3 | 未使用变量 (`MAX_ITERATIONS`, `totalVelocity`) + 未使用参数 (`e`) |
| `lib/bookmark-backup-restore.js` | 3 | 重复赋值但未读取 (`errors`) |
| `lib/bookmark-sync.js` | 2 | 同上 (`errors`) |
| `lib/git-repo.js` | 3 | 赋值后未使用 (`headHandle`, `compressed`, `handle`) |
| `lib/batch-summary.js` | 2 | 未使用参数 (`maxChars`) |
| `lib/wiki-query.js` | 2 | 解构赋值未使用 (`id`) |
| 其余 31 个文件 | 各 1-2 个 | 散布的未使用导入 / 变量 / 参数 |

### 警告分类

| 类别 | 数量 | 处理策略 |
|------|------|----------|
| 未使用导入 / 导出符号 | ~30 | 删除 import；若符号已无使用处，删除对应 export（需确认无副作用） |
| 赋值后未使用的局部变量 | ~22 | 删除赋值或删除整个语句（若无副作用） |
| 未使用函数参数 | ~14 | 前缀 `_` 标记（保持签名兼容） |
| 未使用解构变量 | ~6 | 前缀 `_` 或用省略语法 `[, , ]` |
| `no-undef` (`Buffer`) | 3 | 添加全局声明或改用 polyfill |

---

## 3. 验收标准

### AC-1: `npm run lint` 零警告零错误
- 执行 `npm run lint` 输出结果为 **0 errors, 0 warnings**
- 不依赖 `--max-warnings` 绕过（阈值收紧为 0）

### AC-2: `no-unused-vars` 规则级别升级
- `eslint.config.js` 中 `no-unused-vars` 从 `'warn'` 改为 `'error'`
- `--max-warnings` 参数从 `10000` 改为 `0`
- 保持 `argsIgnorePattern: '^_'` / `varsIgnorePattern: '^_'` / `caughtErrorsIgnorePattern: '^_'` 不变

### AC-3: 40 个文件逐个清理完毕
- 每个文件仅做最小化变更（删除未使用导入 / 未使用变量 / 前缀 `_`）
- **不改变任何运行时行为**：删除的符号必须确认在运行时无副作用
- `sidebar/sidebar.js` 大量未使用导入需特别谨慎，确认无动态引用

### AC-4: `no-undef` 警告消除
- 3 处 `Buffer` 引用（`bookmark-sharing.js` ×2, `skill-store-community.js` ×1）已解决
- 方案选择：在 `eslint.config.js` 的 globals 中添加 `Buffer: 'readonly'`，或在文件中添加 `typeof Buffer !== 'undefined'` 守卫，或替换为无 Buffer 依赖的实现

### AC-5: 测试全部通过
- `npm test` 全部用例通过（无新增失败）
- 清理操作未引入新的 lint 警告

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **零行为变更** | 本次迭代纯清理，不新增功能、不改逻辑、不改接口签名 |
| **前缀 `_` 约定** | 未使用参数统一加 `_` 前缀（如 `pageContext` → `_pageContext`），保持函数签名向后兼容 |
| **删除导入需验证** | 删除 import 前需 grep 确认：(1) 无动态引用 `window[name]` / `globalThis[name]`；(2) 无副作用导入（如 polyfill 注册）；(3) 无 content script IIFE 中的隐式依赖 |
| **`sidebar/sidebar.js` 特殊处理** | 该文件有 57 个警告，主要来自 R130 模块拆分后遗留的「聚合导入」。需确认每个被删除的导入是否在其他模块中已独立引入；若该文件作为「入口聚合器」有意保留，应改为 `export { } from` 重导出模式或删除 |
| **测试文件不受影响** | `eslint.config.js` 中 `tests/**/*.js` 已配置 `'no-unused-vars': 'off'`，本次不修改测试文件 |
| **ESLint 版本** | v9+ flat config 格式（`eslint.config.js`），不引入 `.eslintrc` 遗留格式 |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| **R130: ModuleSplitPhase2** | 前置完成 | `sidebar/sidebar.js` 中 ~50 个未使用导入主要由模块拆分遗留，本次作为收尾清理 |
| **R109: ESLint 基线** | 前置完成 | 当前 `eslint.config.js` 已就位，规则框架无需重新搭建 |
| **CI pipeline** | 后续影响 | `--max-warnings 0` 后，CI 中 lint 不通过将直接阻断合并 |
| **后续所有迭代** | 后续影响 | `no-unused-vars: error` 作为全局基线，所有新代码必须符合 |

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|----------|
| 删除「看似未使用」的导入后，运行时因动态引用崩溃 | 低 | 高 | 逐文件 grep + 运行测试双重验证；高风险文件（content script）手动检查 |
| `Buffer` 替换方案引入 Node.js 兼容性问题 | 低 | 中 | 优先选择 globals 声明方案，保持 `Buffer` 在 Node 环境可用 |
| `sidebar/sidebar.js` 批量删除导入引发连锁问题 | 中 | 高 | 分批处理：先删除确定无引用的（graph/visualizer 相关），运行测试后再处理剩余 |
| `eslint.config.js` 收紧后阻断其他正在进行的 PR | 低 | 中 | 本次迭代完成后一次性提交，避免中间状态 |

---

## 7. 实施建议（非代码，仅指引）

### 分批策略建议

| 批次 | 范围 | 预计工作量 |
|------|------|-----------|
| **批次 1** | `sidebar/sidebar.js`（57 个警告）— 最大单一风险点 | 高 |
| **批次 2** | `lib/` 下 14 个各 2-4 个警告的文件 | 中 |
| **批次 3** | `lib/` 下 21 个各 1 个警告的文件 | 低 |
| **批次 4** | `options/options.js` + `popup/bookmark-overview.js` + `lib/bookmark-sharing.js` + `lib/skill-store-community.js`（`no-undef`） | 低 |
| **批次 5** | `eslint.config.js` 规则收紧 + `package.json` 脚本 `--max-warnings 0` | 低 |

### 每个文件的处理决策树

```
对于每个警告符号:
├── 是否为 import 导入的符号?
│   ├── 是 → grep 确认无使用 → 删除该 import 语句
│   └── 否 ↓
├── 是否为函数参数?
│   ├── 是 → 重命名: 加 `_` 前缀
│   └── 否 ↓
├── 是否为赋值后未使用的局部变量?
│   ├── 赋值有副作用 (如 await / 函数调用)? 
│   │   ├── 是 → 保留调用，删除赋值目标: `const _x = await fn()`
│   │   └── 否 → 删除整个语句
│   └── 否 ↓
└── 是否为解构变量?
    ├── 可省略 → 使用 `[, value]` 或 `{ prop: _prop }`
    └── 不可省略 → 加 `_` 前缀
```

---

## 8. 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-05-19 | 1.0 | 初始需求文档，基于 `npm run lint` 实际输出 115 warnings 分析 |
