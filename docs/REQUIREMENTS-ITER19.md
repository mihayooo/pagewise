# REQUIREMENTS — R331: SearchHistoryPersist

> 迭代: R331
> 日期: 2026-05-26
> 复杂度: Medium (新模块 + 存储迁移)
> 阶段: 飞轮迭代 R331
> 模块文件: `lib/search-history.js`
> 测试文件: `tests/test-search-history.js`

---

## 1. 用户故事

作为 PageWise 用户，我在 SidePanel 中反复搜索技术问题、与 AI 问答交互并高亮关键内容，但每次刷新页面或关闭重开浏览器后，搜索记录和高亮标记全部丢失，导致我需要重新输入相同查询、无法快速回溯之前的探索路径。我希望搜索历史和 AI 问答高亮能跨会话持久保存，让我获得连续、高效的浏览学习体验。

**竞品参考**（MARKET-ANALYSIS.md — "别让我离开当前页面" + "记住我学过什么"）：
- 当前 PageWise 的 `BookmarkSearchHistory`（`lib/bookmark-search-history.js`）基于内存存储，刷新即丢失
- 当前 `HighlightStore`（`lib/highlight-store.js`）基于 `chrome.storage.local`，但仅存储页面文本高亮，不关联 AI 问答上下文
- Readwise/Obsidian 的高亮持久化是其核心竞争力之一（竞品分析中标注/高亮维度 PageWise 为 ❌）

---

## 2. 验收标准

### AC1: IndexedDB 搜索历史持久化
- 新建 `lib/search-history.js` 纯逻辑模块，基于 IndexedDB 持久化搜索记录
- 每条搜索记录结构：`{ id, query, timestamp, resultCount, sourceTab, frequency }`
- 最多保留 200 条记录；超出时自动淘汰最旧且 frequency 最低的条目
- 支持两种排序：按时间倒序（最近优先）、按频率降序（高频优先）
- 去重逻辑：相同 query（大小写不敏感 + trim）不重复插入，而是更新 `timestamp` 并 `frequency++`
- 数据库名: `PageWiseSearchHistory`，objectStore: `searchRecords`，索引: `timestamp`、`frequency`
- 初始化/打开失败时抛出可诊断的错误信息，不静默吞错
- 与现有 `BookmarkSearchHistory`（内存存储）**并行共存**，不破坏其现有 API

### AC2: 搜索建议匹配
- `getSuggestions(partial)` 方法：输入 ≥ 2 个字符时自动匹配历史记录
- 匹配策略：前缀匹配（case-insensitive），从历史记录中提取匹配项
- 排序：按加权分数排序，公式为 `score = frequency * 0.7 + recencyWeight * 0.3`
  - `recencyWeight` = `1 / (1 + daysSinceLastUse)`，daysSinceLastUse 从最近使用时间计算
- 返回 Top-5 建议，每条包含 `{ query, frequency, lastUsedAt }`
- 输入 < 2 字符或空字符串时返回空数组

### AC3: AI 问答高亮持久化
- 将用户选中文字 + AI 回答关联存储至 IndexedDB
- 每条高亮关联记录结构：`{ id, bookmarkId, pageUrl, selectedText, aiAnswer, createdAt }`
- 复用同一 IndexedDB 数据库（`PageWiseSearchHistory`），独立 objectStore: `aiHighlights`
- 索引: `pageUrl`（用于按页面恢复）、`bookmarkId`（用于书签关联）、`createdAt`
- 提供 `getHighlightsByUrl(url)` 方法，返回该页面所有高亮记录
- 提供 `saveAiHighlight(entry)` 方法，自动填充 `createdAt`
- 每个 pageUrl 最多保存 50 条高亮记录，超出时淘汰最旧条目
- **不涉及 DOM 操作**：高亮恢复的 DOM 渲染逻辑由调用方（SidePanel/Content Script）负责，本模块只提供数据层
- 与现有 `HighlightStore`（`lib/highlight-store.js`）**并行共存**，各有职责：
  - `HighlightStore` = 页面文本高亮（DOM xpath/offset 定位）
  - 本模块 AI 高亮 = 选中文字 + AI 回答的语义关联（按 pageUrl 索引）

### AC4: 搜索历史导出
- `exportHistory(format)` 方法支持两种导出格式：`json`、`markdown`
- **JSON 格式**：结构化数据含元数据头（`exportedAt`、`totalRecords`、`version`），与 R318 KnowledgeExport 风格一致
- **Markdown 格式**：
  ```markdown
  # PageWise 搜索历史导出

  > 导出时间: 2026-05-26T12:00:00Z
  > 记录总数: 42

  ## 2026-05-26

  ### [10:30] JavaScript Promise 错误处理 (3 条结果)

  ### [09:15] CSS Grid 布局教程 (7 条结果)
  ```
- 导出文件名格式: `pagewise-search-history-YYYY-MM-DD.json` / `.md`
- 空历史记录时导出仍生成有效文件（含元数据头，正文为空）

### AC5: 隐私控制
- `clearAll()` 方法：清除全部搜索历史记录和 AI 高亮记录
- `setEnabled(enabled)` / `isEnabled()` 方法：开关历史记录功能
- 关闭历史记录功能后：
  - 新搜索不再记录
  - 已有记录保留但不显示建议
  - AI 高亮仍可保存（高亮属于用户主动操作，与搜索历史分离控制）
- 开关状态持久化至 `chrome.storage.local`（key: `pagewiseSearchHistoryEnabled`，默认 `true`）
- `clearAll()` 执行后返回 `{ cleared: { searchRecords: number, aiHighlights: number } }` 确认清除结果

### AC6: 最近搜索快捷标签
- `getRecentSearches(limit)` 方法返回最近 N 条搜索记录（默认 5 条）
- 返回格式: `{ query, timestamp }`（精简字段，仅用于 UI 渲染）
- 调用方在 SidePanel 搜索框下方渲染"最近搜索"快捷标签
- **本模块只提供数据接口**，不涉及 DOM/UI 渲染逻辑

### AC7: 完整测试覆盖
- 测试框架: `node:test` + `node:assert/strict`（与项目一致）
- 测试用例 ≥ 25 个，覆盖以下场景：
  - 搜索历史 CRUD（增/查/更新/去重/上限淘汰）
  - 按时间/频率排序正确性
  - 搜索建议匹配（前缀匹配/大小写不敏感/空输入/短输入/Top-5 截断/加权排序）
  - AI 高亮存储与按 URL 查询
  - 导出 JSON/Markdown 格式正确性与元数据完整性
  - 清除全部历史 + AI 高亮
  - 隐私开关：关闭后不记录、开启后恢复记录
  - 边界：空数据库操作、200 条上限触发淘汰、50 条高亮上限
- IndexedDB 测试: 使用 mock/fake IndexedDB（与项目现有 `knowledge-base` 测试模式一致）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class` / `export function` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包，IndexedDB 使用浏览器原生 API |
| 不依赖 Chrome API | 核心数据层不直接调用 chrome.* API；`chrome.storage.local` 仅用于开关状态（通过构造函数注入） |
| IndexedDB 数据库 | `PageWiseSearchHistory`，包含两个 objectStore: `searchRecords`、`aiHighlights` |
| 数据库版本管理 | `DB_VERSION = 1`，`onupgradeneeded` 中创建 store 和索引 |
| 异步全接口 | 所有读写方法返回 `Promise`，IndexedDB 事务遵循 request/onsuccess/onerror 模式 |
| 与现有模块并行 | 不修改 `bookmark-search-history.js`、`highlight-store.js`、`bookmark-search-suggest.js` 的任何代码 |
| 命名规范 | 与 R318 KnowledgeExport 导出风格保持一致（元数据头 + 正文） |
| 测试模式 | 与 `conversation-store.js` 测试模式一致: mock IndexedDB via fake-indexeddb 或自建内存 shim |
| 性能预算 | 单条记录写入 < 10ms；200 条历史查询 + 排序 < 50ms；建议匹配 < 5ms |
| 内存预算 | 模块实例缓存 < 50KB（不含 IndexedDB 持久化数据） |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| BookmarkSearchHistory (R45) | `lib/bookmark-search-history.js` | ✅ 已实现 | **不直接依赖**，但需了解其 SearchEntry 数据结构以保持兼容；新模块独立运行 |
| HighlightStore | `lib/highlight-store.js` | ✅ 已实现 | **不直接依赖**，职责分离（页面文本高亮 vs AI 问答高亮） |
| BookmarkSearchSuggest | `lib/bookmark-search-suggest.js` | ✅ 已实现 | **不直接依赖**，新模块的 getSuggestions() 为独立实现（基于持久化数据） |
| KnowledgeExport (R318) | `lib/knowledge-export.js` | ✅ 已实现 | **风格参考**，导出格式（元数据头 + JSON/Markdown）与 R318 保持一致 |
| chrome.storage.local | 浏览器 API | ✅ 可用 | 通过构造函数注入，仅用于历史记录开关状态持久化 |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| SidePanel UI | 搜索框下方"最近搜索"标签（调用 `getRecentSearches()`）；搜索建议（调用 `getSuggestions()`） |
| SidePanel 搜索逻辑 | 每次搜索后调用 `recordSearch(query, resultCount, sourceTab)` 记录 |
| Content Script / 高亮恢复 | 页面加载时调用 `getHighlightsByUrl(url)` 获取 AI 高亮数据并恢复渲染 |
| Options 设置页 | 隐私控制 UI（清除历史、开关历史功能）调用 `clearAll()` / `setEnabled()` |
| 导出功能 | "导出搜索历史"按钮调用 `exportHistory('json')` / `exportHistory('markdown')` |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| IndexedDB 可用性 | Chrome 扩展 content script 中 IndexedDB 可用；Service Worker 中需验证兼容性 |
| 浏览器时间 | `Date.now()` 用于 timestamp 和 recency 计算 |

---

## 5. 数据模型

```javascript
// ===================== 搜索历史记录 =====================

// SearchRecord — searchRecords objectStore 单条记录
{
  id: number,                 // autoIncrement 主键
  query: string,              // 搜索关键词（trim 后存储）
  timestamp: number,          // 最后搜索时间戳（ms），去重时更新
  resultCount: number,        // 搜索结果数量
  sourceTab: string,          // 来源标签页标识（tabId 或 tab title）
  frequency: number           // 该查询累计出现次数（去重时递增）
}

// ===================== AI 问答高亮 =====================

// AiHighlight — aiHighlights objectStore 单条记录
{
  id: number,                 // autoIncrement 主键
  bookmarkId: string | null,  // 关联书签 ID（可选）
  pageUrl: string,            // 页面 URL（索引字段）
  selectedText: string,       // 用户选中的原文
  aiAnswer: string,           // AI 回答内容
  createdAt: number           // 创建时间戳（ms）
}

// ===================== 搜索建议输出 =====================

// Suggestion — getSuggestions() 返回值中的单条
{
  query: string,              // 建议的搜索词
  frequency: number,          // 历史出现频率
  lastUsedAt: number          // 最后使用时间戳
}

// ===================== 导出格式 =====================

// ExportMetadata — JSON/Markdown 导出共用元数据头
{
  exportedAt: string,         // ISO 8601 格式
  totalRecords: number,       // 导出记录总数
  version: string,            // 模块版本（'1.0.0'）
  source: string              // 'PageWise Search History Export'
}

// JSON 导出完整结构
{
  metadata: ExportMetadata,
  records: SearchRecord[]     // 全部搜索记录（按时间倒序）
}
```

---

## 6. 非功能需求

| 项目 | 要求 |
|------|------|
| 数据持久化 | 搜索历史和 AI 高亮在浏览器重启后完整保留 |
| 存储上限 | 搜索历史 ≤ 200 条自动淘汰；每个 pageUrl AI 高亮 ≤ 50 条自动淘汰 |
| 查询性能 | 200 条历史全量查询 + 排序 < 50ms |
| 建议匹配 | 输入 ≥ 2 字符 → Top-5 建议 < 5ms |
| 导出性能 | 200 条记录 JSON/Markdown 导出 < 100ms |
| 空数据兼容 | 空数据库时所有查询返回空数组/空文件，不抛出异常 |
| 隐私默认 | 历史记录功能默认开启（`enabled = true`）；用户可随时关闭 |
| 隔离性 | 独立 IndexedDB 数据库，不修改/干扰现有 KnowledgeBase、ConversationStore 的数据库 |
| 向后兼容 | 不修改任何已有模块的公共 API |

---

## 7. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/search-history.js` | **新建** | 核心模块：SearchHistory 类（搜索历史 + AI 高亮 + 建议 + 导出 + 隐私控制） |
| `tests/test-search-history.js` | **新建** | 单元测试（≥ 25 用例，node:test） |
| `docs/CHANGELOG.md` | **修改** | 新增 R331 条目 |
| `docs/TODO.md` | **修改** | 标记 R331 状态为 ✅ |
| `docs/REQUIREMENTS.md` | **修改** | 新增 R331 需求条目 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-26 | R331 | 初始创建 — SearchHistoryPersist 搜索历史与高亮持久化需求文档 |