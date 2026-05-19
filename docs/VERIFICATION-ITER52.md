# VERIFICATION.md — Iteration #52 Review

> 审查任务: **R154: ESLint 警告清零 LintWarningZeroR53**
> 审查日期: 2026-05-19
> 审查人: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 任务目标「0 errors 0 warnings」未达成；仍剩 21 warnings |
| 代码质量 | ⚠️ | 部分修复合理（删除未使用导入），但存在死代码未清理、`max-warnings` 未收紧 |
| 测试覆盖 | ✅ | 6117 pass / 0 fail，全量回归无新增回归 |
| 文档同步 | ❌ | CHANGELOG.md 无 R154 条目；TODO.md 未标记完成 |
| 安全质量 | ✅ | 无硬编码密钥、无 XSS 风险 |

**综合判定: ❌ 返工**

---

## 功能完整性分析

### 任务声明 vs 实际结果

| 指标 | 目标 | 实际 | 差距 |
|------|------|------|------|
| ESLint errors | 0 | 0 | ✅ 达成 |
| ESLint warnings | 0 | **21** | ❌ 未达成 |
| `max-warnings` 收紧为 0 | 是 | **仍为 10000** | ❌ 未执行 |
| CHANGELOG 更新 | 是 | **未更新** | ❌ 未执行 |

### 本次 diff 修复的警告（约 22 处）

| 文件 | 修复方式 | 评价 |
|------|----------|------|
| `lib/evolution-signals.js` | `signal` → `_signal`（×2） | ✅ 合理，函数签名保留但参数未使用 |
| `lib/evolution.js` | 移除 3 个未使用 import | ✅ 正确删除 |
| `lib/git-repo.js` | 移除未使用变量 `headHandle` | ✅ 正确 |
| `lib/importer.js` | `filename` → `_filename`，`i` → `_i` | ✅ 合理 |
| `lib/knowledge-base-export.js` | `sort` → `_sort` | ⚠️ 见下方问题 1 |
| `lib/knowledge-graph-layout.js` | `nodeMap` → `_nodeMap` | ✅ 合理 |
| `lib/offline-answer-store.js` | `reject` → `_reject` | ⚠️ 见下方问题 2 |
| `lib/page-sense.js` | `ctx` → `_ctx`（×2），`skillEngine` → `_skillEngine`，`ctx` → `_ctx` | ✅ 合理 |
| `lib/plugin-system-utils.js` | 移除未使用 import，留注释 | ✅ 正确 |
| `lib/skill-store-community.js` | 移除未使用 import + 常量；`manifest` → `_manifest` | ⚠️ 见下方问题 3 |
| `lib/skill-store.js` | 移除未使用 `getAllSkills` import | ✅ 正确 |

### 未修复的 21 处警告（分布在 10 个文件）

| 文件 | 警告数 | 类型 |
|------|--------|------|
| `sidebar/sidebar.js` | 8 | `messageEl`×3, `knowledgeToolbar`, `swiping`, `listAttrs`, `itemAttrs`, `app` |
| `options/options.js` | 2 | `aiGatewaySection`, `gateway` |
| `lib/wiki-query-prompts.js` | 2 | `id`×2 |
| `lib/bookmark-sharing.js` | 2 | `Buffer`（no-undef） |
| `lib/skill-validator.js` | 1 | `inBlock` |
| `lib/skill-zip.js` | 1 | `uncompressedSize` |
| `lib/storage-adapter.js` | 1 | `result` |
| `lib/utils.js` | 1 | `currentUrl` |
| `popup/bookmark-overview.js` | 1 | `getStatusLabels` |
| `scripts/test-shard.js` | 1 | `basename` |

---

## 发现的问题

### ❌ 问题 1：死代码未删除 — `knowledge-base-export.js`

```js
// lib/knowledge-base-export.js:42
const _sort = (obj) => Object.entries(obj).map(([k, c]) => ({ ... })).sort((a, b) => b.count - a.count);
```

`_sort` 函数从未被调用。这是纯粹的死代码（dead code），应**直接删除**而非前缀 `_`。前缀 `_` 仅适用于「有意保留的未使用参数」（如回调签名），不适用于未使用的变量/函数定义。

**返工建议**: 删除 `_sort` 及相关行。

### ⚠️ 问题 2：Promise reject 回调标记为未使用 — `offline-answer-store.js`

```js
// lib/offline-answer-store.js:217
return new Promise((resolve, _reject) => {
```

`_reject` 被标记为有意忽略，但 Promise 构造函数中不使用 `reject` 通常意味着错误不会被捕获——如果 `store.delete()` 或 `tx.oncomplete` 出错，Promise 可能永远 pending。这是潜在的 **bug**，而非简单的 lint 问题。

**返工建议**: 检查是否需要添加 `tx.onerror` / `req.onerror` → `_reject(err)` 错误处理路径。

### ⚠️ 问题 3：`_manifest` 解构丢弃 — `skill-store-community.js`

```js
// lib/skill-store-community.js:157
const { files, manifest: _manifest } = await this.fetchFromGitHub(repo, options)
```

`fetchFromGitHub` 返回 `{ files, manifest }`，但 `installFromGitHub` 仅使用 `files` 做校验，完全忽略了 `manifest`。这可能是有意的（manifest 信息已在 files 中隐含），但也可能是 **遗漏校验**——应确认 manifest 是否需要独立验证。

**返工建议**: 如确认不需要 manifest，应简化为 `const { files } = ...` 以表达意图。

### ❌ 问题 4：`max-warnings` 未收紧

任务明确要求「将 `eslint.config.js` 中 `max-warnings` 收紧为 0」。实际上：

- `max-warnings` 设置在 `package.json` 的 `"lint"` script 中（`--max-warnings 10000`）
- 本次变更**未修改** `package.json` 或 `eslint.config.js`

即使修复了所有 21 处警告，`max-warnings` 仍为 10000，无法防止后续引入新警告。

**返工建议**: 在修复全部警告后，将 `package.json` 中 `--max-warnings 10000` 改为 `--max-warnings 0`。

### ❌ 问题 5：CHANGELOG.md 缺少 R154 条目

CHANGELOG.md 的 `[Unreleased]` 部分仅有 R153 条目，未记录 R154 变更。

### ❌ 问题 6：TODO.md 未更新

TODO.md 未标记 R154 为完成状态。

---

## 返工任务清单

| # | 优先级 | 任务 | 文件 |
|---|--------|------|------|
| 1 | P0 | 修复剩余 21 处 ESLint 警告（sidebar.js 8 处、options.js 2 处、wiki-query-prompts.js 2 处等） | 多文件 |
| 2 | P0 | 删除 `knowledge-base-export.js` 中死函数 `_sort` | `lib/knowledge-base-export.js` |
| 3 | P1 | 将 `package.json` 中 `--max-warnings 10000` 改为 `--max-warnings 0` | `package.json` |
| 4 | P1 | 更新 CHANGELOG.md 添加 R154 条目 | `docs/CHANGELOG.md` |
| 5 | P1 | 更新 TODO.md 标记 R154 完成 | `docs/TODO.md` |
| 6 | P2 | 检查 `offline-answer-store.js` 中 Promise `reject` 是否为潜在 bug | `lib/offline-answer-store.js` |
| 7 | P2 | 简化 `skill-store-community.js` 中 `manifest: _manifest` 为 `const { files }`（如确认不需要） | `lib/skill-store-community.js` |
| 8 | P0 | 验证 `npm run lint` 输出 0 errors / 0 warnings | — |

---

## 附注：R153 变更（staged changes）

本次 staged 区还包含 R153 的测试失败修复（regex `\b` 词边界修正），该部分变更测试已通过（6117 pass / 0 fail），代码逻辑正确。但 R153 和 R154 的变更混在同一批 staged 中，建议后续迭代注意隔离。

