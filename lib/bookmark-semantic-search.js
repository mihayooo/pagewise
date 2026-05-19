/**
 * BookmarkSemanticSearch — 语义搜索引擎
 *
 * 搜索操作（semanticSearch/hybridSearch/findSimilar）已拆分至 bookmark-semantic-search-hybrid.js
 *
 * @module lib/bookmark-semantic-search
 */

import { EmbeddingEngine } from './embedding-engine.js'
import { CacheManager } from './cache-manager.js'
import { SearchOperations } from './bookmark-semantic-search-hybrid.js'

/**
 * @typedef {Object} SemanticSearchResult
 * @property {string}  id        — 书签 ID
 * @property {number}  score     — 语义相关度分数 (0-1)
 * @property {Object}  bookmark  — 原始书签对象
 * @property {string}  matchType — 'semantic' | 'keyword' | 'hybrid'
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} [limit=20]   — 结果数量限制
 * @property {string} [sortBy]     — 排序策略
 */

export class BookmarkSemanticSearch {
  static FIELD_WEIGHTS = Object.freeze({
    title: 3.0,
    tags: 2.0,
    contentPreview: 1.5,
    folderPath: 1.0,
    url: 0.5,
  })

  constructor(embeddingEngine, bookmarkSearch) {
    this._embeddingEngine = embeddingEngine || new EmbeddingEngine()
    this._bookmarkSearch = bookmarkSearch || null

    this._bookmarkStore = new Map()
    this._documentVectors = new Map()
    this._vocabulary = new Map()
    this._documentCount = 0
    this._searchCache = new CacheManager({ maxSize: 200, ttlMs: 0 })
  }

  // ==================== 搜索方法（委托到 SearchOperations）====================

  semanticSearch(query, opts) {
    return SearchOperations.semanticSearch(this, query, opts)
  }

  hybridSearch(query, opts) {
    return SearchOperations.hybridSearch(this, query, opts)
  }

  findSimilar(bookmarkId, limit) {
    return SearchOperations.findSimilar(this, bookmarkId, limit)
  }

  // ==================== 索引构建 ====================

  buildIndex(bookmarks) {
    this._bookmarkStore.clear()
    this._documentVectors.clear()
    this._vocabulary = new Map()
    this._documentCount = 0
    this._searchCache.clear()

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return

    for (const bm of bookmarks) {
      if (bm && bm.id) {
        this._bookmarkStore.set(String(bm.id), bm)
      }
    }

    this._documentCount = this._bookmarkStore.size
    if (this._documentCount === 0) return

    const tempVocab = new Map()

    for (const [_id, bm] of this._bookmarkStore) {
      const text = this._getWeightedText(bm)
      const tokens = new Set(this._embeddingEngine.tokenize(text))

      for (const token of tokens) {
        tempVocab.set(token, (tempVocab.get(token) || 0) + 1)
      }
    }

    this._vocabulary = tempVocab

    this._embeddingEngine._vocabulary = new Map(this._vocabulary)
    this._embeddingEngine._docCount = this._documentCount
    this._embeddingEngine._vectorCache.clear()

    for (const [id, bm] of this._bookmarkStore) {
      const vec = this._generateBookmarkVector(bm)
      if (vec.size > 0) {
        this._documentVectors.set(id, vec)
      }
    }
  }

  addBookmark(bookmark) {
    if (!bookmark || !bookmark.id) return

    const id = String(bookmark.id)
    this._bookmarkStore.set(id, bookmark)

    const text = this._getWeightedText(bookmark)
    const tokens = new Set(this._embeddingEngine.tokenize(text))

    for (const token of tokens) {
      this._vocabulary.set(token, (this._vocabulary.get(token) || 0) + 1)
    }

    this._documentCount = this._bookmarkStore.size

    this._embeddingEngine._vocabulary = new Map(this._vocabulary)
    this._embeddingEngine._docCount = this._documentCount
    this._embeddingEngine._vectorCache.delete(id)

    const vec = this._generateBookmarkVector(bookmark)
    if (vec.size > 0) {
      this._documentVectors.set(id, vec)
    }
  }

  removeBookmark(bookmarkId) {
    const id = String(bookmarkId)

    if (!this._bookmarkStore.has(id)) return false

    const bookmark = this._bookmarkStore.get(id)

    const text = this._getWeightedText(bookmark)
    const tokens = new Set(this._embeddingEngine.tokenize(text))

    for (const token of tokens) {
      const count = this._vocabulary.get(token) || 0
      if (count <= 1) {
        this._vocabulary.delete(token)
      } else {
        this._vocabulary.set(token, count - 1)
      }
    }

    this._bookmarkStore.delete(id)
    this._documentVectors.delete(id)
    this._embeddingEngine._vectorCache.delete(id)

    this._documentCount = this._bookmarkStore.size

    this._embeddingEngine._vocabulary = new Map(this._vocabulary)
    this._embeddingEngine._docCount = this._documentCount

    return true
  }

  // ==================== 缓存管理 ====================

  invalidateCache(bookmarkId) {
    if (bookmarkId) {
      const id = String(bookmarkId)
      this._documentVectors.delete(id)
      this._embeddingEngine._vectorCache.delete(id)
      this._searchCache.invalidateByTag('search')
    } else {
      this._documentVectors.clear()
      this._embeddingEngine._vectorCache.clear()
      this._searchCache.clear()
    }
  }

  getStats() {
    return {
      totalBookmarks: this._bookmarkStore.size,
      vocabularySize: this._vocabulary.size,
      documentCount: this._documentCount,
    }
  }

  // ==================== 内部方法 ====================

  _getWeightedText(bookmark) {
    const weights = BookmarkSemanticSearch.FIELD_WEIGHTS
    const parts = []

    if (bookmark.title) {
      for (let i = 0; i < Math.round(weights.title); i++) {
        parts.push(bookmark.title)
      }
    }

    if (bookmark.tags && Array.isArray(bookmark.tags)) {
      const tagText = bookmark.tags.join(' ')
      for (let i = 0; i < Math.round(weights.tags); i++) {
        parts.push(tagText)
      }
    }

    if (bookmark.contentPreview) {
      const rounds = Math.max(1, Math.round(weights.contentPreview))
      for (let i = 0; i < rounds; i++) {
        parts.push(bookmark.contentPreview)
      }
    }

    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      parts.push(bookmark.folderPath.join(' '))
    }

    if (bookmark.url) {
      parts.push(bookmark.url)
    }

    return parts.join(' ')
  }

  _generateBookmarkVector(bookmark) {
    const weights = BookmarkSemanticSearch.FIELD_WEIGHTS
    const termWeights = {}

    for (const [field, weight] of Object.entries(weights)) {
      let text

      if (field === 'tags') {
        text = (bookmark.tags && Array.isArray(bookmark.tags)) ? bookmark.tags.join(' ') : ''
      } else if (field === 'folderPath') {
        text = (bookmark.folderPath && Array.isArray(bookmark.folderPath)) ? bookmark.folderPath.join(' ') : ''
      } else {
        text = bookmark[field] || ''
      }

      if (!text) continue

      const tokens = this._embeddingEngine.tokenize(text)
      if (tokens.length === 0) continue

      const fieldTf = {}
      for (const t of tokens) fieldTf[t] = (fieldTf[t] || 0) + 1
      const totalTokens = tokens.length

      for (const [term, count] of Object.entries(fieldTf)) {
        const tfVal = count / totalTokens
        const idfVal = this._documentCount > 0 ? this._idf(term) : 1
        const w = tfVal * idfVal * weight
        if (w > 0) termWeights[term] = (termWeights[term] || 0) + w
      }
    }

    const vec = new Map()
    for (const [term, w] of Object.entries(termWeights)) vec.set(term, w)
    return vec
  }

  _idf(term) {
    const df = this._vocabulary.get(term) || 0
    return Math.log(this._documentCount + 1) - Math.log(1 + df)
  }
}
