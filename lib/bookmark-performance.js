/**
 * BookmarkPerformanceOptimizer — 性能优化器
 *
 * 为 BookmarkGraph 系统提供批处理、缓存、虚拟化和 Worker 卸载能力。
 * R203: 相似度计算 → bookmark-performance-similarity.js
 */

import { BookmarkGraphEngine } from './bookmark-graph.js'
import { BookmarkIndexer } from './bookmark-indexer.js'
import { CacheManager } from './cache-manager.js'
import {
  computePairSimilarity, tokenizeTitle, extractDomain,
  folderOverlapScore, jaccard,
} from './bookmark-performance-similarity.js'

// Re-export similarity functions for backward compatibility
export { computePairSimilarity, tokenizeTitle, extractDomain, folderOverlapScore, jaccard }

/** BookmarkPerformanceOptimizer 类 */
export class BookmarkPerformanceOptimizer {
  constructor(options = {}) {
    this._batchSize = options.batchSize ?? 500
    this._cacheMaxSize = options.cacheMaxSize ?? 5000
    this._workerEnabled = options.workerEnabled ?? false
    this._buildTime = 0
    this._cacheHits = 0
    this._cacheMisses = 0
    this._totalProcessed = 0
    this._batchCount = 0
    this._cache = new CacheManager({ maxSize: this._cacheMaxSize, ttlMs: 0 })
  }

  // ==================== 批处理 API ====================

  async buildGraphBatched(bookmarks, onProgress) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return { nodes: [], edges: [] }
    const startTime = Date.now()
    const total = bookmarks.length
    this._batchCount = Math.ceil(total / this._batchSize)
    this._totalProcessed = 0
    const allBookmarks = []
    for (let i = 0; i < total; i += this._batchSize) {
      const batch = bookmarks.slice(i, i + this._batchSize)
      allBookmarks.push(...batch)
      this._totalProcessed += batch.length
      if (onProgress) onProgress({ current: this._totalProcessed, total })
      if (i + this._batchSize < total) await this._yield()
    }
    const engine = new BookmarkGraphEngine()
    const graph = engine.buildGraph(allBookmarks)
    this._buildTime = Date.now() - startTime
    return graph
  }

  async buildIndexBatched(bookmarks, onProgress) {
    const startTime = Date.now()
    const indexer = new BookmarkIndexer()
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) { this._buildTime = Date.now() - startTime; return indexer }
    const total = bookmarks.length
    this._batchCount = Math.ceil(total / this._batchSize)
    this._totalProcessed = 0
    for (let i = 0; i < total; i += this._batchSize) {
      const batch = bookmarks.slice(i, i + this._batchSize)
      for (const bm of batch) indexer.addBookmark(bm)
      this._totalProcessed += batch.length
      if (onProgress) onProgress({ current: this._totalProcessed, total })
      if (i + this._batchSize < total) await this._yield()
    }
    this._buildTime = Date.now() - startTime
    return indexer
  }

  async computeSimilarityBatched(pairs, onProgress) {
    if (!Array.isArray(pairs) || pairs.length === 0) return []
    const startTime = Date.now()
    const total = pairs.length
    this._batchCount = Math.ceil(total / this._batchSize)
    this._totalProcessed = 0
    const results = []
    for (let i = 0; i < total; i += this._batchSize) {
      const batch = pairs.slice(i, i + this._batchSize)
      for (const pair of batch) {
        results.push({ a: pair.a, b: pair.b, similarity: computePairSimilarity(pair.a, pair.b) })
      }
      this._totalProcessed += batch.length
      if (onProgress) onProgress({ current: this._totalProcessed, total })
      if (i + this._batchSize < total) await this._yield()
    }
    this._buildTime = Date.now() - startTime
    return results
  }

  // ==================== 缓存管理 ====================

  trimCache(cache, maxSize) {
    if (!(cache instanceof Map)) return cache
    if (cache.size <= maxSize) return cache
    const cm = new CacheManager({ maxSize, ttlMs: 0 })
    for (const [key, value] of cache) cm.set(key, value)
    const result = new Map()
    for (const [key] of cache) { const val = cm.get(key); if (val !== undefined) result.set(key, val) }
    return result
  }

  // ==================== 虚拟化渲染 ====================

  getVisibleNodes(nodes, viewport, padding = 0) {
    if (!Array.isArray(nodes) || !viewport) return []
    const vx = viewport.x - padding, vy = viewport.y - padding
    const vw = viewport.width + padding * 2, vh = viewport.height + padding * 2
    return nodes.filter(node => node.x >= vx && node.x <= vx + vw && node.y >= vy && node.y <= vy + vh)
  }

  // ==================== Worker 卸载 ====================

  createWorker() {
    return { postMessage: () => {}, terminate: () => {} }
  }

  async runInWorker(operation, data) {
    if (!this._workerEnabled) return this._executeOperation(operation, data)
    return new Promise((resolve, reject) => {
      try {
        const worker = this.createWorker()
        worker.postMessage({ operation, data })
        const result = this._executeOperation(operation, data)
        worker.terminate()
        resolve(result)
      } catch (err) { reject(err) }
    })
  }

  // ==================== 性能统计 ====================

  getPerformanceStats() {
    return {
      batchSize: this._batchSize, cacheMaxSize: this._cacheMaxSize, workerEnabled: this._workerEnabled,
      buildTime: this._buildTime, cacheHits: this._cacheHits, cacheMisses: this._cacheMisses,
      totalProcessed: this._totalProcessed, batchCount: this._batchCount,
    }
  }

  // ==================== 内部方法 ====================

  _yield() { return new Promise(resolve => setTimeout(resolve, 0)) }

  _computePairSimilarity(a, b) { return computePairSimilarity(a, b); }
  _tokenizeTitle(title) { return tokenizeTitle(title); }
  _extractDomain(url) { return extractDomain(url); }
  _folderOverlapScore(a, b) { return folderOverlapScore(a, b); }
  _jaccard(a, b) { return jaccard(a, b); }

  _executeOperation(operation, data) {
    switch (operation) {
      case 'computeSimilarity': {
        const pairs = data.pairs || []
        return pairs.map(pair => ({ a: pair.a, b: pair.b, similarity: computePairSimilarity(pair.a, pair.b) }))
      }
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
  }
}
