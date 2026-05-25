# 需求文档 — R302: 语义搜索实现 BookmarkSemanticSearch

> 迭代 17 | 2026-05-25
> 基于 REQUIREMENTS-BOOKMARK.md R065 + TODO.md R302

---

## 背景

R65 已构建 `lib/bookmark-semantic-search.js`（263 行）和 `lib/bookmark-semantic-search-hybrid.js`（218 行），实现基于 TF-IDF 余弦相似度的语义搜索基本框架。然而该实现存在以下不足：

1. **融合排序过于简单**：当前 `hybridSearch` 使用固定权重 ratio=0.6 关键词 + 0.4 语义的线性加权，结果归一化依赖单批次 max score，跨批次不可比
2. **无索引持久化**：向量索引仅存于内存（`_documentVectors` Map），扩展重启后需全量重建
3. **大规模性能未优化**：当前对全部文档向量线性扫描（O(n)），>1000 条书签时延迟不可控
4. **语义理解边界**：中文 bigram 分词对跨语言/同义词场景（如"异步编程"→"async/await 教程"）覆盖不足

本次迭代（R302）在 R65 基础上实现四维升级：RRF 融合排序、IndexedDB 持久化、ANN 降级策略、语义查询增强。

---

## 1. 用户故事

**US-1**: 作为收藏了 500+ 技术书签的开发者，我想用自然语言（如"异步编程"、"React 性能优化"）搜索书签，这样我不需要记住书签的精确标题就能找到相关内容。

**US-2**: 作为日常使用 PageWise 的用户，我希望重启扩展后书签搜索依然秒开，而不是每次都要等索引重建。

---

## 2. 验收标准

| # | 验收标准 | 可验证行为 |
|---|---------|-----------|
| AC1 | **语义查询理解** | 查询"异步编程"能匹配标题为"async/await 教程"、"Promise 链式调用指南"的书签（Top-10 中出现 ≥2 条语义相关结果）；查询"React 性能优化"能匹配"React Fiber 架构解析"、"Virtual DOM diff 算法"等书签 |
| AC2 | **RRF 混合排序** | `hybridSearch()` 采用 Reciprocal Rank Fusion（`score = Σ 1/(k+rank_i)`，k=60）融合关键词和语义两个排序列表；结果中 `matchType` 为 `'hybrid'` 的条目同时命中两种信号 |
| AC3 | **索引持久化** | 向量索引序列化至 IndexedDB（库名 `bookmark-semantic-index`），扩展重启后从 IndexedDB 恢复索引（`loadIndex()`），无需全量重建；`saveIndex()` / `loadIndex()` 双向对称 |
| AC4 | **增量更新** | `addBookmark()` 自动计算向量并入索引，`removeBookmark()` 清除向量；增量操作同步更新 IndexedDB 持久化 |
| AC5 | **大规模降级** | 书签数量 >1000 时自动切换降级策略（IVF 聚类分区 + 候选集缩小），搜索延迟 <500ms（含向量检索）；≤1000 条保持精确全量扫描 |
| AC6 | **测试覆盖** | 新增 `tests/test-r302-semantic-search-upgrade.js` ≥30 用例，覆盖：索引构建(5)、语义查询(5)、RRF 排序(5)、IndexedDB 持久化(4)、增量更新(4)、降级策略(4)、边界条件(3) |

---

## 3. 技术约束

### 3.1 架构约束

| 约束 | 说明 |
|------|------|
| **零外部依赖** | 不引入 TensorFlow.js / ONNX / HuggingFace 等重量级推理库；嵌入向量基于现有 `EmbeddingEngine`（TF-IDF）生成 |
| **纯 ES Module** | 不依赖 DOM / Chrome API 运行时（IndexedDB 操作通过注入的 storage 适配层） |
| **工厂函数注入** | `BookmarkSemanticSearch` 构造函数接收 `embeddingEngine`、`bookmarkSearch`、`storageAdapter` 三个依赖，便于测试 mock |
| **向后兼容** | `semanticSearch()` / `hybridSearch()` / `findSimilar()` / `addBookmark()` / `removeBookmark()` 现有 API 签名不变，内部实现升级 |
| **文件大小** | 新增/修改文件合计 ≤500 行（现有 481 行，升级部分控制增量） |

### 3.2 性能约束

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 索引构建（1000 条） | <2s | `buildIndex()` 计时 |
| 增量添加单条 | <5ms | `addBookmark()` 计时 |
| 语义搜索（1000 条） | <500ms | `semanticSearch()` 端到端计时 |
| 混合搜索（1000 条） | <500ms | `hybridSearch()` 端到端计时 |
| IndexedDB 持久化写入 | <500ms | `saveIndex()` 计时 |
| IndexedDB 持久化读取 | <300ms | `loadIndex()` 计时 |

### 3.3 数据约束

- 向量维度由 `EmbeddingEngine` TF-IDF 词汇表大小动态决定（非固定维度），典型 1000 条书签约产生 3000-8000 维稀疏向量
- IndexedDB 存储格式：稀疏向量序列化为 `{terms: string[], weights: number[]}` 压缩格式（避免存储全量零值）
- IVF 降级策略：聚类中心数 = `Math.ceil(n / 200)`，搜索时仅遍历最近 Top-3 个聚类分区

---

## 4. 依赖关系

### 4.1 上游依赖（本次使用）

| 模块 | 用途 | 状态 |
|------|------|------|
| `lib/embedding-engine.js` | TF-IDF 向量生成 + 余弦相似度计算 | ✅ R65 已实现 |
| `lib/bookmark-indexer.js` | 倒排索引关键词搜索（精确匹配管道） | ✅ R44 已实现 |
| `lib/bookmark-search.js` | 综合搜索接口（hybridSearch 的关键词通道） | ✅ R49 已实现 |
| `lib/cache-manager.js` | LRU+TTL 搜索结果缓存 | ✅ R127 已实现 |
| `lib/bookmark-semantic-search.js` | 现有语义搜索基础（本次升级改造） | ✅ R65 已实现 |
| `lib/bookmark-semantic-search-hybrid.js` | 混合搜索子模块（本次重写融合排序） | ✅ R65 已实现 |

### 4.2 下游影响（本次变更后）

| 模块 | 影响 | 说明 |
|------|------|------|
| `lib/bookmark-recommender.js` | 无破坏 | `findSimilar()` API 不变 |
| `lib/bookmark-knowledge-link.js` | 无破坏 | 仅使用 `EmbeddingEngine` 静态方法 |
| `lib/knowledge-smart-search.js` | 可选增强 | 可后续接入 RRF 模块 |
| `lib/bookmark-offline-cache.js` | 可选增强 | 离线搜索可复用语义索引 |
| `tests/test-bookmark-semantic-search.js` | 需验证 | 35 个现有用例必须全部通过 |

### 4.3 与 REQUIREMENTS-BOOKMARK.md 的关系

本次 R302 是 R065（P2 语义搜索）的**完整实现升级**：

| R065 验收标准 | R65 现状 | R302 目标 |
|---------------|---------|-----------|
| 支持自然语言查询 | 基础 TF-IDF | TF-IDF + 中文同义词增强 |
| 语义相似度排序 | 余弦相似度 | 余弦相似度 + RRF 融合 |
| 搜索延迟 <500ms | 线性扫描 | 线性扫描 + IVF 降级 |
| *(未定义)* 索引持久化 | 内存 Map | IndexedDB |
| *(未定义)* 增量更新 | add/remove | add/remove + 自动持久化 |

---

## 5. 非目标（明确排除）

| 排除项 | 原因 |
|--------|------|
| 神经网络 Embedding（BGE / text-embedding-ada 等） | 需引入重量级运行时，违反零依赖约束；Chrome 扩展包体积限制 5MB |
| HNSW 近似最近邻 | 稀疏 TF-IDF 向量（维度 3000-8000）不适合 HNSW 的密集向量假设；IVF 对稀疏向量更友好 |
| 实时页面内容嵌入 | 需抓取页面正文，超出搜索模块职责 |
| 跨书签/知识库联合语义搜索 | 属于 R66（知识关联）职责范围 |

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| TF-IDF 稀疏向量余弦相似度对同义词覆盖不足 | 高 | AC1 可能部分失败 | 增加同义词映射表（中英文技术术语 200+ 对），查询扩展时自动注入同义词 |
| IndexedDB 序列化大向量集性能差 | 中 | AC3 延迟超标 | 稀疏向量压缩（仅存非零项）；增量写入而非全量重写 |
| IVF 聚类质量不稳定 | 中 | AC5 精度下降 | IVF 仅用于候选集缩小，最终仍用精确余弦相似度重排；聚类中心定期重算 |
| 现有 35 个测试回归 | 低 | CI 红灯 | API 签名不变，内部重构逐步替换；每个子任务完成后运行现有测试 |

---

## 7. 实现建议（仅供参考，不约束实现）

### 7.1 模块拆分

```
lib/bookmark-semantic-search.js      ← 主模块（升级 buildIndex / addBookmark / removeBookmark）
lib/bookmark-semantic-search-hybrid.js ← 混合搜索（重写 mergeResults → RRF）
lib/bookmark-semantic-index-store.js   ← 新建：IndexedDB 持久化适配层
lib/bookmark-semantic-ann.js           ← 新建：IVF 降级策略
```

### 7.2 RRF 融合公式

```
RRF_score(doc) = Σ 1 / (k + rank_i(doc))
  k = 60（标准参数，Cormack et al. 2009）
  rank_i = doc 在第 i 个排序列表中的排名（从 1 开始）
  i ∈ {keyword_list, semantic_list}
```

### 7.3 IVF 降级流程

```
IF bookmark_count > 1000:
  1. 从 IndexedDB 加载预计算聚类中心（或首次触发时计算）
  2. 计算查询向量与所有聚类中心的余弦相似度
  3. 选取最近 Top-3 聚类分区的书签作为候选集
  4. 在候选集上执行精确余弦相似度排序
  5. 返回 Top-K 结果
ELSE:
  精确全量扫描（现有逻辑）
```

### 7.4 IndexedDB Schema

```
Database:  bookmark-semantic-index
ObjectStore: vectors
  key: bookmarkId (string)
  value: { terms: string[], weights: number[], updatedAt: number }

ObjectStore: metadata
  key: 'index-meta'
  value: { documentCount: number, vocabularyKeys: string[], clusterCenters: Object[], updatedAt: number }
```

---

## 8. 测试计划

| 类别 | 用例数 | 关键场景 |
|------|--------|---------|
| 索引构建 | 5 | buildIndex 正常/空输入/全量重建/增量更新后重建 |
| 语义查询 | 5 | 中文自然语言/英文自然语言/跨语言/空查询/无匹配 |
| RRF 排序 | 5 | 纯关键词命中/纯语义命中/双命中混合/排序正确性/k 参数影响 |
| IndexedDB 持久化 | 4 | saveIndex/loadIndex 往返/空索引/损坏数据容错/增量追加 |
| 增量更新 | 4 | add 入索引+持久化/remove 清索引+持久化/批量操作/重复 ID |
| 降级策略 | 4 | 1000 条以下不降级/1000+ 触发 IVF/聚类中心计算/候选集质量 |
| 边界条件 | 3 | 超长标题书签/特殊字符/同 ID 重复书签 |

**总计: ≥30 用例**

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-25 | R302 | 新建 R302 语义搜索升级需求文档（基于 R065 定义 + R65 已有实现） |
