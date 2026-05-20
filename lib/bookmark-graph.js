/**
 * BookmarkGraphEngine — 书签图谱引擎
 *
 * 从书签数组构建相似度图谱，支持:
 *   - 混合相似度算法 (Jaccard + 域名匹配 + 文件夹重叠)
 *   - Top-K 相似书签推荐
 *   - 按域名/文件夹的聚类
 *   - 优化: 使用倒排索引避免 O(n²) 全量计算
 *
 * 性能: 1000 书签图谱构建 < 10 秒
 *
 * 子模块:
 *   - bookmark-graph-helpers.js — 相似度计算与工具方法
 *   - bookmark-visualizer.js — 可视化
 *   - bookmark-detail-panel.js — 详情面板
 *
 * @module bookmark-graph
 *
 * R120 拆分: BookmarkVisualizer → bookmark-visualizer.js
 *           BookmarkDetailPanel → bookmark-detail-panel.js
 */

// 向后兼容 re-exports
export { BookmarkVisualizer } from './bookmark-visualizer.js'
export { BookmarkDetailPanel } from './bookmark-detail-panel.js'

import {
  computeSimilarity,
  tokenizeTitle,
  extractDomain,
  getFolderKey,
  assignGroup,
} from './bookmark-graph-helpers.js'

/**
 * @typedef {Object} NormalizedBookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} folderPath
 */

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} group
 * @property {number} size
 * @property {Object} data
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} source
 * @property {string} target
 * @property {number} weight
 */

/**
 * @typedef {Object} GraphData
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 */

export class BookmarkGraphEngine {
  constructor() {
    /** @type {Map<string, NormalizedBookmark>} */
    this._bookmarkStore = new Map()
    /** @type {Map<string, Set<string>>} */
    this._tokenIndex = new Map()
    /** @type {Map<string, Set<string>>} */
    this._domainIndex = new Map()
    /** @type {Map<string, Set<string>>} */
    this._folderIndex = new Map()
    /** @type {Map<string, Set<string>>} */
    this._adjacency = new Map()
    /** @type {GraphData} */
    this._graph = { nodes: [], edges: [] }
    /** @type {number} */
    this._threshold = 0.1
  }

  // ==================== 核心 API ====================

  /**
   * 从书签数组构建图谱
   * @param {NormalizedBookmark[]} bookmarks
   * @returns {GraphData}
   */
  buildGraph(bookmarks) {
    this._bookmarkStore.clear()
    this._tokenIndex.clear()
    this._domainIndex.clear()
    this._folderIndex.clear()
    this._adjacency.clear()
    this._graph = { nodes: [], edges: [] }

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return this._graph
    }

    for (const bm of bookmarks) {
      if (!bm || !bm.id) continue
      const id = String(bm.id)
      this._bookmarkStore.set(id, bm)
      this._adjacency.set(id, new Set())

      const tokens = tokenizeTitle(bm.title || '')
      for (const token of tokens) {
        let entry = this._tokenIndex.get(token)
        if (!entry) {
          entry = new Set()
          this._tokenIndex.set(token, entry)
        }
        entry.add(id)
      }

      const domain = extractDomain(bm.url || '')
      if (domain) {
        let dEntry = this._domainIndex.get(domain)
        if (!dEntry) {
          dEntry = new Set()
          this._domainIndex.set(domain, dEntry)
        }
        dEntry.add(id)
      }

      const folderKey = getFolderKey(bm.folderPath)
      if (folderKey) {
        let fEntry = this._folderIndex.get(folderKey)
        if (!fEntry) {
          fEntry = new Set()
          this._folderIndex.set(folderKey, fEntry)
        }
        fEntry.add(id)
      }
    }

    const edgeMap = new Map()
    const allIds = [...this._bookmarkStore.keys()]

    for (const [, idSet] of this._tokenIndex) {
      const ids = [...idSet]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap)
        }
      }
    }

    for (const [, idSet] of this._domainIndex) {
      const ids = [...idSet]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap)
        }
      }
    }

    for (const [, idSet] of this._folderIndex) {
      const ids = [...idSet]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          this._maybeAddEdge(ids[i], ids[j], edgeMap)
        }
      }
    }

    const edges = []
    for (const [key, weight] of edgeMap) {
      if (weight < this._threshold) continue
      const [source, target] = key.split('\x00')
      edges.push({ source, target, weight })
      this._adjacency.get(source)?.add(target)
      this._adjacency.get(target)?.add(source)
    }

    const nodes = allIds.map(id => {
      const bm = this._bookmarkStore.get(id)
      const connCount = this._adjacency.get(id)?.size || 0
      return {
        id,
        label: bm.title || bm.url || id,
        group: assignGroup(bm),
        size: 1 + Math.min(connCount, 20),
        data: bm,
      }
    })

    this._graph = { nodes, edges }
    return this._graph
  }

  /**
   * 计算两个书签的相似度 (0-1)
   */
  similarity(a, b) {
    return computeSimilarity(this._bookmarkStore, a, b)
  }

  /**
   * 获取 Top-K 相似书签
   * @param {string} bookmarkId
   * @param {number} [topK=5]
   * @returns {Array<{ id: string, score: number, bookmark: Object }>}
   */
  getSimilar(bookmarkId, topK = 5) {
    const id = String(bookmarkId)
    const bm = this._bookmarkStore.get(id)
    if (!bm) return []

    const neighbors = this._adjacency.get(id)
    const scored = []

    if (neighbors && neighbors.size > 0) {
      for (const nId of neighbors) {
        const score = this.similarity(id, nId)
        scored.push({
          id: nId,
          score,
          bookmark: this._bookmarkStore.get(nId),
        })
      }
    } else {
      for (const [otherId] of this._bookmarkStore) {
        if (otherId === id) continue
        const score = this.similarity(id, otherId)
        if (score > 0) {
          scored.push({
            id: otherId,
            score,
            bookmark: this._bookmarkStore.get(otherId),
          })
        }
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  /**
   * 返回当前图谱数据
   * @returns {GraphData}
   */
  getGraphData() {
    return {
      nodes: [...this._graph.nodes],
      edges: [...this._graph.edges],
    }
  }

  /**
   * 返回按域名/文件夹的聚类
   */
  getClusters() {
    const byDomain = new Map()
    const byFolder = new Map()

    for (const [id, bm] of this._bookmarkStore) {
      const domain = extractDomain(bm.url || '')
      if (domain) {
        if (!byDomain.has(domain)) byDomain.set(domain, [])
        byDomain.get(domain).push({ id, title: bm.title, url: bm.url })
      }

      const folderKey = getFolderKey(bm.folderPath)
      if (folderKey) {
        if (!byFolder.has(folderKey)) byFolder.set(folderKey, [])
        byFolder.get(folderKey).push({ id, title: bm.title, url: bm.url })
      }
    }

    return { byDomain, byFolder }
  }

  // ==================== 内部方法 ====================

  _maybeAddEdge(id1, id2, edgeMap) {
    const key = id1 < id2 ? `${id1}\x00${id2}` : `${id2}\x00${id1}`
    if (edgeMap.has(key)) return
    const score = this.similarity(id1, id2)
    edgeMap.set(key, score)
  }
}
