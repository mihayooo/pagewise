# 需求文档 — R164: AI 问答增强 — 上下文感知 ContextAwareAI

> 版本: 1.0
> 日期: 2026-05-19
> 迭代: Phase S — 产品体验升级 (R62)
> 复杂度: Complex

---

## 1. 背景与动机

### 1.1 现状分析

当前 `ai-client.js` 的问答能力存在以下局限：

| 维度 | 现状 | 问题 |
|------|------|------|
| **上下文注入** | `buildPageQuestionPrompt()` 仅传递页面 title/URL/content | 不包含用户已有的书签/知识条目，AI 每次问答都是"零记忆" |
| **系统提示词** | `getSystemPrompt()` 返回静态字符串 | 未根据当前页面类型、用户历史做任何个性化调整 |
| **多轮对话** | `askAboutPage(conversationHistory)` 支持传入历史 | 但调用方（sidebar.js）无窗口管理，历史可能无限增长或为零 |
| **知识检索** | 完全缺失 | `KnowledgeBaseQuery`（全文搜索）和 `BookmarkSemanticSearch`（语义搜索）已有成熟能力，但未与 AI 问答集成 |
| **快捷操作** | 无"解释术语"功能 | 用户选中专业术语后只能手动提问，竞品（Sider、Monica）均支持一键解释 |

### 1.2 竞品差距

根据 `MARKET-ANALYSIS.md` 的市场空白分析：**"跨会话知识关联"** 和 **"知识积累 + AI 理解的闭环"** 是现有工具做不好、但用户真正需要的。本需求直接解决这两个空白：

- **跨会话知识关联** → 从知识库检索历史条目注入 prompt（RAG 模式）
- **知识积累 + AI 理解闭环** → 问答时自动关联已存书签，答案更贴合用户知识背景

---

## 2. 用户故事

**US-1 (上下文感知):**
作为一名技术学习者，我希望在页面上选中文字提问时，AI 能自动了解当前页面信息和我已收藏的相关知识，给出更精准的回答，而不需要我每次重复描述背景。

**US-2 (知识增强):**
作为一名积累了很多技术书签的用户，我希望 AI 问答时能参考我知识库中的相关条目，把新问题和已有知识关联起来，避免重复学习。

**US-3 (多轮追问):**
作为一名在复杂技术文档中探索的用户，我希望在同一个问题基础上连续追问，AI 能记住前面几轮的对话上下文，不需要我反复说明前提。

**US-4 (术语解释):**
作为一名阅读英文技术文档的用户，我希望选中不理解的专业术语后能一键获取解释，而不需要手动输入"请解释 xxx 是什么意思"。

---

## 3. 验收标准

### AC-1: 上下文感知 System Prompt

- 选中文字提问时，system prompt 自动附加以下上下文信息：
  - 当前页面 URL 和标题（已有，来自 `pageContent`）
  - 当前页面域名匹配的已存书签（如有）：标题 + 标签 + 摘要（≤3 条）
  - 页面类型标识（从 `page-detector.js` 获取，如 `api-doc`、`github-repo`、`youtube`）
- system prompt 为**动态拼接**而非静态字符串：基础角色 + 页面类型提示 + 用户知识背景
- 页面类型提示应调整 AI 回答风格（如 API 文档页侧重端点说明，GitHub 页侧重仓库结构分析）
- 不修改 `getSystemPrompt()` 原有签名（向后兼容），新增 `getContextAwareSystemPrompt(context)` 方法

### AC-2: 知识增强检索 (RAG)

- 用户提问时，自动从知识库检索与问题最相关的历史条目（top-3）
- 检索策略优先级：`BookmarkSemanticSearch.hybridSearch()` → 降级为 `KnowledgeBaseQuery.fullTextSearch()` → 降级为空（不阻塞问答）
- 检索到的条目以结构化格式注入 user prompt，标记为"已有知识参考"：
  ```
  【已有知识参考】
  1. [书签标题] — 摘要片段 (来源: URL)
  2. [知识条目标题] — 摘要片段
  3. ...
  ```
- 注入的知识参考内容总长度限制 ≤ 2000 字符（避免撑爆上下文窗口）
- 检索失败或无结果时静默降级，不影响正常问答流程
- 检索耗时 > 500ms 时应有 loading 状态提示

### AC-3: 多轮对话窗口管理

- 保留最近 **5 轮**对话上下文（每轮 = 1 条 user + 1 条 assistant，共 ≤ 10 条 messages）
- 超出窗口的历史消息自动裁剪（丢弃最早轮次），不截断当前轮
- 对话上下文与 `ConversationStore` 持久化联动：
  - 页面刷新/重新打开时，从 `ConversationStore.getConversationByUrl()` 恢复最近 5 轮
  - 每次问答完成后自动保存到 `ConversationStore`
- 对话窗口大小可配置（默认 5，范围 1-10），通过 `options.maxHistoryRounds` 传入

### AC-4: "解释术语"快捷操作

- 用户在页面选中文本后，侧边栏/右键菜单新增 **"📖 解释术语"** 快捷按钮
- 点击后以专用 prompt 模板发送请求：
  - system prompt 角色切换为"术语解释专家"
  - user prompt 模板: `请解释以下术语/概念：「{selection}」\n\n要求：给出定义、用法、与相关概念的区别。如有可能，结合当前页面的上下文解释。`
- 回答格式要求：定义 → 简单类比 → 代码示例（如适用）→ 相关术语链接
- 选中文本长度 > 500 字符时，截取前 500 字符并提示用户文本已截断
- 选中文本 < 2 字符时，按钮不显示（避免误触发）

### AC-5: 语义搜索集成

- 新建 `ContextRetriever` 类（或同等功能模块），封装知识检索逻辑
- 依赖注入方式接入 `BookmarkSemanticSearch` 实例和 `KnowledgeBaseQuery` 实例
- 提供统一接口 `retrieveContext(query, options)` 返回相关条目列表
- `options` 支持：
  - `limit`: 返回条目数（默认 3）
  - `minScore`: 最低相关度阈值（默认 0.1）
  - `maxLength`: 注入内容总字符数上限（默认 2000）
- 语义索引未就绪时（`BookmarkSemanticSearch` 未 `buildIndex`），降级为全文搜索

### AC-6: 测试覆盖

- 单元测试 ≥ 30 用例
- 覆盖：
  - system prompt 动态拼接（各页面类型、有/无书签上下文）
  - 知识检索 RAG 注入（命中 top-3、无命中降级、超时降级、内容截断）
  - 多轮对话窗口（5 轮裁剪、持久化恢复、可配置窗口大小）
  - 解释术语 prompt 模板（正常输入、超长截断、超短不触发）
  - 向后兼容（原有 `askAboutPage` 接口行为不变）

---

## 4. 技术约束

| 约束项 | 说明 |
|--------|------|
| **模块规范** | 纯 ES Module，工厂函数注入依赖（semanticSearch、knowledgeQuery），不直接引用 `chrome.*` 全局对象 |
| **文件拆分** | 新建文件不超过 400 行；建议拆分为: `lib/context-retriever.js`（知识检索层）+ `lib/ai-client-context.js`（上下文感知 prompt 构建层） |
| **向后兼容** | `askAboutPage()` 和 `askAboutPageStream()` 的现有签名和行为**不能改变**；上下文增强通过新增参数（`options.context`）或新方法（`askAboutPageWithContext()`）实现 |
| **性能** | 知识检索（hybridSearch top-3）< 200ms；整体 prompt 构建 < 300ms；不能阻塞 UI 渲染 |
| **无外部依赖** | 不引入额外第三方库；复用现有 `EmbeddingEngine`、`CacheManager` 等基础设施 |
| **Token 预算** | system prompt + 知识参考 + 对话历史 总 token 不超过模型上下文窗口的 50%（留空间给页面内容和回答）；通过 `estimateMessagesTokens()`（来自 `ai-client-tokens.js`）做预检，超限时优先裁剪知识参考 → 裁剪对话历史 → 裁剪页面内容 |
| **i18n** | "解释术语"按钮文案和 prompt 模板需支持中英文 |
| **安全** | 注入 prompt 的知识条目内容需做基本 sanitization（去除潜在 prompt injection 字符，如连续 `---` 分隔符、`system:` 前缀等） |

---

## 5. 依赖关系

### 5.1 上游依赖（本模块消费）

| 模块 | 依赖方式 | 说明 |
|------|----------|------|
| `bookmark-semantic-search.js` | `hybridSearch(query, {limit:3})` | RAG 语义检索核心 |
| `bookmark-semantic-search-hybrid.js` | 同上，SearchOperations 委托 | 混合搜索实现层 |
| `knowledge-base-query.js` | `fullTextSearch(query, {limit:3})` | RAG 降级检索（语义不可用时） |
| `conversation-store.js` | `getConversationByUrl()` / `saveConversation()` | 对话历史持久化与恢复 |
| `ai-client-tokens.js` | `estimateMessagesTokens()` | Token 预算检查 |
| `page-detector.js` | `detectPageType()` | 获取页面类型用于 system prompt 个性化 |
| `bookmark-store.js` 或 `knowledge-base-crud.js` | `getByUrl()` / 查询已存书签 | 获取当前页面关联书签作为上下文 |
| `embedding-engine.js` | 通过 BookmarkSemanticSearch 间接依赖 | 向量生成与相似度计算 |

### 5.2 下游消费者（依赖本模块）

| 模块 | 依赖方式 | 说明 |
|------|----------|------|
| `sidebar.js` | 调用 `askAboutPageWithContext()` | 侧边栏问答主入口，传递选中文字和页面上下文 |
| 右键菜单 (background.js) | 调用 `askAboutPageWithContext()` | 右键"解释术语"菜单项 |
| 浮动按钮 (content-script) | 调用解释术语 API | 选中文字后浮动出现的"📖 解释术语"按钮 |

### 5.3 与现有模块的关系

```
┌──────────────────────────────────────────────────────────┐
│  用户操作                                                 │
│  (选中文字提问 / 解释术语)                                  │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────┐     ┌─────────────────────────┐
│  ContextRetriever         │ ←── │ BookmarkSemanticSearch   │
│  (lib/context-retriever   │     │ (hybridSearch top-3)     │
│   .js) — R164 新建        │     └─────────────────────────┘
│                           │     ┌─────────────────────────┐
│  retrieveContext(query)   │ ←── │ KnowledgeBaseQuery       │
│  → [{title,summary,url}]  │     │ (fullTextSearch 降级)    │
└───────────┬───────────────┘     └─────────────────────────┘
            │
            ▼
┌──────────────────────────────────┐
│  ai-client-context.js             │  — R164 新建
│                                   │
│  buildContextAwarePrompt()        │
│  ├─ getContextAwareSystemPrompt() │ ← page-detector.js (页面类型)
│  ├─ 注入知识参考 (RAG)             │ ← ContextRetriever
│  ├─ 裁剪对话历史 (≤5轮)           │ ← ConversationStore
│  └─ Token 预算检查                 │ ← ai-client-tokens.js
└───────────┬───────────────────────┘
            │
            ▼
┌──────────────────────────┐
│  AIClient (ai-client.js) │  — 现有模块，新增入口方法
│                           │
│  askAboutPageWithContext()│ ← 新增，增强版问答入口
│  explainTerm()            │ ← 新增，解释术语专用方法
│                           │
│  askAboutPage()           │ ← 保持不变（向后兼容）
│  askAboutPageStream()     │ ← 保持不变（向后兼容）
└──────────────────────────┘
```

---

## 6. API 设计预览

> 注: 以下仅为需求层 API 契约，非最终实现代码。

### 6.1 ContextRetriever（知识检索层）

```javascript
class ContextRetriever {
  constructor(options = {}) {
    this._semanticSearch = options.semanticSearch   // BookmarkSemanticSearch 实例
    this._knowledgeQuery = options.knowledgeQuery   // KnowledgeBaseQuery 实例
  }

  // 统一检索接口 — 从知识库获取与查询相关的条目
  async retrieveContext(query, options = {})
  // options: { limit: 3, minScore: 0.1, maxLength: 2000 }
  // returns: [{ title, summary, url, score, source }]

  // 获取当前页面关联的已存书签
  async getPageBookmarks(url, options = {})
  // options: { limit: 3 }
  // returns: [{ title, tags, summary }]

  // 术语解释专用检索 — 针对短文本优化
  async retrieveForTerm(term, options = {})
  // options: { limit: 2 }
  // returns: [{ title, summary, url }]
}
```

### 6.2 ai-client-context.js（上下文感知 prompt 构建）

```javascript
// 动态 system prompt
function getContextAwareSystemPrompt(context = {})
// context: { pageType, bookmarks, userLevel }
// returns: string

// 增强版 prompt 构建
function buildContextAwarePrompt(pageContent, question, knowledgeRefs = [])
// knowledgeRefs: ContextRetriever.retrieveContext() 返回的条目
// returns: string

// 术语解释 prompt
function buildExplainTermPrompt(term, pageContent)
// returns: string

// 对话历史裁剪
function trimConversationHistory(history, maxRounds = 5)
// returns: trimmed messages array
```

### 6.3 AIClient 新增方法

```javascript
// 增强版问答（自动上下文感知 + RAG）
async askAboutPageWithContext(pageContent, question, options = {})
// options: { conversationHistory, maxHistoryRounds, contextRetriever }
// returns: { content, model, usage, contextUsed: { knowledgeRefs, pageBookmarks } }

async *askAboutPageWithContextStream(pageContent, question, options = {})
// 同上，流式版本

// 解释术语专用
async explainTerm(term, pageContent, options = {})
// options: { conversationHistory, contextRetriever }
// returns: { content, model, usage }
```

---

## 7. Token 预算管理策略

在模型上下文窗口有限的条件下，需要合理分配 token 预算：

| 组成部分 | 优先级 | 预算占比 | 裁剪策略 |
|----------|--------|----------|----------|
| System Prompt（基础角色） | 最高 | ~5% | 不裁剪 |
| System Prompt（页面类型+书签上下文） | 高 | ~10% | 超限时减少书签条数 (3→1) |
| 用户当前问题 | 最高 | ~5% | 不裁剪 |
| 页面内容 | 高 | ~30% | 超限时从 8000→4000 字符 |
| 知识参考 (RAG) | 中 | ~15% | 超限时减少条目数 (3→1→0) |
| 对话历史 (≤5轮) | 中 | ~15% | 超限时从 5→3→1 轮 |
| 回答空间 | 最高 | ~20% | 预留，不被占用 |

检查顺序：构建完整 messages 后 → `estimateMessagesTokens()` → 如超出预算，按上述优先级从低到高依次裁剪。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **语义索引未就绪** | `BookmarkSemanticSearch` 未 `buildIndex()` 时 hybridSearch 返回空 | 降级为 `KnowledgeBaseQuery.fullTextSearch()`；仍无结果则静默跳过 |
| **知识检索延迟拖慢问答** | 从索引检索 + 构建 prompt 可能增加 200-500ms | 设置检索超时 500ms（AbortController）；超时则降级为空上下文继续问答 |
| **Token 预算溢出** | 长页面 + 多轮历史 + RAG 参考可能超出模型上下文 | 7 级优先级裁剪策略（见第 7 节）；`estimateMessagesTokens()` 预检 |
| **Prompt Injection 通过知识条目** | 恶意或异常的书签内容可能干扰 AI 行为 | 对注入内容做 sanitization：移除 `system:`/`assistant:` 前缀、连续分隔符、控制字符 |
| **向后兼容破坏** | 修改 `ai-client.js` 可能影响现有调用方 | 新增方法（`askAboutPageWithContext`），不修改现有 `askAboutPage` 签名 |
| **对话历史膨胀** | 5 轮 × 长回答可能导致 messages 过大 | 单轮 assistant 消息超过 2000 字符时截断至 2000 字符 |
| **"解释术语"误触发** | 用户选中大段文本或误选时触发解释 | 选中文本 < 2 字符不显示按钮；> 500 字符截断并提示 |

---

## 9. 非目标（Out of Scope）

- ❌ **向量数据库 / 外部 Embedding API** — 复用现有 `EmbeddingEngine`（TF-IDF），不引入外部向量服务
- ❌ **流式 RAG（边检索边回答）** — 本次先做"检索 → 构建完整 prompt → 一次性发送"模式
- ❌ **用户自定义 system prompt** — 未来增强，本次由系统自动拼接
- ❌ **跨设备知识同步** — R014 (P2) 范畴
- ❌ **回答中自动高亮来源段落** — R012 (P1) 范畴
- ❌ **多模态输入（图片 OCR）** — 不在本需求范围内
- ❌ **UI 面板改动** — 仅新增"解释术语"按钮，不重构侧边栏布局

---

## 10. 测试策略

| 测试类别 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| 上下文感知 System Prompt | 6 | 各页面类型（api-doc/github/youtube/通用）、有无已存书签、空上下文降级 |
| 知识增强检索 RAG | 8 | hybridSearch 命中 top-3、fullTextSearch 降级、无结果静默跳过、超时降级、内容截断 maxLength、minScore 过滤、getPageBookmarks、retrieveForTerm |
| 多轮对话窗口 | 5 | 5 轮裁剪正确性、0 轮空历史、持久化恢复、可配置窗口大小、单轮超长截断 |
| 解释术语 | 4 | 正常术语解释、超长文本截断、prompt 模板正确性、短文本不触发 |
| Token 预算管理 | 4 | 估算准确、各级裁剪触发、预留回答空间 |
| 向后兼容 | 2 | askAboutPage 原有行为不变、askAboutPageStream 原有行为不变 |
| 安全 | 3 | Prompt injection sanitization、控制字符过滤、分隔符转义 |
| **合计** | **≥32** | |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R164 | 新建 AI 问答增强 — 上下文感知 ContextAwareAI 需求文档 |
