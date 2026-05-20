# VERIFICATION.md — Iteration #4 Review

> 审查对象: R168: 智能摘录归档 SmartHighlightArchive
> 审查日期: 2026-05-20
> 审查人: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | 核心归档/撤销/批量流程实现，但 AI 缓存、摘要长度约束、LRU 淘汰、函数签名等多项需求未落实 |
| 代码质量 | ⚠️ | 模块结构清晰、降级处理到位，但行数超标、撤销缓冲无上限、`_recentArchives` 无限增长、`highlight-store` 导入方式与注入设计矛盾 |
| 测试覆盖 | ❌ | 测试文件 `tests/test-bookmark-highlight-archive.js` 不存在，0 个测试用例（需求 ≥25） |
| 文档同步 | ❌ | CHANGELOG.md 未更新 R168 条目；TODO.md 中 R168 仍标记为 `[ ]`（未完成） |
| 集成完整性 | ❌ | 新模块未被任何其他文件引入——sidebar.js、popup/bookmark-overview.js 均无 R168 调用代码 |

---

## 1. 功能完整性 — 逐 AC 检查

### AC1: 页面上下文自动提取 ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `extractContext()` 方法 | ⚠️ | 实现为 `extractContext(selectedText, pageContent)`，而非需求要求的 `extractContext(highlightId)`（自动从 highlight-store 读取数据）。签名偏离需求。 |
| 上下文前后各 100 字 | ✅ | `CONTEXT_CHARS = 100`，切片逻辑正确 |
| 页面 URL/title 提取 | ⚠️ | 依赖调用方通过 `pageContext` 注入，模块自身不从 highlight 数据中自动提取（需求要求自动补充） |
| 降级处理 | ✅ | 上下文提取失败时降级为仅使用高亮文字原文 |

### AC2: AI 智能摘要与自动标签 ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 调用 AIClient 生成摘要+标签 | ✅ | `this._aiClient.generateSummaryAndTags()` 签名匹配 `ai-client.js` L289 |
| 一句话摘要 ≤50 字 | ❌ | **未实现**。AI prompt 无字数限制，降级回退截断为 100 字（需求要求 50 字） |
| 3-5 个标签 | ✅ | 合并 AI 标签 + Tagger 标签，`slice(0, 5)` 正确 |
| AI 不可用时降级 | ✅ | try-catch + Tagger 兜底 + 摘要截断回退，设计合理 |
| AI 调用频率控制（5 分钟缓存） | ❌ | **完全缺失**。需求要求"同一高亮 5 分钟内不重复调用 LLM（内存 Map 缓存）"，代码无此机制 |
| Prompt 安全（防注入） | ✅ | Prompt 模板硬编码，文本作为数据字段传入 |

### AC3: 一键归档入库 ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `archiveHighlight(highlightId)` 入口 | ✅ | 已实现，签名正确 |
| entry 结构与 `saveEntry()` 一致 | ✅ | 字段映射正确，与 `knowledge-base-crud.js` L60-73 一致 |
| `category: 'highlight'` | ❌ | 代码使用 `'摘录归档'`，需求要求 `'highlight'`。可能与其他知识库分类体系不兼容 |
| 标题前 30 字 | ❌ | `_buildTitle()` 截断为 50 字，需求要求"选中文字前 30 字" |
| 重复条目检测 | ✅ | 通过 `saveEntry()` 内置 `findDuplicate()` 实现，`isDuplicate` 标记正确 |
| 关联书签 | ✅ | `this._correlation.addEntry(savedEntry)` 调用签名匹配 `bookmark-knowledge-link.js` L75 |
| 返回值 `{ entry, summary, tags, highlightId }` | ❌ | 实际返回 `{ entry, undoId, highlightText }`，缺少独立 `summary`/`tags`/`highlightId` 字段 |

### AC4: Toast 确认与撤销 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| Toast 消息构建 | ✅ | `buildToastMessage()` 返回消息、undoId、可撤销标识 |
| `undoArchive(undoId)` 撤销方法 | ✅ | 从知识库删除 + 关联引擎移除 + 缓冲清理 |
| 5 秒撤销窗口 | ✅ | `DEFAULT_UNDO_WINDOW_MS = 5000`，`undoArchive()` 内检查超时 |
| 撤销缓冲区最多 20 条（LRU） | ❌ | **未实现**。`_undoBuffer` 无大小限制，仅通过 `cleanupUndoBuffer()` 清理过期条目。需求要求"最多保留 20 条记录（LRU 淘汰）" |

### AC5: 批量归档 ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `archiveHighlights(highlightIds[])` | ❌ | 需求要求按 ID 数组批量归档，实际实现为 `archiveHighlightsByUrl(url)` 和 `archiveHighlightsBatch(highlights)`——签名偏离需求 |
| 共享同一次 AI 调用 | ❌ | 需求明确要求"合并多个高亮为一个 prompt"，实际逐条调用 `_doArchive()` → 逐条调用 AI |
| 单条失败不影响其余 | ✅ | try-catch per item，标记 `error` 字段 |
| 批量撤销 | ⚠️ | `undoBatch(undoIds)` 实现正确，但参数名为 `undoIds` 而非需求的 `entryIds` |
| 批量上限 ≤20 | ❌ | 未实现。无 `highlights.length` 上限检查 |

### AC6: 完整测试覆盖 ❌

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 测试文件存在 | ❌ | `tests/test-bookmark-highlight-archive.js` **不存在** |
| 测试用例数 ≥25 | ❌ | 0 个测试（通过 0 / 失败 0） |

---

## 2. 跨文件一致性

### 2.1 依赖函数签名验证

| 依赖模块 | 方法 | 归档调用 | 匹配 |
|----------|------|----------|------|
| `highlight-store.js` | `getAllHighlights()` | `await getAllHighlights()` | ✅ |
| `highlight-store.js` | `getHighlightsByUrl(url)` | `await getHighlightsByUrl(url)` | ✅ |
| `bookmark-tagger.js` | `generateTags(bookmark)` | `this._tagger.generateTags({...})` | ✅ 参数结构一致 |
| `ai-client.js` | `generateSummaryAndTags(content)` | `this._aiClient.generateSummaryAndTags(context)` | ✅ |
| `knowledge-base-crud.js` | `saveEntry(entry)` | `this._knowledgeBase.saveEntry(entry)` | ✅ |
| `knowledge-base-crud.js` | `deleteEntry(id)` | `this._knowledgeBase.deleteEntry(record.entry.id)` | ✅ |
| `bookmark-knowledge-link.js` | `addEntry(entry)` | `this._correlation.addEntry(savedEntry)` | ✅ |
| `bookmark-knowledge-link.js` | `removeEntry(entryId)` | `this._correlation.removeEntry(record.entry.id)` | ✅ |

### 2.2 设计模式矛盾 ⚠️

```javascript
// 文件顶部: 直接静态导入
import { getAllHighlights, getHighlightsByUrl } from './highlight-store.js';
```

需求技术约束明确要求"**不直接依赖 Chrome API — 业务逻辑层，通过构造函数注入依赖**"。但 `highlight-store.js` 是直接静态导入的（`getAllHighlights` 依赖 `chrome.storage.local`），而非通过构造函数注入。这导致：

1. 测试时无法 mock `highlight-store.js`（除非使用 ESM mock 机制）
2. `_findHighlight()` 内部硬编码调用 `getAllHighlights()`
3. `archiveHighlightsByUrl()` 内部硬编码调用 `getHighlightsByUrl()`

建议: 改为构造函数注入 `options.highlightStore`。

### 2.3 模块集成 ❌

| 消费者 | 状态 | 说明 |
|--------|------|------|
| `sidebar/sidebar.js` | ❌ | 无任何 R168 集成代码（无"归档"按钮、无 import） |
| `popup/bookmark-overview.js` | ❌ | 无"今日摘录"计数集成 |
| `lib/bookmark-weekly-digest.js` | ❌ | 无 `highlightArchived` 统计项 |

---

## 3. 代码质量问题

### 3.1 模块行数超标

| 要求 | 实际 | 差异 |
|------|------|------|
| ≤ 400 行 | 549 行 | +149 行（+37%） |

主要原因：Toast 构建方法（`buildToastMessage` / `buildBatchToastMessage`，~45 行）、统计方法（`getStats` / `getRecentArchives` / `cleanupUndoBuffer`，~50 行）可考虑提取或简化。

### 3.2 `_recentArchives` 无上限

```javascript
this._recentArchives.unshift({...}); // L440 — 永远追加，永不淘汰
```

长时间使用后内存持续增长。建议: 加 cap（如最多 100 条）。

### 3.3 `_undoBuffer` 无 LRU 淘汰

需求明确要求"**撤销缓冲区最多保留 20 条记录（LRU 淘汰），单条 < 5KB**"。当前实现：

- 无大小限制 → 新条目无限追加
- `cleanupUndoBuffer()` 只清理过期条目，不处理超量
- 无单条大小检查

### 3.4 AI 缓存机制缺失

需求要求"**同一高亮 5 分钟内不重复调用 LLM（内存 Map 缓存，highlightId → {summary, tags, timestamp}）**"。代码中 `_generateSummaryAndTags()` 无任何缓存逻辑——同一高亮重复归档会重复调用 AI。

---

## 4. 文档同步

| 文档 | 要求 | 状态 | 说明 |
|------|------|------|------|
| `docs/CHANGELOG.md` | 新增 R168 条目 | ❌ | 无 R168 相关条目（grep 0 匹配） |
| `docs/TODO.md` | R168 标记 `[x]` | ❌ | 仍为 `[ ]`（未完成） |
| `docs/REQUIREMENTS-ITER4.md` | R168 需求文档 | ✅ | 已用 R168 需求内容覆盖原有迭代 #4 需求 |

> ⚠️ **REQUIREMENTS-ITER4.md 被完全覆盖**: 原迭代 #4（知识库性能优化）的需求文档被 R168 需求文档完全替换。原有 PERF-1/PERF-2/PERF-3/PERF-4 需求记录丢失。建议新建 `docs/REQUIREMENTS-R168.md` 而非覆盖原有文件。

---

## 5. 安全质量

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 硬编码密钥 | ✅ | 无硬编码 API key |
| XSS 风险 | ✅ | 纯数据处理模块，不直接操作 DOM |
| Prompt 注入 | ✅ | Prompt 模板硬编码，用户文本作为数据字段传入 |
| 隐私泄露 | ✅ | 上下文限制 100 字，无个人信息收集 |

---

## 6. 发现的问题汇总

| # | 严重程度 | 问题 | 需求对照 |
|---|----------|------|----------|
| P1 | ❌ 严重 | **测试文件缺失** — `tests/test-bookmark-highlight-archive.js` 不存在，0 用例 | AC6: ≥25 用例 |
| P2 | ❌ 严重 | **CHANGELOG.md 未更新** | 文档同步要求 |
| P3 | ❌ 严重 | **模块未被任何文件集成** — 无 sidebar、popup 消费者 | AC3 下游消费者 |
| P4 | ⚠️ 中等 | **AI 缓存机制完全缺失** — 同一高亮重复调用 LLM | 技术约束 §6 |
| P5 | ⚠️ 中等 | **撤销缓冲区无 LRU 淘汰** — 无 20 条上限 | 非功能需求 |
| P6 | ⚠️ 中等 | **摘要长度约束缺失** — AI 无 ≤50 字限制，降级截断 100 字 | AC2 |
| P7 | ⚠️ 中等 | **标题截断长度不匹配** — 代码 50 字，需求 30 字 | AC3 |
| P8 | ⚠️ 中等 | **category 不一致** — 代码 `'摘录归档'`，需求 `'highlight'` | AC3 |
| P9 | ⚠️ 中等 | **函数签名偏离** — 无 `archiveHighlights(highlightIds[])`，实际为 URL/数组双入口 | AC5 |
| P10 | ⚠️ 中等 | **返回值结构不匹配** — 缺少独立 `summary`/`tags`/`highlightId` 字段 | AC3 |
| P11 | ⚠️ 中等 | **批量 AI 调用未合并** — 逐条调用而非合并 prompt | AC5 |
| P12 | ⚠️ 中等 | **模块行数超标** — 549 行 > 400 行限制 | 技术约束 |
| P13 | ⚠️ 中等 | **`highlight-store` 直接导入** — 违反构造函数注入设计约束 | 技术约束 §3 |
| P14 | ⚠️ 中等 | **`_recentArchives` 无上限** — 内存持续增长 | 内存预算 |
| P15 | ⚠️ 中等 | **批量归档无上限检查** — 缺失 ≤20 高亮截断 | 非功能需求 |
| P16 | ⚠️ 低 | **REQUIREMENTS-ITER4.md 被覆盖** — 原迭代 #4 需求丢失 | 文档管理 |
| P17 | ⚠️ 低 | **TODO.md R168 未标记完成** | 文档同步 |

---

## 7. 返工任务清单

### 必须修复 (Blocking)

| # | 任务 | 预估工时 |
|---|------|----------|
| R1 | **创建测试文件** `tests/test-bookmark-highlight-archive.js`，实现 ≥25 用例，覆盖：正常单条归档、批量归档、AI 可用/不可用降级、重复检测、撤销（单条+批量+超时）、上下文提取边界、单条失败隔离 | 2-3h |
| R2 | **更新 CHANGELOG.md** 新增 R168 变更记录 | 5min |
| R3 | **TODO.md R168 标记 `[x]`** | 2min |
| R4 | **集成到 sidebar.js** — 高亮工具栏增加"归档"按钮，import SmartHighlightArchive 并调用 `archiveHighlight()` | 1h |

### 建议修复 (Non-blocking)

| # | 任务 | 预估工时 |
|---|------|----------|
| R5 | 实现 AI 调用缓存（内存 Map，highlightId → {summary, tags, timestamp}，5min TTL） | 30min |
| R6 | 实现撤销缓冲区 LRU 淘汰（最多 20 条） | 20min |
| R7 | 摘要长度约束：AI prompt 加 ≤50 字限制；降级回退改为 50 字 | 15min |
| R8 | `_buildTitle` 截断改为 30 字，前缀 `'摘录: '` | 5min |
| R9 | category 改为 `'highlight'` | 2min |
| R10 | 添加 `archiveHighlights(highlightIds[])` 入口方法 | 15min |
| R11 | 返回值增加独立 `summary`/`tags`/`highlightId` 字段 | 10min |
| R12 | 批量归档合并 AI prompt（同一页面高亮共享一次调用） | 30min |
| R13 | `highlight-store` 改为构造函数注入 | 20min |
| R14 | `_recentArchives` 加 cap（最多 100 条） | 5min |
| R15 | 批量归档加 ≤20 上限截断 + 警告 | 10min |
| R16 | 恢复 REQUIREMENTS-ITER4.md 原内容，新建 REQUIREMENTS-R168.md | 10min |
| R17 | 控制模块行数 ≤ 400 行（提取 Toast 统计等辅助方法） | 30min |

---

## 8. 总结

R168 的核心归档流程（高亮提取 → AI 摘要 → 入库 → 关联 → 撤销）已基本实现，降级策略设计合理，依赖注入模式符合项目规范。但存在 **4 项阻塞问题**（测试缺失、CHANGELOG 未更新、模块零集成、TODO 未标记）和 **11 项中等偏离**（AI 缓存、LRU 淘汰、摘要长度、签名偏差等）。建议完成 R1-R4 阻塞项后方可合入。

