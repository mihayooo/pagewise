# REQUIREMENTS — R168: SmartHighlightArchive 智能摘录归档

> 迭代: R168
> 日期: 2026-05-20
> 复杂度: Medium (新模块)
> 阶段: Phase T — 知识沉淀与学习闭环 (第 1/4 轮)
> 模块文件: `lib/bookmark-highlight-archive.js`
> 测试文件: `tests/test-bookmark-highlight-archive.js`

---

## 1. 用户故事

作为技术学习者，我在浏览技术文档时经常选中关键段落、代码片段或概念解释，但目前这些摘录仅作为页面高亮存在，无法沉淀为可检索的知识条目。我希望**选中文字后一键归档**，自动生成摘要和标签并存入知识库，打通"浏览→选中→沉淀"的最短路径，让每一次阅读都成为知识积累的触点。

**核心痛点**：
- 当前流程：选中文字 → 提问 AI → 手动保存回答 → 手动打标签（4 步）
- 目标流程：选中文字 → 一键归档（1 步），AI 自动摘要 + 标签 + 关联书签

---

## 2. 验收标准

### AC1: 页面上下文自动提取
- `extractContext(highlightId)` 方法从 `highlight-store.js` 读取高亮条目（URL、text、xpath、offset）
- 自动补充页面上下文：
  - `pageUrl`: 高亮所在页面 URL
  - `pageTitle`: 页面标题（从当前 tab 或缓存获取）
  - `surroundingText`: 选中文字前后的上下文（各取 100 字，总计最多 200 字）
  - `highlightText`: 选中文字原文
- 上下文提取失败时降级为仅使用高亮文字原文，不抛异常

### AC2: AI 智能摘要与自动标签
- `generateSummaryAndTags(context)` 方法调用 AIClient 生成：
  - `summary`: 一句话摘要（≤ 50 字），准确概括选中文字的核心信息
  - `tags`: 3-5 个自动标签，复用 `bookmark-tagger.js` 的标签体系
- Prompt 模板硬编码在模块中（防 prompt 注入），输入 ≤ 500 tokens
- AI 不可用时（无 API key、网络错误、JSON 解析失败）降级处理：
  - `summary` 降级为选中文字前 50 字 + "..."
  - `tags` 降级为 `bookmark-tagger.js` 的 `generateTags()` 规则生成
- 不抛出异常，始终返回结构化结果

### AC3: 一键归档入库
- `archiveHighlight(highlightId)` 方法完成完整归档流程：
  1. 调用 AC1 提取上下文
  2. 调用 AC2 生成摘要 + 标签
  3. 调用 `knowledge-base-crud.js` 的 `saveEntry()` 写入知识库
  4. 调用 `bookmark-knowledge-link.js` 的 `addEntry()` 关联当前页面书签
  5. 返回归档结果对象 `{ entry, summary, tags, highlightId }`
- 写入知识库的 entry 结构与 `saveEntry()` 一致：
  ```javascript
  {
    title: '摘录: ' + highlightText前30字,
    content: highlightText,
    summary: aiSummary,
    sourceUrl: pageUrl,
    sourceTitle: pageTitle,
    tags: autoTags,
    category: 'highlight',
    question: '',
    answer: '',
    language: detectLanguage(highlightText)
  }
  ```
- `saveEntry()` 返回 `{ duplicate: true, existing }` 时，归档结果标记 `isDuplicate: true`，不重复写入

### AC4: Toast 确认与撤销
- 归档成功后触发 Toast 通知回调 `onArchive(result)`：
  - Toast 内容："✅ 已归档摘录" + 一句话摘要
  - 撤销按钮：5 秒内可点击撤销
  - 撤销操作：从知识库删除该条目 + 从关联引擎移除 + 触发 `onUndo(entryId)`
- `undoArchive(entryId)` 方法执行撤销：
  - 调用 `knowledge-base-crud.js` 的 `deleteEntry(entryId)`
  - 调用 `bookmark-knowledge-link.js` 的 `removeEntry(entryId)`
  - 超过 5 秒后撤销入口失效（由调用方 UI 控制超时，模块层不做计时）

### AC5: 批量归档
- `archiveHighlights(highlightIds[])` 方法支持对同一页面多个高亮一次性归档：
  - 逐条执行 AC1-AC3 流程
  - 共享同一次 AI 调用（合并多个高亮为一个 prompt，生成批量摘要 + 标签）
  - 返回结果数组 `[{ entry, summary, tags, highlightId, isDuplicate? }, ...]`
  - 单条失败不影响其余条目（catch per item，标记 `error` 字段）
- 批量撤销：`undoArchiveBatch(entryIds[])` 逐条撤销，返回成功/失败计数

### AC6: 完整测试覆盖
- 单元测试覆盖所有公共 API 方法（≥ 25 个测试用例）
- 使用 `node:test` + `node:assert/strict`
- 覆盖场景：
  - 正常归档流程（单条 + 批量）
  - AI 可用 vs AI 不可用降级
  - 重复条目检测（`isDuplicate: true`）
  - 撤销操作（单条 + 批量 + 超时后失败）
  - 上下文提取边界（无高亮、空文本、无 URL）
  - 批量归档中单条失败不影响其余

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class BookmarkHighlightArchive` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包，复用项目内已有模块 |
| 不直接依赖 Chrome API | 业务逻辑层，通过构造函数注入依赖（highlight-store、knowledge-base-crud、ai-client、bookmark-knowledge-link），保持可测试性 |
| 复用 highlight-store.js | 作为高亮数据源，只读调用 `getHighlightsByUrl()` 和 `getAllHighlightsFlat()` |
| 复用 knowledge-base-crud.js | 作为知识库写入层，调用 `saveEntry()` / `deleteEntry()` |
| 复用 bookmark-knowledge-link.js | 作为知识关联层，调用 `addEntry()` / `removeEntry()` |
| 复用 bookmark-tagger.js | AI 不可用时的降级标签生成 |
| 复用 ai-client.js | 通过 `chat(messages, opts)` 非流式接口生成摘要 + 标签 |
| AI 调用频率控制 | 同一高亮 5 分钟内不重复调用 AI（内存 Map 缓存，highlightId → {summary, tags, timestamp}） |
| Prompt 安全 | prompt 模板硬编码在模块中，高亮文字作为数据字段传入，防止 prompt 注入 |
| 性能预算 | `archiveHighlight()` 含 AI 调用，缓存命中 < 10ms；无缓存 < 3s（取决于 LLM 响应）；`undoArchive()` < 50ms |
| 内存预算 | 撤销缓冲区最多保留 20 条记录（LRU 淘汰），单条 < 5KB |
| 模块文件大小 | `bookmark-highlight-archive.js` ≤ 400 行 |
| 语言检测 | 复用已有 `detectLanguage()` 工具函数（从 ai-client 或 utils 中注入），无需新建 |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| HighlightStore | `lib/highlight-store.js` | ✅ 已实现 | 构造函数注入；读取高亮数据 `getHighlightsByUrl()` / `getAllHighlightsFlat()` |
| AIClient (迭代 #2) | `lib/ai-client.js` | ✅ 已实现 | 构造函数注入；调用 `chat(messages, opts)` 非流式接口生成摘要 + 标签 |
| BookmarkTagger (R55) | `lib/bookmark-tagger.js` | ✅ 已实现 | 构造函数注入；AI 不可用时作为降级标签生成器 |
| KnowledgeBaseCRUD (R116) | `lib/knowledge-base-crud.js` | ✅ 已实现 | 构造函数注入；调用 `saveEntry()` / `deleteEntry()` 写入/删除知识条目 |
| BookmarkKnowledgeCorrelation (R66) | `lib/bookmark-knowledge-link.js` | ✅ 已实现 | 构造函数注入；调用 `addEntry()` / `removeEntry()` 维护知识-书签关联索引 |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| Sidebar (sidebar.js) | 高亮工具栏增加"归档"按钮，调用 `archiveHighlight(highlightId)` |
| BookmarkOverview (R50) | 概览区展示"今日摘录"计数 |
| WeeklyDigest (R165) | 周报中统计摘录归档数量（新增 `highlightArchived` 统计项） |
| SpacedRepetition (R163) | 归档的知识条目自动进入复习队列（通过知识库 entry 写入触发） |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| AIClient 配置 | 需要用户在设置中配置有效的 API key 和模型（降级时不需要） |
| 网络连接 | AI 摘要/标签生成需网络访问 LLM API（降级时不需要） |
| 系统时间 | `Date.now()` 用于缓存 TTL 判断、撤销缓冲区过期 |
| 页面 DOM | 调用方（content script）负责获取页面标题和周围文字上下文，传入模块 |

---

## 5. 数据模型

```javascript
// ===================== 输入 =====================

// 高亮条目（来自 HighlightStore 标准格式）
{
  id: string,           // 高亮唯一 ID（Date.now().toString(36) + random）
  url: string,          // 页面 URL
  text: string,         // 选中文字原文
  xpath: string,        // 选区 XPath 路径
  offset: number,       // 选区偏移量
  createdAt: string     // ISO 8601 时间戳
}

// 页面上下文（调用方注入或模块提取）
{
  pageUrl: string,      // 页面 URL
  pageTitle: string,    // 页面标题
  surroundingText: {
    before: string,     // 选中文字前 100 字
    after: string       // 选中文字后 100 字
  }
}

// ===================== 输出 =====================

// 归档结果 — archiveHighlight() 返回值
{
  entry: Object,          // 写入知识库的完整条目（含 id）
  summary: string,        // AI 生成的一句话摘要（≤ 50 字）
  tags: string[],         // 自动标签（3-5 个）
  highlightId: string,    // 关联的高亮 ID
  isDuplicate: boolean,   // 是否为重复条目（true 时不写入新条目）
  archivedAt: string      // 归档时间 ISO 8601
}

// 批量归档结果 — archiveHighlights() 返回值
[ArchiveResult, ...]      // 与单条结构一致，额外包含 error? 字段

// 撤销操作 — undoArchive() 返回值
{
  entryId: number | string, // 被删除的知识条目 ID
  success: boolean,
  error?: string
}
```

---

## 6. 非功能需求

| 项目 | 要求 |
|------|------|
| AI 调用频率 | 同一高亮 5 分钟内不重复调用 LLM（内存缓存） |
| Token 消耗 | 单次归档 prompt 输入 ≤ 500 tokens；批量归档合并 prompt ≤ 1000 tokens |
| 降级延迟 | AI 不可用时降级到规则摘要 + 标签，总耗时 < 100ms |
| 撤销缓冲区 | 内存 Map，最多 20 条，LRU 淘汰，单条 < 5KB |
| 空数据兼容 | 无高亮 / 空文本时返回 `{ error: 'empty_highlight' }`，不抛异常 |
| 批量上限 | 单次批量归档 ≤ 20 个高亮（超过时截断并返回警告） |
| 重复检测 | 同一 URL + 相同选中文字不重复写入（复用 KnowledgeBaseCRUD.findDuplicate） |
| 隐私安全 | prompt 只含选中文字和上下文片段，不包含用户个人信息；上下文前后文各取 100 字，防止 prompt 过长 |

---

## 7. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/bookmark-highlight-archive.js` | **新建** | 核心模块：BookmarkHighlightArchive 类（≤ 400 行） |
| `tests/test-bookmark-highlight-archive.js` | **新建** | 单元测试（≥ 25 用例，node:test） |
| `docs/CHANGELOG.md` | **修改** | 新增 R168 条目 |
| `docs/TODO.md` | **修改** | 标记 R168 状态为 ✅ |

---

## 8. 与现有功能的关系

| 现有功能 | R168 关系 |
|----------|-----------|
| HighlightStore (现有) | **数据源**：R168 从 HighlightStore 读取高亮条目，不修改其存储结构 |
| KnowledgeBaseCRUD (R116) | **存储层**：R168 通过 saveEntry/deleteEntry 读写知识库 |
| BookmarkKnowledgeCorrelation (R66) | **关联层**：归档后自动调用 addEntry 建立书签-条目关联 |
| BookmarkTagger (R55) | **降级标签**：AI 不可用时复用规则标签生成 |
| AIClient Context (R164) | **参考但不直接依赖**：R168 的 AI 调用独立于 R164 的 RAG 增强问答，但 prompt 设计风格保持一致 |
| SpacedRepetition (R163) | **下游集成**：归档的条目自动进入复习队列（通过知识库写入间接触发） |
| WeeklyDigest (R165) | **下游集成**：归档数据可被周报统计（highlightArchived 计数） |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-20 | R168 | 初始创建 — SmartHighlightArchive 需求文档 |
