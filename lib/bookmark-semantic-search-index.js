/**
 * BookmarkSemanticSearch — 索引管理子模块
 *
 * R302 新增: IVF 近似最近邻索引 + IndexedDB 持久化
 *
 * 从 bookmark-semantic-search.js 拆分，负责:
 *   - buildIvfIndex — IVF 聚类索引构建
 *   - persistToIndexedDB / loadFromIndexedDB — 索引持久化
 *   - serializeIndex / deserializeIndex — 索引序列化
 *
 * @module lib/bookmark-semantic-search-index
 */

/** IVF 索引默认配置 */
export const IVF_DEFAULTS = Object.freeze({
  threshold: 1000,   // 书签数超过此值启用 IVF
  nClusters: 16,     // IVF 聚类数
  nprobe: 3,         // 搜索时探测的分区数
})

/**
 * 索引管理操作类 — 通过 mixin 模式混入 BookmarkSemanticSearch 实例上下文
 */
export class IndexOperations {
  /**
   * 构建 IVF (Inverted File Index) 近似最近邻索引
   *
   * 当书签数 > ivfThreshold 时自动调用。
   * 使用随机初始化 + 单轮分配对向量空间分区，
   * 搜索时仅在 top-nprobe 个最近分区中精确查找。
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {number} [nClusters] — 聚类数，默认使用构造函数配置
   */
  static buildIvfIndex(ctx, nClusters) {
    const k = nClusters || ctx._ivfClusters
    const ids = [...ctx._documentVectors.keys()]

    if (ids.length < k) {
      ctx._ivfIndex = null
      return
    }

    // 随机初始化质心（从现有向量中随机选取）
    const centroids = []
    const shuffled = [...ids].sort(() => Math.random() - 0.5)
    for (let i = 0; i < k; i++) {
      const vec = ctx._documentVectors.get(shuffled[i])
      centroids.push(new Map(vec))
    }

    // 分配每个向量到最近质心
    const clusters = Array.from({ length: k }, () => [])
    for (const id of ids) {
      const docVec = ctx._documentVectors.get(id)
      let bestCluster = 0
      let bestSim = -Infinity

      for (let c = 0; c < centroids.length; c++) {
        const sim = ctx._embeddingEngine.cosineSimilarity(docVec, centroids[c])
        if (sim > bestSim) {
          bestSim = sim
          bestCluster = c
        }
      }
      clusters[bestCluster].push(id)
    }

    // 移除空聚类
    const nonEmptyClusters = []
    const nonEmptyCentroids = []
    for (let c = 0; c < clusters.length; c++) {
      if (clusters[c].length > 0) {
        nonEmptyClusters.push(clusters[c])
        nonEmptyCentroids.push(centroids[c])
      }
    }

    ctx._ivfIndex = {
      centroids: nonEmptyCentroids,
      clusters: nonEmptyClusters,
      nprobe: ctx._ivfNprobe,
    }
  }

  /**
   * 将索引序列化为可持久化的纯对象
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @returns {Object} 可序列化的索引快照
   */
  static serializeIndex(ctx) {
    const bookmarks = []
    for (const [id, bm] of ctx._bookmarkStore) {
      bookmarks.push([id, bm])
    }

    const vectors = []
    for (const [id, vec] of ctx._documentVectors) {
      vectors.push([id, [...vec.entries()]])
    }

    const vocab = [...ctx._vocabulary.entries()]

    return {
      version: 2,
      timestamp: Date.now(),
      bookmarks,
      vectors,
      vocabulary: vocab,
      documentCount: ctx._documentCount,
    }
  }

  /**
   * 从序列化数据恢复索引
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {Object} data — serializeIndex() 的输出
   */
  static deserializeIndex(ctx, data) {
    if (!data || typeof data !== 'object') return

    ctx._bookmarkStore.clear()
    ctx._documentVectors.clear()
    ctx._vocabulary = new Map()
    ctx._documentCount = data.documentCount || 0
    ctx._searchCache.clear()

    if (data.bookmarks) {
      for (const [id, bm] of data.bookmarks) {
        ctx._bookmarkStore.set(id, bm)
      }
    }

    if (data.vectors) {
      for (const [id, entries] of data.vectors) {
        ctx._documentVectors.set(id, new Map(entries))
      }
    }

    if (data.vocabulary) {
      ctx._vocabulary = new Map(data.vocabulary)
    }

    // 同步到嵌入引擎
    ctx._embeddingEngine._vocabulary = new Map(ctx._vocabulary)
    ctx._embeddingEngine._docCount = ctx._documentCount
    ctx._embeddingEngine._vectorCache.clear()

    // 大书签库自动构建 IVF
    if (ctx._documentVectors.size > ctx._ivfThreshold) {
      IndexOperations.buildIvfIndex(ctx)
    }
  }

  /**
   * 持久化索引到 IndexedDB
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {string} [dbName] — 数据库名
   * @param {string} [storeName] — 对象存储名
   * @returns {Promise<void>}
   */
  static async persistToIndexedDB(ctx, dbName = 'pagewise-semantic-index', storeName = 'index') {
    const snapshot = IndexOperations.serializeIndex(ctx)
    await IndexOperations._idbPut(dbName, storeName, 'current', snapshot)
  }

  /**
   * 从 IndexedDB 加载索引
   *
   * @param {Object} ctx — BookmarkSemanticSearch 实例上下文
   * @param {string} [dbName] — 数据库名
   * @param {string} [storeName] — 对象存储名
   * @returns {Promise<boolean>} 是否成功加载
   */
  static async loadFromIndexedDB(ctx, dbName = 'pagewise-semantic-index', storeName = 'index') {
    const snapshot = await IndexOperations._idbGet(dbName, storeName, 'current')
    if (!snapshot) return false

    IndexOperations.deserializeIndex(ctx, snapshot)
    return true
  }

  /**
   * 清除 IndexedDB 中的索引
   *
   * @param {string} [dbName] — 数据库名
   * @returns {Promise<void>}
   */
  static async clearIndexedDB(dbName = 'pagewise-semantic-index') {
    if (typeof globalThis.indexedDB !== 'undefined') {
      return new Promise((resolve, reject) => {
        const req = globalThis.indexedDB.deleteDatabase(dbName)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    }
  }

  // ==================== IndexedDB 底层操作（可注入） ====================

  /** @type {Function|null} 可注入的 IDB put 实现（测试用） */
  static _idbPutImpl = null
  /** @type {Function|null} 可注入的 IDB get 实现（测试用） */
  static _idbGetImpl = null

  /** @private */
  static async _idbPut(dbName, storeName, key, value) {
    if (IndexOperations._idbPutImpl) {
      return IndexOperations._idbPutImpl(dbName, storeName, key, value)
    }
    if (typeof globalThis.indexedDB === 'undefined') return

    return new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName)
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        store.put(value, key)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      req.onerror = () => reject(req.error)
    })
  }

  /** @private */
  static async _idbGet(dbName, storeName, key) {
    if (IndexOperations._idbGetImpl) {
      return IndexOperations._idbGetImpl(dbName, storeName, key)
    }
    if (typeof globalThis.indexedDB === 'undefined') return null

    return new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName)
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const getReq = store.get(key)
        getReq.onsuccess = () => { db.close(); resolve(getReq.result || null) }
        getReq.onerror = () => { db.close(); reject(getReq.error) }
      }
      req.onerror = () => reject(req.error)
    })
  }
}
