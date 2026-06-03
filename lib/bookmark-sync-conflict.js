/**
 * BookmarkSync — 冲突解决与数据分片子模块
 *
 * 从 bookmark-sync.js 拆分，负责:
 *   - resolveConflict — 冲突解决策略
 *   - mergeBookmarks — 书签合并
 *   - splitBookmarks — 数据分片
 *   - classifyError — 错误分类
 *
 * @module lib/bookmark-sync-conflict
 */

// ==================== Constants ====================

/** 冲突解决策略：本地优先 */
export const CONFLICT_STRATEGY_LOCAL = 'local_wins'

/** 冲突解决策略：远程优先 */
export const CONFLICT_STRATEGY_REMOTE = 'remote_wins'

/** 冲突解决策略：合并 */
export const CONFLICT_STRATEGY_MERGE = 'merge'

// ==================== Conflict Resolution ====================

/**
 * 解决本地与远程书签的冲突
 *
 * @param {Array} local — 本地书签数组
 * @param {Array} remote — 远程书签数组
 * @param {string} [strategy=CONFLICT_STRATEGY_MERGE] — 解决策略
 * @returns {{ success: boolean, bookmarks: Array|null, strategy: string, added: number, removed: number, updated: number, errors: string[] }}
 */
export function resolveConflict(local, remote, strategy = CONFLICT_STRATEGY_MERGE) {
  const _errors = []

  if (!Array.isArray(local)) {
    return { success: false, bookmarks: null, strategy, added: 0, removed: 0, updated: 0, errors: ['local 必须是数组'] }
  }

  if (!Array.isArray(remote)) {
    return { success: false, bookmarks: null, strategy, added: 0, removed: 0, updated: 0, errors: ['remote 必须是数组'] }
  }

  if (![CONFLICT_STRATEGY_LOCAL, CONFLICT_STRATEGY_REMOTE, CONFLICT_STRATEGY_MERGE].includes(strategy)) {
    return { success: false, bookmarks: null, strategy, added: 0, removed: 0, updated: 0, errors: [`不支持的冲突策略: ${strategy}`] }
  }

  const localCopy = JSON.parse(JSON.stringify(local))
  const remoteCopy = JSON.parse(JSON.stringify(remote))

  if (strategy === CONFLICT_STRATEGY_LOCAL) {
    return { success: true, bookmarks: localCopy, strategy, added: 0, removed: 0, updated: 0, errors: [] }
  }

  if (strategy === CONFLICT_STRATEGY_REMOTE) {
    return { success: true, bookmarks: remoteCopy, strategy, added: 0, removed: 0, updated: 0, errors: [] }
  }

  return mergeBookmarks(localCopy, remoteCopy, strategy)
}

/**
 * 合并本地和远程书签
 *
 * @param {Array} local — 本地书签（深拷贝后）
 * @param {Array} remote — 远程书签（深拷贝后）
 * @param {string} strategy — 策略标识
 * @returns {{ success: boolean, bookmarks: Array, strategy: string, added: number, removed: number, updated: number, errors: string[] }}
 */
function mergeBookmarks(local, remote, strategy) {
  const localMap = new Map()
  for (const bm of local) {
    if (bm && bm.id !== undefined) {
      localMap.set(String(bm.id), bm)
    }
  }

  const remoteMap = new Map()
  for (const bm of remote) {
    if (bm && bm.id !== undefined) {
      remoteMap.set(String(bm.id), bm)
    }
  }

  const merged = []
  let added = 0
  let removed = 0
  let updated = 0

  const processedIds = new Set()

  for (const [id, localBm] of localMap) {
    processedIds.add(id)
    const remoteBm = remoteMap.get(id)

    if (remoteBm) {
      const localTime = localBm.updatedAt || localBm.createdAt || ''
      const remoteTime = remoteBm.updatedAt || remoteBm.createdAt || ''

      if (remoteTime > localTime) {
        merged.push(remoteBm)
        updated++
      } else {
        merged.push(localBm)
        if (remoteTime && localTime && remoteTime !== localTime) {
          updated++
        }
      }
    } else {
      merged.push(localBm)
    }
  }

  for (const [id, remoteBm] of remoteMap) {
    if (!processedIds.has(id)) {
      merged.push(remoteBm)
      added++
    }
  }

  return { success: true, bookmarks: merged, strategy, added, removed, updated, errors: [] }
}

// ==================== Helpers ====================

/**
 * 将书签数组分割为适合配额限制的多个分片
 *
 * @param {Array} bookmarks — 书签数组
 * @param {number} maxBytes — 每个分片最大字节数
 * @returns {Array<Array>} 分片后的书签数组
 */
export function splitBookmarks(bookmarks, maxBytes) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) return []
  if (typeof maxBytes !== 'number' || maxBytes <= 0) return []

  const chunks = []
  let currentChunk = []
  let currentSize = 0

  for (const bm of bookmarks) {
    const bmSize = estimateBytes(bm)
    if (bmSize > maxBytes) continue

    if (currentSize + bmSize > maxBytes && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = []
      currentSize = 0
    }

    currentChunk.push(bm)
    currentSize += bmSize
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * 估算数据的字节大小
 *
 * @param {*} data — 待估算数据
 * @returns {number} 字节数
 */
function estimateBytes(data) {
  if (data === null || data === undefined) return 0
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length
  } catch (e) {
    console.warn('[SyncConflict]', e?.message || e);
    return Infinity
  }
}

/**
 * 分类错误类型
 *
 * @param {Error} err — 错误对象
 * @returns {{ status: string, message: string }}
 */
export function classifyError(err) {
  const msg = err.message || String(err)

  if (msg.includes('QUOTA_BYTES') || msg.includes('quota') || msg.includes('QuotaExceededError')) {
    return { status: 'quota_exceeded', message: `同步配额超限: ${msg}` }
  }

  if (msg.includes('network') || msg.includes('Network') || msg.includes('fetch') || msg.includes('offline')) {
    return { status: 'network_error', message: `网络错误: ${msg}` }
  }

  return { status: 'error', message: `同步错误: ${msg}` }
}
