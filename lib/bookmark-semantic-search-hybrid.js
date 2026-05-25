/**
 * BookmarkSemanticSearch — 搜索操作子模块
 *
 * 从 bookmark-semantic-search.js 拆分，负责:
 *   - semanticSearch — 纯语义搜索（支持 IVF 近似最近邻降级）
 *   - hybridSearch — 混合搜索（关键词 + 语义，RRF 融合排序）
 *   - findSimilar — 以文搜文
 *   - mergeResults — 加权归一化结果合并（兼容旧接口）
 *   - rrfMerge — Reciprocal Rank Fusion 融合排序
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
   * 当书签数 > IVF_THRESHOLD 时使用 IVF 近似最近邻搜索（先查分区再精排），
   * 否则使用暴力全量搜索。
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

    let scored = []

    // IVF 降级策略: 大书签库使用近似最近邻
    if (ctx._ivfIndex && ctx._documentVectors.size > (ctx._ivfThreshold || 1000)) {
      scored = SearchOperations._ivfSearch(ctx, queryVec, limit)
    } else {
      // 暴力全量搜索
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
    }

    scored.sort((a, b) => b.score - a.score)
    const result = scored.slice(0, limit)
    ctx._searchCache.set(cacheKey, result, { tags: ['search'] })

    return result
  }

  /**
   * IVF (Inverted File Index) 近似最近邻搜索
   *
   * 1. 计算查询向量与各聚类质心的相似度
   * 2. 选择 top-nprobe 个最近分区
   * 3. 仅在选中分区中做精确搜索
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {Map} queryVec — 查询向量
   * @param {number} limit — 返回数量
   * @returns {Array}
   * @private
   */
  static _ivfSearch(ctx, queryVec, limit) {
    const ivf = ctx._ivfIndex
    const nprobe = ivf.nprobe || 3

    // === 性能优化: 预计算查询向量 L2 范数（仅算一次） ===
    let queryMagSq = 0
    for (const [, w] of queryVec) queryMagSq += w * w
    const queryMag = Math.sqrt(queryMagSq)

    // === 性能优化: 使用预缓存的质心 L2 范数 ===
    if (!ivf._centroidNorms) {
      const norms = []
      for (const centroid of ivf.centroids) {
        let magSq = 0
        for (const [, w] of centroid) magSq += w * w
        norms.push(Math.sqrt(magSq))
      }
      ivf._centroidNorms = norms
    }

    // 1. 计算查询与各质心的相似度（优化: 避免完整 cosineSimilarity 调用）
    const centroidScores = []
    for (let i = 0; i < ivf.centroids.length; i++) {
      const centroid = ivf.centroids[i]
      let dotProduct = 0
      for (const [term, w1] of queryVec) {
        const w2 = centroid.get(term)
        if (w2 !== undefined) dotProduct += w1 * w2
      }
      const denom = queryMag * ivf._centroidNorms[i]
      const sim = denom > 0 ? dotProduct / denom : 0
      centroidScores.push({ clusterIdx: i, score: sim })
    }
    centroidScores.sort((a, b) => b.score - a.score)

    // 2. 选 top-nprobe 个分区
    const selectedClusters = centroidScores.slice(0, nprobe)

    // 3. 在选中分区中精确搜索，使用 limit 约束 + 提前终止
    const scored = []
    const visited = new Set()
    // 每个分区最多收集 limit 个候选（nprobe 分区共 limit * nprobe 个，再精排取 limit 个）
    const perClusterLimit = limit * 2

    for (const { clusterIdx, score: centroidSim } of selectedClusters) {
      const memberIds = ivf.clusters[clusterIdx] || []
      let clusterCount = 0
      for (const id of memberIds) {
        if (visited.has(id)) continue
        visited.add(id)
        const docVec = ctx._documentVectors.get(id)
        if (!docVec) continue
        const score = ctx._embeddingEngine.cosineSimilarity(queryVec, docVec)
        if (score > 0) {
          scored.push({
            id,
            score,
            bookmark: ctx._bookmarkStore.get(id),
            matchType: 'semantic',
          })
          clusterCount++
          if (clusterCount >= perClusterLimit) break
        }
      }

      // 提前终止: 如果已有足够候选且当前质心相似度已很低，跳过剩余分区
      if (scored.length >= limit * 3 && centroidSim < 0.1) break
    }

    return scored
  }

  /**
   * 混合搜索 — 合并关键词搜索结果和语义搜索结果
   *
   * 默认使用 RRF (Reciprocal Rank Fusion) 融合排序。
   * 可通过 opts.mergeStrategy = 'weighted' 切换回旧的加权归一化合并。
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {string}       query — 搜索查询
   * @param {Object}       [opts]
   * @param {string}       [opts.sortBy='relevance'] — 排序策略
   * @param {number}       [opts.limit=20]
   * @param {string}       [opts.mergeStrategy='rrf'] — 融合策略 ('rrf' | 'weighted')
   * @param {number}       [opts.k=60] — RRF k 参数
   * @returns {Array}
   */
  static hybridSearch(ctx, query, opts = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) return []

    const { limit = 20, sortBy = 'relevance', mergeStrategy = 'rrf', k = 60 } = opts

    const cacheKey = `hybrid:${query.trim()}:${limit}:${sortBy}:${mergeStrategy}:${k}`
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

    // 3. 融合排序
    let merged
    if (mergeStrategy === 'weighted') {
      merged = SearchOperations.mergeResults(keywordResults, semanticResults, 0.6)
    } else {
      merged = SearchOperations.rrfMerge(keywordResults, semanticResults, { k })
    }

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

  // ==================== 融合排序 ====================

  /**
   * Reciprocal Rank Fusion (RRF) — 融合排序
   *
   * RRF 分数 = Σ 1/(k + rank_i)
   * 其中 k 为常数（默认 60），rank_i 为文档在第 i 个列表中的排名（从 1 开始）。
   *
   * 优势: 不需要归一化分数，对不同搜索引擎的原始分数尺度不敏感。
   * 文档出现在多个列表中且排名靠前时，RRF 分数更高。
   *
   * @param {Array} keywordResults — 关键词搜索结果（已按 score 降序）
   * @param {Array} semanticResults — 语义搜索结果（已按 score 降序）
   * @param {Object} [options]
   * @param {number} [options.k=60] — RRF k 参数，越大则排名差异的区分度越小
   * @returns {Array} 融合后的结果，按 RRF 分数降序
   */
  static rrfMerge(keywordResults, semanticResults, options = {}) {
    const { k = 60 } = options
    const scoreMap = new Map()

    // 辅助: 获取或创建结果条目
    function getOrCreateEntry(id, source) {
      if (!scoreMap.has(id)) {
        scoreMap.set(id, {
          id,
          score: 0,
          bookmark: source.bookmark,
          matchType: 'semantic',
          _keywordRank: Infinity,
          _semanticRank: Infinity,
          _keywordScore: 0,
          _semanticScore: 0,
        })
      }
      return scoreMap.get(id)
    }

    // 计算关键词列表的 RRF 分数贡献
    for (let rank = 0; rank < keywordResults.length; rank++) {
      const r = keywordResults[rank]
      const entry = getOrCreateEntry(r.id, r)
      entry.score += 1 / (k + rank + 1)
      entry.matchType = 'keyword'
      entry._keywordRank = rank + 1
      entry._keywordScore = r.score
      if (!entry.bookmark && r.bookmark) entry.bookmark = r.bookmark
    }

    // 计算语义列表的 RRF 分数贡献
    for (let rank = 0; rank < semanticResults.length; rank++) {
      const r = semanticResults[rank]
      const entry = getOrCreateEntry(r.id, r)
      entry.score += 1 / (k + rank + 1)
      entry._semanticRank = rank + 1
      entry._semanticScore = r.score
      if (!entry.bookmark && r.bookmark) entry.bookmark = r.bookmark

      // 同时出现在两个列表中 → hybrid
      if (entry.matchType === 'keyword') {
        entry.matchType = 'hybrid'
      }
    }

    const results = [...scoreMap.values()]
    results.sort((a, b) => b.score - a.score)

    return results
  }

  /**
   * 加权归一化合并 — 旧接口（兼容保留）
   *
   * 将关键词和语义分数分别归一化到 [0,1]，然后加权求和。
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
