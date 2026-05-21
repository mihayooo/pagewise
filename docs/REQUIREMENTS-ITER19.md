# 需求文档 — R247: 知识库智能检索升级 KnowledgeBaseSmartSearch

> 迭代: Phase AI · 飞轮迭代 R68+
> 日期: 2026-05-21
> 复杂度: Complex
> 新建模块: `lib/knowledge-smart-search.js`

---

## 1. 用户故事

**US-1: 模糊检索**

> 作为一名积累了大量知识条目的 PageWise 用户，我希望在搜索知识库时能像使用搜索引擎一样自然——输入模糊关键词、拼音甚至拼错的词也能找到目标条目，这样我不必记住精确的标题或关键词，就能快速回顾之前归档的技术知识。

**US-2: 多维度筛选与排序**

> 作为一名频繁使用知识库回顾和学习的技术用户，我希望搜索结果能按相关度/时间/使用频率多维度排序，并支持按类型/标签/时间范围过滤，这样我可以根据不同场景（复习旧知识 vs. 查找最新条目）灵活缩小范围，提高检索效率。

---

## 2. 验收标准

### AC-1: 模糊搜索与拼音搜索

- **Given** 知识库中存在标题为「React Hooks 最佳实践」的条目
- **When** 用户输入 `react hoks`（拼写错误，编辑距离 ≤2）
- **Then** 系统返回该条目，搜索耗时 <50ms（1000 条知识库基准）

- **Given** 知识库中存在标题为「前端框架对比」的条目
- **When** 用户输入 `qianduankuangjiaduib` 或拼音前缀 `qianduan`
- **Then** 系统返回匹配的中文条目

- 模糊匹配算法基于 Levenshtein 编辑距离，阈值 ≤2
- 拼音搜索基于中文标题/摘要的拼音转换，支持全拼和首字母缩写
- 模糊搜索先通过倒排索引缩小候选集（Top-100），再对候选集做编辑距离计算，保证性能

### AC-2: 搜索结果高亮

- **Given** 用户搜索「JavaScript」命中标题「JavaScript 设计模式」和摘要「使用 JavaScript 实现单例模式」
- **Then** 返回结果中 `highlights` 字段标记命中位置：`{ field: 'title', start: 0, end: 10 }`，`{ field: 'summary', start: 3, end: 13 }`

- 高亮标记仅标记位置索引，不包含 HTML 标签（由 UI 层自行渲染）
- 输出经过 `lib/sanitize.js` 的 `escapeSearchQuery()` 安全处理，防止 XSS 注入
- 多个命中位置全部返回（不截断）

### AC-3: 搜索联想与自动补全

- **Given** 用户输入搜索框前缀 `jav`
- **Then** 在 200ms 防抖后返回联想建议列表，包含：
  - 知识库高频词匹配：`JavaScript`、`Java 并发`
  - 用户搜索历史匹配（复用 `bookmark-search-history.js` 的 `getSuggestions`）
  - 按相关度和频率加权排序，最多返回 10 条

- 联想建议为空时不返回任何内容（不返回兜底建议）
- 输入长度 <2 时不触发联想

### AC-4: 多维度排序

- 搜索结果默认按**综合相关度**排序（TF-IDF 相似度 × 0.6 + 时间衰减 × 0.2 + 访问频率 × 0.2）
- 支持用户切换为单维度排序：
  - `relevance`: 纯 TF-IDF 相关度降序
  - `newest`: 最近更新时间降序
  - `mostVisited`: 访问次数降序
  - `oldest`: 创建时间升序
- 排序切换无需重新搜索，仅对已返回结果重新排列（<5ms / 100 条）

### AC-5: 搜索过滤器

- 支持以下过滤维度（可组合，AND 逻辑）：
  - **类型** (`type`): `'bookmark'` | `'knowledge'` | `'note'` — 三种内容来源
  - **时间范围** (`dateRange`): `{ from: timestamp, to: timestamp }`
  - **标签** (`tags`): 标签数组，条目必须包含全部指定标签（AND 语义）
  - **领域** (`domain`): 技术领域分类（复用 `bookmark-clusterer.js` 14 个领域分类）
- 过滤在搜索结果基础上执行（先搜索后过滤），不修改底层索引
- 过滤后结果为空时返回空数组（不报错）

---

## 3. 技术约束

### 3.1 架构约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `lib/knowledge-smart-search.js` 不引入新的 npm 依赖，不依赖 DOM 或 Chrome API |
| 文件行数 ≤400 行 | 遵循 `scripts/check-file-size.sh` CI 门禁，必要时拆分为子模块 |
| 不重复造轮子 | 搜索核心复用现有模块，新增模块为**编排层**（见 §4 依赖关系） |
| 零外部拼音库 | 实现轻量拼音映射表（覆盖常用 ~3000 汉字），不引入 pinyin-pro 等第三方库 |
| 函数签名稳定 | 导出的公开 API 保持稳定，其他模块可安全调用 |

### 3.2 性能约束

| 操作 | 数据规模 | 性能目标 |
|------|---------|---------|
| 全文搜索（含模糊匹配） | 1,000 条 | <50ms |
| 拼音搜索 | 1,000 条 | <50ms |
| 搜索联想生成 | 1,000 条 + 搜索历史 | <30ms |
| 多维度排序切换 | 100 条结果 | <5ms |
| 过滤器应用 | 100 条结果 | <5ms |

### 3.3 安全约束

- 搜索查询输入经 `lib/sanitize.js` 的 `escapeSearchQuery()` 净化
- 搜索结果高亮位置索引不直接拼接 HTML，由 UI 层使用 `escapeHtml()` 渲染
- 搜索联想不泄露用户未授权的私密笔记内容

### 3.4 质量约束

- 测试用例 **≥30 个**，覆盖：模糊搜索、拼音搜索、高亮、联想、排序、过滤、性能基准、边界情况
- 测试通过 `import` 加载目标模块（确保 c8 可插桩计入覆盖率）
- 新建模块行数 ≤400 行

---

## 4. 依赖关系

### 4.1 上游依赖（复用现有模块）

| 模块 | 行数 | 复用内容 | 复用方式 |
|------|------|---------|---------|
| `lib/knowledge-base-query.js` | 371 | 倒排索引、N-gram 索引、`search()` 方法 | 构造函数注入实例，委托搜索 |
| `lib/bookmark-semantic-search.js` | 263 | TF-IDF 语义搜索、`hybridSearch()` | 调用获取语义相关度分数 |
| `lib/embedding-engine.js` | 302 | TF-IDF 向量化、中文 bigram 分词 | 间接通过 BookmarkSemanticSearch 使用 |
| `lib/bookmark-search-history.js` | 192 | `getSuggestions()`、`getPopularSearches()` | 直接调用获取搜索历史和热门搜索 |
| `lib/sanitize.js` | 208 | `escapeSearchQuery()`、`escapeHtml()` | 搜索输入净化和输出安全处理 |
| `lib/cache-manager.js` | 303 | LRU + TTL 缓存 | 缓存搜索结果和拼音映射表 |
| `lib/bookmark-clusterer.js` | — | 14 个技术领域分类映射 | 按领域过滤时查询领域分类 |

### 4.2 下游消费（被其他模块调用）

| 消费方 | 调用场景 |
|--------|---------|
| `sidebar-knowledge.js` | 知识库面板搜索框集成 |
| `lib/knowledge-panel.js` | 知识面板搜索结果渲染 |
| `popup/bookmark-overview.js` | 弹窗快速搜索入口 |

### 4.3 模块内部 API 设计

```
knowledge-smart-search.js  (编排层，≤400 行)

class KnowledgeSmartSearch {
  constructor({ knowledgeQuery, semanticSearch, searchHistory, cacheManager })

  // 核心搜索
  smartSearch(query, options)          — 统一入口：净化 → 搜索 → 高亮 → 排序 → 过滤
  fuzzySearch(query, limit?)           — Levenshtein 编辑距离 ≤2 匹配
  pinyinSearch(query, limit?)          — 中文拼音转换 + 匹配

  // 搜索增强
  searchWithHighlights(query)          — 搜索 + 高亮位置计算
  getAutocomplete(prefix)              — 联想/自动补全（200ms 防抖由调用方控制）

  // 排序与过滤
  sortResults(results, strategy)       — 多维度排序 ('relevance'|'newest'|'mostVisited'|'oldest')
  applyFilters(results, filters)       — 多维度过滤 ({ type?, dateRange?, tags?, domain? })

  // 工具
  buildHighlights(query, entry)        — 计算命中位置索引
  computeRelevanceScore(query, entry)  — 综合相关度分数计算
}
```

### 4.4 数据流

```
用户输入 query
    │
    ▼
escapeSearchQuery(query)  ← sanitize.js 安全净化
    │
    ├─→ KnowledgeBaseQuery.search(query)      ← 精确匹配
    ├─→ fuzzySearch(query)                     ← 编辑距离 ≤2
    ├─→ pinyinSearch(query)                    ← 拼音匹配
    └─→ BookmarkSemanticSearch.hybridSearch()   ← 语义匹配
    │
    ▼
合并去重 + 相关度加权
    │
    ▼
计算高亮位置 (highlights[])
    │
    ▼
sortResults(results, sortStrategy)
    │
    ▼
applyFilters(results, filters)
    │
    ▼
返回: [{ entry, score, highlights[], matchType }]
```

### 4.5 返回数据结构

```javascript
// 单条搜索结果
{
  entry: { id, title, content, summary, tags, category, createdAt, visitCount, ... },
  score: 0.85,           // 综合相关度分数 (0-1)
  matchType: 'fuzzy',    // 'exact' | 'fuzzy' | 'pinyin' | 'semantic' | 'hybrid'
  highlights: [          // 命中位置索引数组
    { field: 'title', start: 0, end: 10 },
    { field: 'summary', start: 3, end: 13 }
  ]
}

// smartSearch 完整返回
{
  results: [/* 上述单条结果数组 */],
  total: 42,
  query: '原始查询',
  correctedQuery: '纠正后的查询',  // 模糊匹配时的纠正结果（可能与 query 相同）
  suggestions: [],                   // 无结果时的替代建议
  searchTime: 12                     // 搜索耗时 (ms)
}
```

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 拼音转换无外部库，覆盖字数有限 | 部分生僻字拼音搜索失败 | 覆盖 GB2312 常用 3000 字；生僻字自动降级为精确匹配 |
| Levenshtein 在长文本上性能退化 | 搜索超 50ms 门禁 | 先通过倒排索引缩小候选集（Top-100），再对候选集做编辑距离计算 |
| 与 knowledge-base-query.js 职责边界模糊 | 模块耦合 | 本模块为纯编排层，不修改索引结构，仅调用现有搜索 API |
| ~38000 行零覆盖模块导致 c8 覆盖率难提升 | 测试不计入覆盖率 | 通过 `import` 直接加载模块，确保 c8 可插桩 |
| 拼音映射表体积 | 模块行数超 400 行限制 | 拼音映射表独立为 `lib/knowledge-pinyin-map.js` 子模块 |

---

## 6. 不在范围内 (Out of Scope)

- **不**实现向量数据库或神经网络 Embedding（已有 TF-IDF 方案）
- **不**修改现有 `KnowledgeBaseQuery` 的搜索算法（仅在上层增强）
- **不**实现搜索结果分页（已有 `searchPaged()` 方法可复用）
- **不**实现搜索结果 UI 渲染（仅返回数据结构，UI 由 sidebar-knowledge.js 负责）
- **不**实现跨语言搜索（如英文搜中文内容，仅支持同语言搜索和拼音转换）
- **不**实现实时搜索索引更新（依赖现有 KnowledgeBaseQuery 的增量索引机制）

---

## 7. 需求变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-05-21 | 初始创建 R247 知识库智能检索升级需求文档 |
