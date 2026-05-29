/**
 * DocMindSyncManager — 辅助方法
 *
 * 从 docmind-sync.js 拆分的内部方法:
 *   - initClient           — 初始化 DocMind 客户端
 *   - filterIncremental    — 增量过滤
 *   - startAutoSync        — 启动自动同步
 *   - stopAutoSync         — 停止自动同步
 *   - saveConfigSilent     — 静默保存配置
 *   - getDefaultStorageGet — 获取默认 storage.get
 *   - getDefaultStorageSet — 获取默认 storage.set
 *
 * @module lib/docmind-sync-helpers
 */

import { DocMindClient } from './docmind-client.js'
import { storageGet, storageSet } from './storage-adapter.js'

/** 存储键名 */
export const STORAGE_KEY = 'pagewiseDocMind'

/**
 * 初始化 DocMind 客户端
 * @param {Object|null} client — 现有客户端实例
 * @param {Object} config — 配置 { serverUrl, apiKey }
 * @returns {Object} 初始化后的客户端
 */
export function initClient(client, config) {
  if (client) {
    client.serverUrl = config.serverUrl.replace(/\/+$/, '')
    client.apiKey = config.apiKey
    client._connected = true
    return client
  } else {
    const newClient = new DocMindClient({
      serverUrl: config.serverUrl,
      apiKey: config.apiKey,
    })
    newClient._connected = true
    return newClient
  }
}

/**
 * 增量过滤：只保留上次同步之后新增或更新的数据
 * @param {Array} items — 数据数组
 * @param {number|null} lastSyncTimestamp — 上次同步时间戳
 * @returns {Array} 过滤后的数据
 */
export function filterIncremental(items, lastSyncTimestamp) {
  if (!items || items.length === 0) return []
  if (!lastSyncTimestamp) return items

  return items.filter(item => {
    const itemTime = new Date(item.updatedAt || item.createdAt || 0).getTime()
    return itemTime > lastSyncTimestamp
  })
}

/**
 * 启动自动同步定时器
 * @param {number|null} existingTimer — 现有定时器 ID
 * @param {number} interval — 同步间隔（毫秒）
 * @returns {number|null} 新的定时器 ID
 */
export function startAutoSync(existingTimer, interval) {
  if (existingTimer !== null) {
    clearInterval(existingTimer)
  }
  if (interval > 0) {
    return setInterval(() => {
      // 自动同步时仅触发事件
    }, interval)
  }
  return null
}

/**
 * 停止自动同步定时器
 * @param {number|null} timerId — 定时器 ID
 */
export function stopAutoSync(timerId) {
  if (timerId !== null) {
    clearInterval(timerId)
  }
}

/**
 * 静默保存配置
 * @param {Object} storageSetFn — storage.set 函数
 * @param {Object} config — 当前配置
 * @param {Object} partial — 部分更新
 * @param {string} storageKey — 存储键名
 * @returns {Promise<Object>} 更新后的配置
 */
export async function saveConfigSilent(storageSetFn, config, partial, storageKey) {
  try {
    const updated = { ...config, ...partial }
    await new Promise((resolve) => {
      storageSetFn({ [storageKey]: updated }, resolve)
    })
    return updated
  } catch (_e) {
    console.debug('[PageWise] sync-helpers: using defaults', _e)
    return config
  }
}

/**
 * 获取默认的 storage.get 函数
 */
export function getDefaultStorageGet() {
  return (defaults, callback) => {
    storageGet(defaults).then(result => callback(result)).catch(() => callback(defaults))
  }
}

/**
 * 获取默认的 storage.set 函数
 */
export function getDefaultStorageSet() {
  return (items, callback) => {
    storageSet(items).then(() => { if (callback) callback() }).catch(() => { if (callback) callback() })
  }
}
