# VERIFICATION.md — Iteration #19 Review

> 审查日期: 2026-05-26
> 审查任务: R331 SearchHistoryPersist — 搜索历史与 AI 问答高亮持久化
> 审查范围: `lib/search-history.js` (新建), `tests/test-search-history.js` (新建)
> 需求文档: `docs/REQUIREMENTS-ITER19.md`

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⚠️ | 核心功能齐全，但多处与需求规格存在偏差（AI 高亮 50 条上限未实现、导出结构不匹配、建议返回格式不符） |
| 代码质量 | ⚠️ | 代码结构清晰、JSDoc 完整、错误处理合理；但文件 552 行超出 400 行架构限制，且直接依赖 `chrome.storage.local` 违反需求约束 |
| 测试覆盖 | ✅ | 47 个用例全部通过（≥25 要求），覆盖 CRUD/去重/排序/建议/导出/AI 高亮/隐私/边界；但缺 50 条高亮上限测试 |
| 文档同步 | ❌ | `CHANGELOG.md`、`TODO.md`、`REQUIREMENTS.md` 均未更新 R331 条目 |

---

## 详细审查

### 1. 功能完整性 — ⚠️

逐条对照 `REQUIREMENTS-ITER19.md` 验收标准:

#### AC1: IndexedDB 搜索历史持久化 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| IndexedDB 持久化 | ✅ | `PageWiseSearchHistory` 数据库正确创建 |
| 搜索记录字段 | ⚠️ | 使用 `count` 而非需求要求的 `frequency`；timestamp 存为 ISO 字符串而非需求要求的 `number (ms)` |
| Object Store 名称 | ⚠️ | 实现为 `searches`，需求要求 `searchRecords` |
| 索引 | ⚠️ | 创建了 `query` + `timestamp` 索引，但需求要求 `timestamp` + `frequency` 索引（缺少 `frequency` 索引） |
| 200 条上限淘汰 | ✅ | 正确实现 LRU 淘汰 |
| 时间/频率排序 | ✅ | `getSearchHistory(limit, 'time'|'frequency')` |
| 去重逻辑 | ✅ | 归一化后相同 query 累加 count 并更新 timestamp |
| 错误诊断 | ✅ | IndexedDB 错误抛出可诊断信息 |
| 并行共存 | ✅ | 不修改 `bookmark-search-history.js` |

#### AC2: 搜索建议匹配 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| ≥2 字符前缀匹配 | ✅ | 正确实现 |
| 加权排序公式 | ⚠️ | 实现 `score = count * 0.6 + recencyScore * 0.4`，需求要求 `score = frequency * 0.7 + recencyWeight * 0.3`，且 recency 计算公式不同 |
| 返回格式 | ⚠️ | 返回 `string[]`（仅 query），需求要求返回 `{ query, frequency, lastUsedAt }[]` |
| Top-5 截断 | ✅ | 默认 limit=5 |
| 空/短输入 | ✅ | 返回空数组 |

#### AC3: AI 问答高亮持久化 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 存储结构 | ✅ | `{ id, bookmarkId, pageUrl, selectedText, aiAnswer, createdAt }` |
| 同一 IndexedDB | ✅ | 复用 `PageWiseSearchHistory` |
| Object Store 名称 | ✅ | `aiHighlights` |
| 索引 | ⚠️ | 创建 `pageUrl` + `createdAt` 索引，**缺少需求要求的 `bookmarkId` 索引** |
| `getHighlightsByUrl()` | ✅ | 存在 `getAIHighlightsByPageUrl(pageUrl)` |
| 每 pageUrl 最多 50 条 | ❌ | **未实现** — `saveAIHighlight()` 无条数上限检查，无淘汰逻辑 |
| 纯数据层 | ✅ | 不涉及 DOM 操作 |

#### AC4: 搜索历史导出 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| JSON/Markdown 双格式 | ✅ | `exportSearchHistory('json'|'markdown')` |
| JSON 元数据结构 | ⚠️ | 实现为 `{ type, exportTime, totalRecords, records }`，需求要求 `{ metadata: { exportedAt, totalRecords, version, source }, records }` |
| Markdown 标题 | ⚠️ | `# 搜索历史导出`，需求要求 `# PageWise 搜索历史导出` |
| Markdown 格式 | ⚠️ | 使用表格格式，需求要求 `### [HH:MM] query (N 条结果)` 逐条标题格式 |
| 空历史兼容 | ✅ | JSON 返回有效空数组，Markdown 返回暂无提示 |

#### AC5: 隐私控制 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `isHistoryEnabled()` / `setHistoryEnabled()` | ✅ | 存在且功能正确 |
| `clearSearchHistory()` | ✅ | 清除搜索历史 |
| `clearAllAIHighlights()` | ✅ | 清除 AI 高亮 |
| 统一 `clearAll()` | ❌ | **未实现** — 需求要求统一 `clearAll()` 方法一次性清除搜索+AI 高亮并返回 `{ cleared: { searchRecords: number, aiHighlights: number } }` |
| 关闭后不记录新搜索 | ✅ | `recordSearch` 在关闭时返回 null |
| 高亮仍可保存 | ⚠️ | `saveAIHighlight` 未检查 `isHistoryEnabled()`，与需求"AI 高亮仍可保存（与搜索历史分离控制）"一致，但未在注释/文档中明确说明此设计决策 |
| Storage key | ⚠️ | 实现 `pagewise_search_history_enabled`，需求要求 `pagewiseSearchHistoryEnabled`（camelCase） |

#### AC6: 最近搜索快捷标签 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `getRecentSearches(limit)` | ✅ | 默认 5 条 |
| 返回精简字段 | ⚠️ | 返回完整记录（含 count/resultCount/sourceTab），需求要求仅 `{ query, timestamp }` |
| 纯数据接口 | ✅ | 不涉及 UI |

#### AC7: 测试覆盖 — ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 测试用例数量 | ✅ | 47 个（≥25 要求） |
| node:test 框架 | ✅ | 使用 `node:test` + `node:assert/strict` |
| IndexedDB mock | ✅ | 复用 `tests/helpers/indexeddb-mock.js` |
| 全部通过 | ✅ | 47 pass / 0 fail |
| 50 条高亮上限测试 | ❌ | 无此测试（因实现未包含此限制） |

---

### 2. 跨文件一致性 — ⚠️

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 与 `bookmark-search-history.js` 共存 | ✅ | 不修改既有模块 |
| 与 `highlight-store.js` 共存 | ✅ | 不修改既有模块 |
| `normalizeQuery` 一致性 | ✅ | 逻辑与 `bookmark-search-history.js:46` 一致（trim + 合并空格 + 小写） |
| 模块行数限制 | ❌ | **552 行**，超出 `scripts/architecture-guard.sh` 的 400 行限制 |
| chrome.storage.local 直接依赖 | ⚠️ | 需求技术约束要求"不依赖 Chrome API（通过构造函数注入）"，实现直接调用 `chrome.storage.local` |

---

### 3. 测试覆盖 — ✅

- **47 个用例全部通过**，覆盖:
  - 搜索历史存储 (6): 保存、归一化、去重累加、空输入、隐私关闭、200 条淘汰
  - 获取历史 (4): 初始空、时间倒序、limit、频率排序
  - 最近搜索 (3): 默认 5 条、自定义 limit、空历史
  - 搜索建议 (8): 前缀匹配、频率加权、Top-5、自定义 limit、不匹配、短输入、无效输入、去重
  - 删除清理 (4): 删除指定、清除全部、清除后恢复、空历史清除
  - AI 高亮 (9): 保存、缺字段、默认 bookmarkId、按 URL 查询、无匹配、空 URL、排序、全部获取、删除、清除
  - 导出 (6): JSON 格式、Markdown 格式、统一接口 JSON、统一接口 Markdown、空 JSON、空 Markdown
  - 隐私控制 (5): 默认启用、关闭、重新启用、关闭后不记录、关闭再启用保留数据

---

### 4. 文档同步 — ❌

| 文档 | 状态 | 说明 |
|------|------|------|
| `docs/CHANGELOG.md` | ❌ | 未添加 R331 条目 |
| `docs/TODO.md` | ⚠️ | R331 行存在但仍标记 `[ ]` 未完成（line 1503） |
| `docs/REQUIREMENTS.md` | ❌ | 未添加 R331 需求条目 |

---

### 5. 安全质量 — ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 硬编码密钥 | ✅ | 无硬编码密钥 |
| XSS 风险 | ✅ | 纯数据层，不操作 DOM；导出为纯文本字符串 |
| 用户输入校验 | ✅ | `saveAIHighlight` 验证必填字段；`recordSearch` 归一化+过滤空输入 |
| 隐私合规 | ✅ | 支持关闭/清除历史功能 |

---

## 发现的问题

### P0 — 需求规格偏差（应修复）

1. **AI 高亮 50 条/pageUrl 上限未实现** — `saveAIHighlight()` 缺少条数检查和最旧淘汰逻辑（需求 AC3 明确要求 "每个 pageUrl 最多保存 50 条高亮记录，超出时淘汰最旧条目"）

2. **`clearAll()` 统一清除接口缺失** — 需求 AC5 要求 `clearAll()` 一次性清除搜索历史+AI 高亮并返回 `{ cleared: { searchRecords: number, aiHighlights: number } }`，当前仅有独立的 `clearSearchHistory()` 和 `clearAllAIHighlights()`

3. **JSON 导出元数据结构不符** — 实现 `{ type, exportTime, totalRecords, records }`，需求要求 `{ metadata: { exportedAt, totalRecords, version, source }, records }`，缺少 `version` 和 `source` 字段

### P1 — 命名/格式偏差（建议修复）

4. **Object Store 命名** — `searches` vs 需求要求 `searchRecords`（数据迁移时可能需要）

5. **字段命名** — `count` vs 需求要求 `frequency`（影响 API 一致性）

6. **Timestamp 类型** — ISO 字符串 vs 需求要求 `number (ms)`（影响排序性能和存储大小）

7. **搜索建议返回格式** — 返回 `string[]`，需求要求 `{ query, frequency, lastUsedAt }[]`

8. **搜索建议加权公式** — `count * 0.6 + recency * 0.4` vs 需求 `frequency * 0.7 + recencyWeight * 0.3`

9. **`getRecentSearches()` 返回完整记录** — 需求仅要求 `{ query, timestamp }`

10. **Markdown 导出格式** — 表格格式 vs 需求要求的逐条标题格式 `### [HH:MM] query (N 条结果)`

11. **Storage key 命名** — `pagewise_search_history_enabled` vs 需求 `pagewiseSearchHistoryEnabled`

12. **Markdown 标题** — `# 搜索历史导出` vs 需求 `# PageWise 搜索历史导出`

### P2 — 工程规范（建议修复）

13. **文件超长** — 552 行超出项目 400 行架构限制，建议将导出逻辑（`exportSearchHistoryJSON` + `exportSearchHistoryMarkdown` + `exportSearchHistory`，约 65 行）拆分至 `lib/search-history-export.js`

14. **chrome API 直接依赖** — 需求技术约束要求"不依赖 Chrome API（通过构造函数注入）"，当前直接调用 `chrome.storage.local`，测试通过 mock 覆盖但不利于可测试性

15. **缺少 `bookmarkId` 索引** — AI 高亮 store 需求要求创建 `bookmarkId` 索引，当前仅有 `pageUrl` + `createdAt`

16. **文档未更新** — `CHANGELOG.md`、`REQUIREMENTS.md` 未添加 R331 条目；`TODO.md` R331 未标记完成

---

## 返工任务清单

| # | 优先级 | 任务 | 预估 |
|---|--------|------|------|
| 1 | P0 | `saveAIHighlight()` 增加每 pageUrl 50 条上限检查 + 最旧淘汰逻辑 | 小 |
| 2 | P0 | 新增 `clearAll()` 方法，一次性清除搜索+AI 高亮，返回清除计数 | 小 |
| 3 | P0 | JSON 导出改为 `{ metadata: { exportedAt, totalRecords, version: '1.0.0', source: 'PageWise Search History Export' }, records }` | 小 |
| 4 | P1 | 统一字段命名 `count` → `frequency`，Object Store `searches` → `searchRecords`，Storage key → camelCase | 中 |
| 5 | P1 | `getSearchSuggestions()` 返回 `{ query, frequency, lastUsedAt }[]`，调整加权公式为 `frequency * 0.7 + recencyWeight * 0.3` | 小 |
| 6 | P1 | Markdown 导出改为需求要求的逐条标题格式 `### [HH:MM] query (N 条结果)` | 小 |
| 7 | P1 | `getRecentSearches()` 返回精简 `{ query, timestamp }` | 小 |
| 8 | P2 | 文件拆分（552 行 → ≤400 行）：导出逻辑拆至 `lib/search-history-export.js` | 中 |
| 9 | P2 | `chrome.storage.local` 改为构造函数注入模式 | 中 |
| 10 | P2 | AI 高亮 store 添加 `bookmarkId` 索引 | 小 |
| 11 | P2 | 更新 `CHANGELOG.md`、`REQUIREMENTS.md`，`TODO.md` R331 标记 `[x]` | 小 |
| 12 | P2 | 补充 AI 高亮 50 条上限测试用例 | 小 |

---

## 总结

R331 实现了搜索历史与 AI 高亮持久化的核心功能（IndexedDB 存储、CRUD、排序、建议、导出、隐私控制），47 个测试全部通过，代码质量良好。但存在 **3 个 P0 问题**（AI 高亮 50 条上限未实现、缺少 `clearAll()` 统一接口、JSON 导出结构不符）、**9 个 P1 命名/格式偏差**、**4 个 P2 工程规范问题**。建议修复 P0+P1 后再合并。
