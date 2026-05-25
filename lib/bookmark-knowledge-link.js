/**
 * BookmarkKnowledgeCorrelation — 知识关联引擎
 *
 * 迭代 R66: 知识关联 BookmarkKnowledgeCorrelation
 *
 * 设计决策:
 *   - 复用 EmbeddingEngine (迭代 #7) 的 TF-IDF 核心算法进行语义相似度计算
 *   - 多维关联: URL 精确匹配 (0.4) + 标题语义相似 (0.3) + 标签重叠 (0.3)
 *   - 纯 ES Module，零外部依赖，不依赖 DOM/Chrome API
 *   - 支持增量更新 (addEntry / removeEntry)
 *   - 双向查询: 书签→条目 和 条目→书签
 *   - 关联强度可视化支持: 返回分项得分和总体得分
 *   - 关联建议: 未关联但高相似度的书签-条目对
 *
 * 关联计算逻辑已拆分至 bookmark-knowledge-link-scorer.js
 */

import { EmbeddingEngine } from './embedding-engine.js'
import {
  CORRELATION_THRESHOLD,
  SUGGESTION_THRESHOLD,
  normalizeUrl,
  normalizeTag,
  computeCorrelation,
} from './bookmark-knowledge-link-scorer.js'

/** BookmarkKnowledgeCorrelation 类 */
export class BookmarkKnowledgeCorrelation {
  /**
   * @param {EmbeddingEngine} [embeddingEngine]
   */
  constructor(embeddingEngine) {
    this._embeddingEngine = embeddingEngine || new EmbeddingEngine()

    this._bookmarkStore = new Map()
    this._entryStore = new Map()
    this._correlationCache = new Map()

    this._urlIndex = new Map()
    this._bookmarkUrlIndex = new Map()
    this._entryTagIndex = new Map()
    this._bookmarkTagIndex = new Map()
  }

  // ==================== 核心 API ====================

  buildIndex(bookmarks, entries) {
    this._bookmarkStore.clear()
    this._entryStore.clear()
    this._correlationCache.clear()
    this._urlIndex.clear()
    this._bookmarkUrlIndex.clear()
    this._entryTagIndex.clear()
    this._bookmarkTagIndex.clear()

    if (!Array.isArray(bookmarks) || !Array.isArray(entries)) return

    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this._bookmarkStore.set(String(bm.id), bm)
      }
    }
    for (const entry of entries) {
      if (entry && entry.id !== null) {
        this._entryStore.set(Number(entry.id), entry)
      }
    }

    if (this._bookmarkStore.size === 0 || this._entryStore.size === 0) return

    this._buildUrlIndex()
    this._buildTagIndex()
    this._computeAllCorrelations()
  }

  addEntry(entry) {
    if (!entry || entry.id === null) return

    const id = Number(entry.id)
    this._entryStore.set(id, entry)

    const url = normalizeUrl(entry.sourceUrl || '')
    if (url) {
      if (!this._urlIndex.has(url)) this._urlIndex.set(url, new Set())
      this._urlIndex.get(url).add(id)
    }

    if (entry.tags && Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const normalized = normalizeTag(tag)
        if (!normalized) continue
        if (!this._entryTagIndex.has(normalized)) this._entryTagIndex.set(normalized, new Set())
        this._entryTagIndex.get(normalized).add(id)
      }
    }

    for (const [bmId, bookmark] of this._bookmarkStore) {
      const strength = computeCorrelation(bookmark, entry, this._embeddingEngine)
      if (strength.total >= CORRELATION_THRESHOLD) {
        if (!this._correlationCache.has(bmId)) this._correlationCache.set(bmId, new Map())
        this._correlationCache.get(bmId).set(id, strength)
      }
    }
  }

  removeEntry(entryId) {
    const id = Number(entryId)

    if (!this._entryStore.has(id)) return false

    const entry = this._entryStore.get(id)

    const url = normalizeUrl(entry.sourceUrl || '')
    if (url && this._urlIndex.has(url)) {
      this._urlIndex.get(url).delete(id)
      if (this._urlIndex.get(url).size === 0) this._urlIndex.delete(url)
    }

    if (entry.tags && Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const normalized = normalizeTag(tag)
        if (normalized && this._entryTagIndex.has(normalized)) {
          this._entryTagIndex.get(normalized).delete(id)
          if (this._entryTagIndex.get(normalized).size === 0) this._entryTagIndex.delete(normalized)
        }
      }
    }

    for (const [, entryMap] of this._correlationCache) {
      entryMap.delete(id)
    }

    this._entryStore.delete(id)

    return true
  }

  getRelatedEntries(bookmarkId, opts = {}) {
    const bmId = String(bookmarkId)
    const { limit = 10 } = opts

    if (!this._bookmarkStore.has(bmId)) return []

    const entryMap = this._correlationCache.get(bmId)
    if (!entryMap || entryMap.size === 0) return []

    const results = []
    for (const [entryId, strength] of entryMap) {
      if (strength.total < CORRELATION_THRESHOLD) continue
      const entry = this._entryStore.get(entryId)
      if (!entry) continue

      const matchTypes = []
      if (strength.urlMatch > 0) matchTypes.push('url')
      if (strength.titleSimilarity > 0.1) matchTypes.push('title')
      if (strength.tagOverlap > 0) matchTypes.push('tag')

      results.push({ score: strength.total, matchTypes, entry })
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  getRelatedBookmarks(entryId, opts = {}) {
    const id = Number(entryId)
    const { limit = 10 } = opts

    if (!this._entryStore.has(id)) return []

    const results = []
    for (const [bmId, entryMap] of this._correlationCache) {
      const strength = entryMap.get(id)
      if (!strength || strength.total < CORRELATION_THRESHOLD) continue

      const bookmark = this._bookmarkStore.get(bmId)
      if (!bookmark) continue

      const matchTypes = []
      if (strength.urlMatch > 0) matchTypes.push('url')
      if (strength.titleSimilarity > 0.1) matchTypes.push('title')
      if (strength.tagOverlap > 0) matchTypes.push('tag')

      results.push({ score: strength.total, matchTypes, bookmark })
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  getCorrelationStrength(bookmarkId, entryId) {
    const bmId = String(bookmarkId)
    const eId = Number(entryId)

    if (!this._bookmarkStore.has(bmId) || !this._entryStore.has(eId)) return null

    const entryMap = this._correlationCache.get(bmId)
    if (!entryMap) return null

    return entryMap.get(eId) || null
  }

  suggestCorrelations(opts = {}) {
    const { limit = 10 } = opts
    const suggestions = []

    for (const [bmId, entryMap] of this._correlationCache) {
      const bookmark = this._bookmarkStore.get(bmId)
      if (!bookmark) continue

      for (const [entryId, strength] of entryMap) {
        if (strength.total < SUGGESTION_THRESHOLD) continue
        const entry = this._entryStore.get(entryId)
        if (!entry) continue

        const reasons = []
        if (strength.urlMatch > 0) reasons.push('同一来源 URL')
        if (strength.titleSimilarity > 0.3) reasons.push('标题内容相似')
        if (strength.tagOverlap > 0.3) reasons.push('标签高度重叠')
        if (reasons.length === 0 && strength.total >= SUGGESTION_THRESHOLD) {
          reasons.push('综合内容关联')
        }

        suggestions.push({ bookmark, entry, score: strength.total, reason: reasons.join(' + ') })
      }
    }

    suggestions.sort((a, b) => b.score - a.score)
    return suggestions.slice(0, limit)
  }

  getCorrelationSummary(bookmarkId) {
    const bmId = String(bookmarkId)

    if (!this._bookmarkStore.has(bmId)) return null

    const bookmark = this._bookmarkStore.get(bmId)
    const relatedEntries = this.getRelatedEntries(bmId, { limit: 50 })

    const avgScore = relatedEntries.length > 0
      ? relatedEntries.reduce((sum, r) => sum + r.score, 0) / relatedEntries.length
      : 0

    return {
      bookmark,
      relatedEntries,
      totalRelated: relatedEntries.length,
      avgScore: Math.round(avgScore * 1000) / 1000,
    }
  }

  getStats() {
    let totalCorrelations = 0
    const associatedBookmarkIds = new Set()
    const associatedEntryIds = new Set()

    for (const [bmId, entryMap] of this._correlationCache) {
      for (const [entryId, strength] of entryMap) {
        if (strength.total >= CORRELATION_THRESHOLD) {
          totalCorrelations++
          associatedBookmarkIds.add(bmId)
          associatedEntryIds.add(entryId)
        }
      }
    }

    const totalBookmarks = this._bookmarkStore.size
    const totalEntries = this._entryStore.size

    return {
      totalBookmarks,
      totalEntries,
      totalCorrelations,
      associatedBookmarks: associatedBookmarkIds.size,
      associatedEntries: associatedEntryIds.size,
      avgCorrelationsPerBookmark: totalBookmarks > 0
        ? Math.round((totalCorrelations / totalBookmarks) * 100) / 100
        : 0,
    }
  }

  // ==================== 内部方法 ====================

  _buildUrlIndex() {
    for (const [id, bm] of this._bookmarkStore) {
      const url = normalizeUrl(bm.url || '')
      if (url) {
        if (!this._bookmarkUrlIndex.has(url)) this._bookmarkUrlIndex.set(url, new Set())
        this._bookmarkUrlIndex.get(url).add(id)
      }
    }

    for (const [id, entry] of this._entryStore) {
      const url = normalizeUrl(entry.sourceUrl || '')
      if (url) {
        if (!this._urlIndex.has(url)) this._urlIndex.set(url, new Set())
        this._urlIndex.get(url).add(id)
      }
    }
  }

  _buildTagIndex() {
    for (const [id, bm] of this._bookmarkStore) {
      if (bm.tags && Array.isArray(bm.tags)) {
        for (const tag of bm.tags) {
          const normalized = normalizeTag(tag)
          if (!normalized) continue
          if (!this._bookmarkTagIndex.has(normalized)) this._bookmarkTagIndex.set(normalized, new Set())
          this._bookmarkTagIndex.get(normalized).add(id)
        }
      }
    }

    for (const [id, entry] of this._entryStore) {
      if (entry.tags && Array.isArray(entry.tags)) {
        for (const tag of entry.tags) {
          const normalized = normalizeTag(tag)
          if (!normalized) continue
          if (!this._entryTagIndex.has(normalized)) this._entryTagIndex.set(normalized, new Set())
          this._entryTagIndex.get(normalized).add(id)
        }
      }
    }
  }

  _computeAllCorrelations() {
    for (const [bmId, bookmark] of this._bookmarkStore) {
      const entryMap = new Map()

      for (const [entryId, entry] of this._entryStore) {
        const strength = computeCorrelation(bookmark, entry, this._embeddingEngine)
        if (strength.total >= CORRELATION_THRESHOLD) {
          entryMap.set(entryId, strength)
        }
      }

      if (entryMap.size > 0) {
        this._correlationCache.set(bmId, entryMap)
      }
    }
  }
}

// ==================== 向后兼容 re-export ====================
export { CORRELATION_THRESHOLD, SUGGESTION_THRESHOLD, normalizeUrl, normalizeTag }
