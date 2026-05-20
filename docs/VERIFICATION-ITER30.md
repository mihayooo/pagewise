# VERIFICATION.md — Iteration #30 Review

> **任务**: R187: 核心模块测试补全 — bookmark 系列  
> **迭代**: 30  
> **审查日期**: 2026-05-20  
> **变更文件**: `tests/test-bookmark-core-unit.js`, `tests/test-bookmark-graph-engine-unit.js`, `tests/test-bookmark-search-core.js` (untracked)

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | 三个模块均达到 ≥15 用例目标，但 10/41 新用例执行失败 |
| 代码质量 | ⚠️ | 存在作用域错误和对源码行为的误判 |
| 测试覆盖 | ⚠️ | 用例数达标 (23 + 18 + 30)，但通过率仅 75.6% (31/41) |
| 文档同步 | ❌ | CHANGELOG.md 未更新 R187 条目；TODO.md R187 仍标记 `[ ]` |
| 安全质量 | ✅ | 无硬编码密钥、无 XSS 风险 |

---

## 测试执行详情

| 测试文件 | 总用例 | 新增用例 | 通过 | 失败 |
|----------|--------|----------|------|------|
| `test-bookmark-core-unit.js` | 78 | 23 | 22 | **1** |
| `test-bookmark-graph-engine-unit.js` | 45 | 18 | 9 | **9** |
| `test-bookmark-search-core.js` | 30 | 30 | 30 | 0 |
| **合计** | 153 | 71 | 61 | **10** |

---

## 发现的问题

### 🔴 P0 — 严重: `sampleBookmarks` 作用域不可达 (9 个用例失败)

**文件**: `test-bookmark-graph-engine-unit.js`  
**位置**: R187 补充测试区 (L202–L381)  
**影响用例**: 9 个用例

`sampleBookmarks` 定义在第一个 `describe('BookmarkGraphEngine')` 内部 (L7, `const`), 是块级作用域变量。R187 补充测试位于一个**独立的顶层** `describe('BookmarkGraphEngine (R187 补充)')` 块中，**无法访问**该变量。

**失败用例清单**:
1. `similarity 两个完全相同的书签应有高分` — `ReferenceError: sampleBookmarks is not defined`
2. `similarity 应支持对象和 ID 混合调用` — 同上
3. `buildGraph edge 权重应 >= 阈值` — 同上
4. `buildGraph 应建立邻接表 (双向)` — 同上
5. `buildGraph node.size 应反映连接数` — 同上
6. `getSimilar 结果应按分数降序` — 同上
7. `getSimilar 结果应包含 bookmark 字段` — 同上
8. `getClusters 应按域名正确分组` — 同上
9. `getClusters 应按文件夹正确分组` — 同上

**修复方案**: 将 `sampleBookmarks` 的定义提升到文件顶层 (在所有 `describe` 块之前)，或在 R187 `describe` 块内部重新定义。

---

### 🔴 P0 — 严重: `_truncate(text, Infinity)` 断言与源码实现不一致 (1 个用例失败)

**文件**: `test-bookmark-core-unit.js`, L602–605  
**失败用例**: `_truncate 应在 maxLen=Infinity 时不截断`

**断言**:
```js
assert.equal(BookmarkContentPreview._truncate(text, Infinity), text)
// 期望返回 'hello world'
```

**实际行为**: `_truncate` 源码 (bookmark-core.js L279):
```js
static _truncate(text, maxLen) {
    if (typeof text !== 'string' || !Number.isFinite(maxLen) || maxLen <= 0) return '';
    ...
}
```
`Number.isFinite(Infinity)` 返回 `false`，因此函数直接返回 `''`。

**根因**: 测试对源码行为做了错误假设。`_truncate` 设计上**拒绝** `Infinity` 等非有限数值。

**修复方案** (二选一):
- **改测试**: 删除此用例或改为 `assert.equal(BookmarkContentPreview._truncate(text, Infinity), '')`
- **改源码**: 如果希望支持 `Infinity`，将条件改为 `!Number.isFinite(maxLen) && maxLen !== Infinity`

---

### 🟡 P1 — 中等: `test-bookmark-search-core.js` 未纳入 Git 跟踪

该文件为全新创建 (476 行, 30 个用例)，但处于 `??` (untracked) 状态，未出现在 diff 中。任务描述中要求为 `bookmark-search-core.js` 补充测试，该文件应纳入本次提交。

---

### 🟡 P1 — 文档未同步

- **CHANGELOG.md**: 无 R187 条目
- **TODO.md**: R187 仍标记 `[ ]` (未勾选)

---

## 返工任务清单

| # | 优先级 | 任务 | 文件 | 行为 |
|---|--------|------|------|------|
| 1 | 🔴 P0 | 修复 `sampleBookmarks` 作用域问题 | `test-bookmark-graph-engine-unit.js` | 将 `sampleBookmarks` 提升到文件顶层，或在 R187 describe 内重新定义 |
| 2 | 🔴 P0 | 修复 `_truncate(Infinity)` 断言 | `test-bookmark-core-unit.js` L602–605 | 改为断言返回 `''`，或修改 `_truncate` 源码支持 Infinity |
| 3 | 🟡 P1 | 将 `test-bookmark-search-core.js` 加入 Git 跟踪 | `test-bookmark-search-core.js` | `git add tests/test-bookmark-search-core.js` |
| 4 | 🟡 P1 | 更新 CHANGELOG.md 添加 R187 条目 | `docs/CHANGELOG.md` | 添加 R187 变更记录 |
| 5 | 🟡 P1 | 更新 TODO.md 标记 R187 完成 | `docs/TODO.md` | `- [x] **R187** ...` |

---

## 附录: 用例覆盖分析

### bookmark-core.js — R187 新增 23 用例 ✅ (目标 ≥15)

| 类 | 新增用例 | 关键场景 |
|----|----------|----------|
| BookmarkIndexer | 8 | 中文分词、URL hostname 匹配、多标签 AND、评分排序、文件夹索引 |
| BookmarkCollector | 5 | 深层嵌套、无标题节点、忽略无效节点、www 子域名去除、dateAdded=0 |
| BookmarkStatusManager | 5 | 空已读列表、状态回退、计数、null 容忍、空批量操作 |
| BookmarkContentPreview | 5 | 仅 URL 预览、空书签、空标签数组、无 snapshot、_truncate 边界 |

### bookmark-graph-engine.js — R187 新增 18 用例 ✅ (目标 ≥15)

| 类 | 新增用例 | 关键场景 |
|----|----------|----------|
| similarity | 4 | 自相似、零相似、对象/ID 混合调用、同域名加分 |
| buildGraph | 6 | null 跳过、无标题 label、无 URL label、边权重阈值、邻接表双向、node.size |
| getSimilar | 3 | 降序排序、无邻居 fallback、结果字段完整性 |
| getClusters | 3 | 域名分组、文件夹分组、无 URL 书签排除 |
| _tokenizeTitle | 3 | 大小写、数字分割、非字符串输入 |

### bookmark-search-core.js — 新增 30 用例 ✅ (目标 ≥15)

| 类 | 新增用例 | 关键场景 |
|----|----------|----------|
| search | 10 | 空查询、单关键词、多关键词 AND、folder/tags/status 过滤、limit、highlights、降序排序 |
| searchByFilter | 7 | 空过滤器、folder/domain/status/tags 过滤、limit、sortBy=title |
| _mergeResults | 5 | 空合并、非重叠合并、重叠加分、高分保留、纯图谱扩展 |
| _sortResults | 4 | relevance/date/title/默认排序 |
| _expandWithGraph | 4 | 空扩展、去重、分数衰减 (0.5x)、topN 限制 |
