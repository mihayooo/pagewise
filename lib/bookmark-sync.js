/**
 * BookmarkSync — 数据同步模块
 *
 * 提供基于 Chrome Sync API 的书签跨设备同步功能。
 *
 * 冲突解决/数据分片/错误分类已拆分至 bookmark-sync-conflict.js
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API（通过 storage 注入适配）
 * - 无构建工具，const/let 优先，禁止 var，无分号风格
 * - 所有函数为纯函数（除了 initSync 依赖注入的 storage）
 */

import {
  CONFLICT_STRATEGY_LOCAL as _CSL,
  CONFLICT_STRATEGY_REMOTE as _CSR,
  CONFLICT_STRATEGY_MERGE as _CSM,
  resolveConflict as _resolveConflict,
  splitBookmarks as _splitBookmarks,
  classifyError as _classifyError,
} from './bookmark-sync-conflict.js'

// ==================== Sync Status Constants ====================

/** 同步状态：空闲 */
export const SYNC_STATUS_IDLE = 'idle'

/** 同步状态：同步中 */
export const SYNC_STATUS_SYNCING = 'syncing'

/** 同步状态：成功 */
export const SYNC_STATUS_SUCCESS = 'success'

/** 同步状态：失败 */
export const SYNC_STATUS_ERROR = 'error'

/** 同步状态：配额超限 */
export const SYNC_STATUS_QUOTA_EXCEEDED = 'quota_exceeded'

/** 同步状态：网络错误 */
export const SYNC_STATUS_NETWORK_ERROR = 'network_error'

/** 同步状态：冲突 */
export const SYNC_STATUS_CONFLICT = 'conflict'

/** 同步数据 key */
export const SYNC_KEY = 'pagewise-sync-data'

/** 同步时间 key */
export const SYNC_TIME_KEY = 'pagewise-sync-time'

/** 同步格式版本 */
export const SYNC_FORMAT_VERSION = '1.0'

/** Chrome Sync 每项配额上限 (bytes) */
export const SYNC_ITEM_MAX_BYTES = 8192

/** Chrome Sync 总配额上限 (bytes) */
export const SYNC_TOTAL_MAX_BYTES = 102400

// ==================== 向后兼容 re-export ====================

export const CONFLICT_STRATEGY_LOCAL = _CSL
export const CONFLICT_STRATEGY_REMOTE = _CSR
export const CONFLICT_STRATEGY_MERGE = _CSM
export const resolveConflict = _resolveConflict
export const splitBookmarks = _splitBookmarks

// ==================== Internal State ====================

let _storage = null
let _currentStatus = SYNC_STATUS_IDLE
let _lastSyncTime = null
let _lastError = null

// ==================== Sync Engine ====================

/**
 * 初始化同步引擎
 */
export function initSync(storage) {
  const errors = []

  if (!storage) {
    return { success: false, status: SYNC_STATUS_ERROR, errors: ['存储对象不能为空'] }
  }

  if (typeof storage.get !== 'function') {
    errors.push('存储对象缺少 get 方法')
  }
  if (typeof storage.set !== 'function') {
    errors.push('存储对象缺少 set 方法')
  }
  if (typeof storage.remove !== 'function') {
    errors.push('存储对象缺少 remove 方法')
  }

  if (errors.length > 0) {
    return { success: false, status: SYNC_STATUS_ERROR, errors }
  }

  _storage = storage
  _currentStatus = SYNC_STATUS_IDLE
  _lastError = null

  return { success: true, status: SYNC_STATUS_IDLE, errors: [] }
}

/**
 * 获取当前同步状态
 */
export function getSyncStatus() {
  return _currentStatus
}

/**
 * 获取最后一次错误信息
 */
export function getLastError() {
  return _lastError
}

/**
 * 重置同步引擎内部状态
 */
export function resetSync() {
  _storage = null
  _currentStatus = SYNC_STATUS_IDLE
  _lastSyncTime = null
  _lastError = null
}

// ==================== Sync Operations ====================

/**
 * 估算数据的字节大小
 */
export function estimateBytes(data) {
  if (data === null || data === undefined) return 0
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length
  } catch {
    return Infinity
  }
}

/**
 * 推送书签到 Chrome Sync
 */
export async function syncToCloud(bookmarks) {
  if (!_storage) {
    return { success: false, status: SYNC_STATUS_ERROR, syncedCount: 0, errors: ['同步引擎未初始化，请先调用 initSync'] }
  }

  if (!Array.isArray(bookmarks)) {
    return { success: false, status: SYNC_STATUS_ERROR, syncedCount: 0, errors: ['bookmarks 必须是数组'] }
  }

  _currentStatus = SYNC_STATUS_SYNCING

  const syncData = {
    version: SYNC_FORMAT_VERSION,
    syncedAt: new Date().toISOString(),
    bookmarkCount: bookmarks.length,
    bookmarks: JSON.parse(JSON.stringify(bookmarks)),
  }

  const dataSize = estimateBytes(syncData)
  if (dataSize > SYNC_ITEM_MAX_BYTES) {
    const chunks = _splitBookmarks(syncData.bookmarks, SYNC_ITEM_MAX_BYTES)
    if (chunks.length === 0) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = '无法分割书签数据以适应配额'
      return { success: false, status: SYNC_STATUS_ERROR, syncedCount: 0, errors: [_lastError] }
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunkKey = `${SYNC_KEY}-chunk-${i}`
        await _storage.set(chunkKey, {
          version: SYNC_FORMAT_VERSION,
          chunkIndex: i,
          totalChunks: chunks.length,
          syncedAt: syncData.syncedAt,
          bookmarks: chunks[i],
        })
      }
      await _storage.set(SYNC_TIME_KEY, { time: syncData.syncedAt, chunks: chunks.length })
      await _storage.remove(SYNC_KEY)
    } catch (err) {
      const errMsg = _classifyError(err)
      _currentStatus = errMsg.status
      _lastError = errMsg.message
      return { success: false, status: errMsg.status, syncedCount: 0, errors: [errMsg.message] }
    }
  } else {
    try {
      await _storage.set(SYNC_KEY, syncData)
      await _storage.set(SYNC_TIME_KEY, { time: syncData.syncedAt, chunks: 0 })
      await _cleanupChunks()
    } catch (err) {
      const errMsg = _classifyError(err)
      _currentStatus = errMsg.status
      _lastError = errMsg.message
      return { success: false, status: errMsg.status, syncedCount: 0, errors: [errMsg.message] }
    }
  }

  _lastSyncTime = syncData.syncedAt
  _currentStatus = SYNC_STATUS_SUCCESS
  _lastError = null

  return { success: true, status: SYNC_STATUS_SUCCESS, syncedCount: bookmarks.length, errors: [] }
}

/**
 * 从 Chrome Sync 拉取书签
 */
export async function syncFromCloud() {
  const errors = []
  const warnings = []

  if (!_storage) {
    return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: ['同步引擎未初始化，请先调用 initSync'], warnings }
  }

  _currentStatus = SYNC_STATUS_SYNCING

  try {
    const timeData = await _storage.get(SYNC_TIME_KEY)
    if (timeData && timeData.chunks > 0) {
      return await _readChunkedData(timeData, errors, warnings)
    }

    const syncData = await _storage.get(SYNC_KEY)

    if (syncData === null || syncData === undefined) {
      _currentStatus = SYNC_STATUS_IDLE
      _lastError = null
      return { success: true, status: SYNC_STATUS_IDLE, bookmarks: [], errors: [], warnings: ['云端无同步数据'] }
    }

    if (typeof syncData !== 'object' || Array.isArray(syncData)) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = '云端数据格式无效'
      return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: [_lastError], warnings }
    }

    if (!Array.isArray(syncData.bookmarks)) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = '云端书签数据损坏：bookmarks 不是数组'
      return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: [_lastError], warnings }
    }

    if (syncData.version !== SYNC_FORMAT_VERSION) {
      warnings.push(`云端格式版本 ${syncData.version} 与本地版本 ${SYNC_FORMAT_VERSION} 不匹配`)
    }

    const bookmarks = JSON.parse(JSON.stringify(syncData.bookmarks))
    const validBookmarks = []
    for (let i = 0; i < bookmarks.length; i++) {
      const bm = bookmarks[i]
      if (bm && typeof bm === 'object' && bm.id !== undefined) {
        validBookmarks.push(bm)
      } else {
        warnings.push(`书签索引 ${i} 结构无效，已跳过`)
      }
    }

    _lastSyncTime = timeData ? timeData.time : null
    _currentStatus = SYNC_STATUS_SUCCESS
    _lastError = null

    return { success: true, status: SYNC_STATUS_SUCCESS, bookmarks: validBookmarks, errors: [], warnings }
  } catch (err) {
    const errMsg = _classifyError(err)
    _currentStatus = errMsg.status
    _lastError = errMsg.message
    return { success: false, status: errMsg.status, bookmarks: null, errors: [errMsg.message], warnings }
  }
}

// ==================== Last Sync Time ====================

/**
 * 获取最后同步时间
 */
export async function getLastSyncTime() {
  if (!_storage) {
    return _lastSyncTime
  }

  try {
    const timeData = await _storage.get(SYNC_TIME_KEY)
    if (timeData && timeData.time) {
      _lastSyncTime = timeData.time
      return timeData.time
    }
    return _lastSyncTime
  } catch {
    return _lastSyncTime
  }
}

// ==================== Internal Helpers ====================

/**
 * 清理旧的分片数据
 */
async function _cleanupChunks() {
  if (!_storage) return

  try {
    for (let i = 0; i < 100; i++) {
      const chunkKey = `${SYNC_KEY}-chunk-${i}`
      const exists = await _storage.get(chunkKey)
      if (exists === null || exists === undefined) break
      await _storage.remove(chunkKey)
    }
  } catch {
    // 清理失败不影响主流程
  }
}

/**
 * 读取分片数据并组装
 */
async function _readChunkedData(timeData, errors, warnings) {
  const totalChunks = timeData.chunks
  const allBookmarks = []

  for (let i = 0; i < totalChunks; i++) {
    const chunkKey = `${SYNC_KEY}-chunk-${i}`
    const chunk = await _storage.get(chunkKey)

    if (!chunk || !Array.isArray(chunk.bookmarks)) {
      _currentStatus = SYNC_STATUS_ERROR
      _lastError = `分片 ${i} 数据损坏或缺失`
      return { success: false, status: SYNC_STATUS_ERROR, bookmarks: null, errors: [_lastError], warnings }
    }

    allBookmarks.push(...chunk.bookmarks)
  }

  const validBookmarks = []
  for (let i = 0; i < allBookmarks.length; i++) {
    const bm = allBookmarks[i]
    if (bm && typeof bm === 'object' && bm.id !== undefined) {
      validBookmarks.push(bm)
    } else {
      warnings.push(`书签索引 ${i} 结构无效，已跳过`)
    }
  }

  _lastSyncTime = timeData.time
  _currentStatus = SYNC_STATUS_SUCCESS
  _lastError = null

  return { success: true, status: SYNC_STATUS_SUCCESS, bookmarks: validBookmarks, errors: [], warnings }
}
