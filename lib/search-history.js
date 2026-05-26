/**
 * SearchHistory — 搜索历史与 AI 高亮持久化模块
 *
 * 基于 IndexedDB 持久化搜索历史记录和 AI 问答高亮：
 *   - recordSearch(query, resultCount, sourceTab)  — 保存搜索记录
 *   - getSearchHistory(limit, sortBy)              — 获取历史记录
 *   - getSearchSuggestions(partial, limit)          — 输入前 2 字符自动匹配 Top-5
 *   - saveAIHighlight(data)                        — 存储 AI 问答高亮
 *   - getAIHighlightsByPageUrl(pageUrl)            — 按页面获取高亮
 *   - exportSearchHistory(format)                  — JSON/Markdown 导出
 *   - clearSearchHistory()                         — 清除全部历史
 *   - isHistoryEnabled() / setHistoryEnabled(v)    — 隐私控制
 *   - getRecentSearches(limit)                     — 最近 N 条快捷标签
 *
 * 设计约束:
 * - 纯 ES Module，IndexedDB 持久化
 * - 搜索历史最多保留 200 条，按 LRU 淘汰
 * - 去重：归一化后的相同 query 累加 count 并更新 timestamp
 * - 隐私：支持关闭/清除历史记录
 */

// ==================== 常量 ====================

const DB_NAME = 'PageWiseSearchHistory'
const DB_VERSION = 1
const SEARCH_STORE = 'searches'
const HIGHLIGHT_STORE = 'aiHighlights'
const MAX_HISTORY = 200
const PRIVACY_KEY = 'pagewise_search_history_enabled'

// ==================== 内部状态 ====================

/** @type {boolean|null} 缓存隐私开关状态 */
let _enabledCache = null

/**
 * 重置内部缓存（仅供测试使用）
 */
export function _resetCacheForTest() {
  _enabledCache = null
}

// ==================== IndexedDB 操作 ====================

/**
 * 打开数据库连接
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // 搜索历史 store
      if (!db.objectStoreNames.contains(SEARCH_STORE)) {
        const store = db.createObjectStore(SEARCH_STORE, {
          keyPath: 'id',
          autoIncrement: true
        })
        store.createIndex('query', 'query', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // AI 高亮 store
      if (!db.objectStoreNames.contains(HIGHLIGHT_STORE)) {
        const store = db.createObjectStore(HIGHLIGHT_STORE, {
          keyPath: 'id',
          autoIncrement: true
        })
        store.createIndex('pageUrl', 'pageUrl', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = (event) => {
      resolve(event.target.result)
    }

    request.onerror = (event) => {
      reject(new Error(`IndexedDB error: ${event.target.error}`))
    }
  })
}

/**
 * 归一化搜索关键词
 * @param {string} query
 * @returns {string}
 */
function normalizeQuery(query) {
  if (typeof query !== 'string') return ''
  return query.trim().replace(/\s{2,}/g, ' ').toLowerCase()
}

// ==================== 隐私控制 ====================

/**
 * 读取 chrome.storage.local 中的隐私开关
 * @returns {Promise<boolean>}
 */
async function _getEnabledFromStorage() {
  try {
    return new Promise((resolve) => {
      chrome.storage.local.get(PRIVACY_KEY, (result) => {
        // 默认启用
        resolve(result[PRIVACY_KEY] !== false)
      })
    })
  } catch {
    return true
  }
}

/**
 * 搜索历史是否启用
 * @returns {Promise<boolean>}
 */
export async function isHistoryEnabled() {
  if (_enabledCache !== null) return _enabledCache
  _enabledCache = await _getEnabledFromStorage()
  return _enabledCache
}

/**
 * 设置搜索历史开关
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function setHistoryEnabled(enabled) {
  _enabledCache = !!enabled
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [PRIVACY_KEY]: !!enabled }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve()
        }
      })
    })
  } catch {
    // 无 chrome API 时静默处理
  }
}

// ==================== 搜索历史 ====================

/**
 * 保存搜索记录
 * - 如果归一化后相同的 query 已存在，累加 count 并更新 timestamp
 * - 超过 MAX_HISTORY 时淘汰最旧记录
 *
 * @param {string} query - 搜索关键词
 * @param {number} [resultCount=0] - 搜索结果数量
 * @param {string} [sourceTab=''] - 来源标签页标识
 * @returns {Promise<Object|null>} 保存的记录或 null
 */
export async function recordSearch(query, resultCount = 0, sourceTab = '') {
  if (!await isHistoryEnabled()) return null
  const normalized = normalizeQuery(query)
  if (!normalized) return null

  const db = await openDB()
  const tx = db.transaction(SEARCH_STORE, 'readwrite')
  const store = tx.objectStore(SEARCH_STORE)

  return new Promise((resolve, reject) => {
    const getAllReq = store.getAll()

    getAllReq.onsuccess = () => {
      const all = getAllReq.result || []
      const now = new Date().toISOString()

      // 查找已有记录（归一化去重）
      const existing = all.find(r => normalizeQuery(r.query) === normalized)

      if (existing) {
        // 更新已有记录
        existing.query = normalized
        existing.timestamp = now
        existing.count = (existing.count || 1) + 1
        existing.resultCount = resultCount || existing.resultCount || 0
        existing.sourceTab = sourceTab || existing.sourceTab || ''
        const putReq = store.put(existing)
        putReq.onsuccess = () => resolve(existing)
        putReq.onerror = () => reject(new Error('更新搜索记录失败'))
        return
      }

      // 新建记录
      const record = {
        query: normalized,
        timestamp: now,
        resultCount: resultCount || 0,
        sourceTab: sourceTab || '',
        count: 1
      }

      const addReq = store.add(record)
      addReq.onsuccess = () => {
        record.id = addReq.result
        // 超限淘汰
        if (all.length >= MAX_HISTORY) {
          // 按 timestamp 排序，淘汰最旧的
          const sorted = [...all].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          const toDelete = sorted.slice(0, all.length - MAX_HISTORY + 1)
          let deleted = 0
          for (const item of toDelete) {
            const delReq = store.delete(item.id)
            delReq.onsuccess = () => {
              deleted++
              if (deleted === toDelete.length) resolve(record)
            }
            delReq.onerror = () => {
              deleted++
              if (deleted === toDelete.length) resolve(record)
            }
          }
        } else {
          resolve(record)
        }
      }
      addReq.onerror = () => reject(new Error('保存搜索记录失败'))
    }

    getAllReq.onerror = () => reject(new Error('查询搜索历史失败'))
  })
}

/**
 * 获取搜索历史
 * @param {number} [limit=200] - 返回数量上限
 * @param {string} [sortBy='time'] - 排序方式 'time' | 'frequency'
 * @returns {Promise<Array>} 记录数组
 */
export async function getSearchHistory(limit = 200, sortBy = 'time') {
  const db = await openDB()
  const tx = db.transaction(SEARCH_STORE, 'readonly')
  const store = tx.objectStore(SEARCH_STORE)

  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      let results = request.result || []
      const n = Math.max(0, Math.floor(Number(limit) || 0))

      if (sortBy === 'frequency') {
        results.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return new Date(b.timestamp) - new Date(a.timestamp)
        })
      } else {
        // 默认按时间倒序
        results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      }

      resolve(n > 0 ? results.slice(0, n) : results)
    }

    request.onerror = () => reject(new Error('获取搜索历史失败'))
  })
}

/**
 * 获取最近 N 条搜索记录（用于快捷标签）
 * @param {number} [limit=5]
 * @returns {Promise<Array>}
 */
export async function getRecentSearches(limit = 5) {
  return getSearchHistory(limit, 'time')
}

/**
 * 搜索建议：输入前 2 字符自动匹配历史记录 Top-5
 * 按最近使用频率加权排序
 *
 * 权重公式: score = count * 0.6 + recencyScore * 0.4
 * recencyScore 基于距今天数的衰减分
 *
 * @param {string} partial - 输入前缀
 * @param {number} [limit=5] - 返回数量上限
 * @returns {Promise<string[]>} 匹配的查询字符串列表
 */
export async function getSearchSuggestions(partial, limit = 5) {
  if (typeof partial !== 'string') return []
  const prefix = normalizeQuery(partial)
  if (!prefix || prefix.length < 2) return []

  const db = await openDB()
  const tx = db.transaction(SEARCH_STORE, 'readonly')
  const store = tx.objectStore(SEARCH_STORE)

  return new Promise((resolve, reject) => {
    const request = store.getAll()

    request.onsuccess = () => {
      const all = request.result || []
      const now = Date.now()
      const n = Math.max(1, Math.floor(Number(limit) || 5))

      // 前缀匹配
      const matches = all.filter(r => normalizeQuery(r.query).startsWith(prefix))

      // 加权排序
      const scored = matches.map(r => {
        const count = r.count || 1
        const ageMs = now - new Date(r.timestamp).getTime()
        const ageDays = ageMs / (1000 * 60 * 60 * 24)
        // recencyScore: 1.0 (今天) → 0.0 (30+ 天前)
        const recencyScore = Math.max(0, 1 - ageDays / 30)
        const score = count * 0.6 + recencyScore * 0.4
        return { query: r.query, score }
      })

      // 按 score 降序，去重
      scored.sort((a, b) => b.score - a.score)
      const seen = new Set()
      const suggestions = []
      for (const item of scored) {
        if (!seen.has(item.query)) {
          seen.add(item.query)
          suggestions.push(item.query)
          if (suggestions.length >= n) break
        }
      }

      resolve(suggestions)
    }

    request.onerror = () => reject(new Error('获取搜索建议失败'))
  })
}

/**
 * 删除指定搜索记录
 * @param {number} id - 记录 ID
 * @returns {Promise<boolean>}
 */
export async function deleteSearchRecord(id) {
  const db = await openDB()
  const tx = db.transaction(SEARCH_STORE, 'readwrite')
  const store = tx.objectStore(SEARCH_STORE)

  return new Promise((resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(new Error('删除搜索记录失败'))
  })
}

/**
 * 清除全部搜索历史
 * @returns {Promise<boolean>}
 */
export async function clearSearchHistory() {
  const db = await openDB()
  const tx = db.transaction(SEARCH_STORE, 'readwrite')
  const store = tx.objectStore(SEARCH_STORE)

  return new Promise((resolve, reject) => {
    const request = store.clear()
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(new Error('清除搜索历史失败'))
  })
}

// ==================== AI 问答高亮 ====================

/**
 * 存储 AI 问答高亮
 * @param {{ bookmarkId?: string, pageUrl: string, selectedText: string, aiAnswer: string }} data
 * @returns {Promise<Object>} 保存的高亮记录
 */
export async function saveAIHighlight(data) {
  const { bookmarkId = '', pageUrl, selectedText, aiAnswer } = data
  if (!pageUrl || !selectedText || !aiAnswer) {
    throw new Error('pageUrl, selectedText and aiAnswer are required')
  }

  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const record = {
      bookmarkId,
      pageUrl,
      selectedText,
      aiAnswer,
      createdAt: new Date().toISOString()
    }

    const addReq = store.add(record)
    addReq.onsuccess = () => {
      record.id = addReq.result
      resolve(record)
    }
    addReq.onerror = () => reject(new Error('保存 AI 高亮失败'))
  })
}

/**
 * 按页面 URL 获取 AI 高亮列表
 * @param {string} pageUrl
 * @returns {Promise<Array>}
 */
export async function getAIHighlightsByPageUrl(pageUrl) {
  if (!pageUrl) return []

  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readonly')
  const store = tx.objectStore(HIGHLIGHT_STORE)
  const index = store.index('pageUrl')

  return new Promise((resolve, reject) => {
    const request = index.getAll(pageUrl)
    request.onsuccess = () => {
      const results = (request.result || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
      resolve(results)
    }
    request.onerror = () => reject(new Error('获取 AI 高亮失败'))
  })
}

/**
 * 获取全部 AI 高亮
 * @returns {Promise<Array>}
 */
export async function getAllAIHighlights() {
  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readonly')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const results = (request.result || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
      resolve(results)
    }
    request.onerror = () => reject(new Error('获取全部 AI 高亮失败'))
  })
}

/**
 * 删除指定 AI 高亮
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteAIHighlight(id) {
  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(new Error('删除 AI 高亮失败'))
  })
}

/**
 * 清除全部 AI 高亮
 * @returns {Promise<boolean>}
 */
export async function clearAllAIHighlights() {
  const db = await openDB()
  const tx = db.transaction(HIGHLIGHT_STORE, 'readwrite')
  const store = tx.objectStore(HIGHLIGHT_STORE)

  return new Promise((resolve, reject) => {
    const request = store.clear()
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(new Error('清除 AI 高亮失败'))
  })
}

// ==================== 搜索历史导出 ====================

/**
 * 导出搜索历史为 JSON 格式
 * @returns {Promise<string>}
 */
export async function exportSearchHistoryJSON() {
  const records = await getSearchHistory(MAX_HISTORY, 'time')
  return JSON.stringify({
    type: 'PageWiseSearchHistory',
    exportTime: new Date().toISOString(),
    totalRecords: records.length,
    records: records.map(r => ({
      query: r.query,
      timestamp: r.timestamp,
      count: r.count,
      resultCount: r.resultCount,
      sourceTab: r.sourceTab
    }))
  }, null, 2)
}

/**
 * 导出搜索历史为 Markdown 格式
 * 风格与 R318 KnowledgeExport 一致
 * @returns {Promise<string>}
 */
export async function exportSearchHistoryMarkdown() {
  const records = await getSearchHistory(MAX_HISTORY, 'time')
  let md = '# 搜索历史导出\n\n'
  md += `导出时间：${new Date().toLocaleString('zh-CN')}\n`
  md += `总记录数：${records.length}\n\n---\n\n`

  if (records.length === 0) {
    md += '> 暂无搜索记录\n'
    return md
  }

  // 按日期分组
  const groups = {}
  for (const r of records) {
    const dateKey = new Date(r.timestamp).toLocaleDateString('zh-CN')
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(r)
  }

  for (const [date, entries] of Object.entries(groups)) {
    md += `## ${date}\n\n`
    md += '| 时间 | 搜索词 | 结果数 | 使用次数 |\n'
    md += '|------|--------|--------|----------|\n'
    for (const r of entries) {
      const time = new Date(r.timestamp).toLocaleTimeString('zh-CN')
      md += `| ${time} | ${r.query} | ${r.resultCount || 0} | ${r.count || 1} |\n`
    }
    md += '\n'
  }

  return md
}

/**
 * 统一导出接口
 * @param {'json'|'markdown'} format
 * @returns {Promise<string>}
 */
export async function exportSearchHistory(format = 'json') {
  if (format === 'markdown') return exportSearchHistoryMarkdown()
  return exportSearchHistoryJSON()
}
