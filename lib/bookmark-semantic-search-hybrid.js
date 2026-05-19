/**
 * BookmarkSemanticSearch — 搜索操作子模块
 *
 * 从 bookmark-semantic-search.js 拆分，负责:
 *   - semanticSearch — 纯语义搜索
 *   - hybridSearch — 混合搜索（关键词 + 语义）
 *   - findSimilar — 以文搜文
 *   - _mergeResults — 结果合并
 *
 * @module lib/bookmark-semantic-search-hybrid
 */

/**
 * 搜索操作类 — 混合搜索与以文搜文
 *
 * 通过 mixin 模式混入 BookmarkSemanticSearch 的实例状态。
 * 构造函数接收实例上下文（this 绑定）。
 */
export class SearchOperations {
  /**
   * 纯语义搜索 — 基于 TF-IDF 余弦相似度
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {string}       query — 自然语言查询
   * @param {Object}       [opts]
   * @param {number}       [opts.limit=20]
   * @returns {Array}
   */
  static semanticSearch(ctx, query, opts = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) return []

    const { limit = 20 } = opts
    const trimmed = query.trim()

    // 检查搜索结果缓存
    const cacheKey = `semantic:${trimmed}:${limit}`
    const cached = ctx._searchCache.get(cacheKey)
    if (cached) return cached

    // 生成查询向量
    const queryVec = ctx._embeddingEngine.generateVector(trimmed)
    if (queryVec.size === 0) return []

    // 与所有文档向量计算余弦相似度
    const scored = []

    for (const [id, docVec] of ctx._documentVectors) {
      const score = ctx._embeddingEngine.cosineSimilarity(queryVec, docVec)
      if (score > 0) {
        scored.push({
          id,
          score,
          bookmark: ctx._bookmarkStore.get(id),
          matchType: 'semantic',
        })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    const result = scored.slice(0, limit)
    ctx._searchCache.set(cacheKey, result, { tags: ['search'] })

    return result
  }

  /**
   * 混合搜索 — 合并关键词搜索结果和语义搜索结果
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {string}       query — 搜索查询
   * @param {Object}       [opts]
   * @returns {Array}
   */
  static hybridSearch(ctx, query, opts = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) return []

    const { limit = 20, sortBy = 'relevance' } = opts
    const ratio = 0.6

    const cacheKey = `hybrid:${query.trim()}:${limit}:${sortBy}`
    const cached = ctx._searchCache.get(cacheKey)
    if (cached) return cached

    // 1. 关键词搜索
    let keywordResults = []
    if (ctx._bookmarkSearch) {
      const kwResults = ctx._bookmarkSearch.search(query, { limit: 100 })
      keywordResults = kwResults.map(r => ({
        id: r.id,
        score: r.score,
        bookmark: r.bookmark,
        matchType: 'keyword',
      }))
    }

    // 2. 语义搜索
    const semanticResults = SearchOperations.semanticSearch(ctx, query, { limit: 100 })

    // 3. 合并结果
    let merged = SearchOperations.mergeResults(keywordResults, semanticResults, ratio)

    // 4. 排序策略
    switch (sortBy) {
      case 'semantic-only':
        merged = merged.filter(r => r.matchType === 'semantic' || r.matchType === 'hybrid')
        merged.sort((a, b) => {
          const sa = a.matchType === 'hybrid' ? a._semanticScore || a.score : a.score
          const sb = b.matchType === 'hybrid' ? b._semanticScore || b.score : b.score
          return sb - sa
        })
        break

      case 'keyword-only':
        merged = merged.filter(r => r.matchType === 'keyword' || r.matchType === 'hybrid')
        merged.sort((a, b) => b.score - a.score)
        break

      case 'relevance':
      default:
        merged.sort((a, b) => b.score - a.score)
        break
    }

    const result = merged.slice(0, limit)
    ctx._searchCache.set(cacheKey, result, { tags: ['search'] })

    return result
  }

  /**
   * 以文搜文 — 查找与指定书签最相似的书签
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {string} bookmarkId — 查询书签 ID
   * @param {number} [limit=5]
   * @returns {Array}
   */
  static findSimilar(ctx, bookmarkId, limit = 5) {
    const id = String(bookmarkId)

    if (!ctx._documentVectors.has(id)) return []

    const queryVec = ctx._documentVectors.get(id)
    if (!queryVec || queryVec.size === 0) return []

    const scored = []

    for (const [docId, docVec] of ctx._documentVectors) {
      if (docId === id) continue

      const score = ctx._embeddingEngine.cosineSimilarity(queryVec, docVec)
      if (score > 0) {
        scored.push({
          id: docId,
          score,
          bookmark: ctx._bookmarkStore.get(docId),
          matchType: 'semantic',
        })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  /**
   * 合并关键词搜索结果和语义搜索结果
   *
   * @param {Array} keywordResults
   * @param {Array} semanticResults
   * @param {number} ratio — 关键词权重 (0-1)
   * @returns {Array}
   */
  static mergeResults(keywordResults, semanticResults, ratio = 0.6) {
    const merged = new Map()
    const semanticWeight = 1 - ratio

    const keywordMax = keywordResults.length > 0
      ? Math.max(...keywordResults.map(r => r.score))
      : 1
    const semanticMax = semanticResults.length > 0
      ? Math.max(...semanticResults.map(r => r.score))
      : 1

    for (const r of keywordResults) {
      const normalizedScore = keywordMax > 0 ? (r.score / keywordMax) * ratio : 0
      merged.set(r.id, {
        ...r,
        score: normalizedScore,
        matchType: 'keyword',
        _keywordScore: r.score,
      })
    }

    for (const r of semanticResults) {
      const normalizedScore = semanticMax > 0 ? (r.score / semanticMax) * semanticWeight : 0

      if (merged.has(r.id)) {
        const existing = merged.get(r.id)
        existing.score += normalizedScore
        existing.matchType = 'hybrid'
        existing._semanticScore = r.score
      } else {
        merged.set(r.id, {
          ...r,
          score: normalizedScore,
          matchType: 'semantic',
          _semanticScore: r.score,
        })
      }
    }

    const results = [...merged.values()]
    results.sort((a, b) => b.score - a.score)

    return results
  }
}
