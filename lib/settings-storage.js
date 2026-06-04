/**
 * SettingsStorage — 读写/导入导出/重置/并发安全
 *
 * R250: 从 settings-manager.js 拆分
 * 职责: storage 读写、缓存、串行化写队列、导入导出、重置
 *
 * @module lib/settings-storage
 */

import { SENSITIVE_KEYS } from './settings-registry.js'

/** Storage key for all settings */
const STORAGE_KEY = 'pagewise_settings'

// ==================== Storage 工厂 ====================

/**
 * 创建设置存储层
 *
 * @param {object} storage — chrome.storage 兼容接口 (get/set/remove)
 * @param {import('./settings-registry.js').SettingsRegistryAPI} registry — 注册表实例
 * @param {import('./settings-events.js').SettingsEventsAPI} events — 事件系统实例
 * @returns {SettingsStorageAPI}
 */
export function createSettingsStorage(storage, registry, events) {
  /** @type {object|null} 内存缓存 */
  let _cache = null

  /** @type {Promise<void>|null} 写锁队列 */
  let _writeQueue = Promise.resolve()

  // ==================== 内部方法 ====================

  /** 从 storage 加载全部设置 */
  async function _load() {
    if (_cache) return _cache
    try {
      const raw = await storage.get(STORAGE_KEY)
      _cache = raw[STORAGE_KEY] || {}
    } catch (err) {
      console.warn('[SettingsStorage] 读取失败，使用默认值:', err)
      _cache = {}
    }
    return _cache
  }

  /** 保存全部设置到 storage（串行化，防止并发覆盖） */
  async function _save(data) {
    _cache = data
    try {
      await storage.set({ [STORAGE_KEY]: data })
    } catch (err) {
      console.warn('[SettingsStorage] 持久化写入失败:', err)
    }
  }

  /**
   * 串行化写操作 — 所有修改操作排队执行，避免并发覆盖
   * @param {Function} fn — 异步写操作
   * @returns {Promise<void>}
   */
  function _enqueue(fn) {
    _writeQueue = _writeQueue.then(fn, fn)
    return _writeQueue
  }

  // ==================== API ====================

  return {
    /**
     * 获取单个设置值（带默认值回退）
     * @param {string} key
     * @returns {Promise<*>}
     */
    async get(key) {
      const data = await _load()
      if (key in data) return data[key]
      const def = registry.getDefinition(key)
      return def ? def.default : undefined
    },

    /**
     * 设置单个值（含校验 + 事件触发，串行化防并发）
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
      return _enqueue(async () => {
        registry.validate(key, value)
        const data = await _load()
        const oldValue = key in data ? data[key] : (registry.getDefinition(key)?.default)
        if (oldValue === value) return // 值未变化，跳过
        data[key] = value
        await _save(data)
        events.emit(key, value)
      })
    },

    /**
     * 获取所有设置（合并默认值）
     * @returns {Promise<object>}
     */
    async getAll() {
      const data = await _load()
      const defaults = registry.getDefaults()
      return { ...defaults, ...data }
    },

    /**
     * 导出全部设置为 JSON 字符串（跨设备迁移）
     * @returns {Promise<string>}
     */
    async exportSettings() {
      const data = await _load()
      const defaults = registry.getDefaults()
      const merged = { ...defaults, ...data }
      // 清除敏感字段
      const safeSettings = {}
      for (const [k, v] of Object.entries(merged)) {
        if (SENSITIVE_KEYS.has(k)) {
          safeSettings[k] = '' // 清空敏感值
        } else {
          safeSettings[k] = v
        }
      }
      const exportData = {
        version: 1,
        settings: safeSettings,
        exportedAt: Date.now(),
      }
      return JSON.stringify(exportData, null, 2)
    },

    /**
     * 从 JSON 字符串导入设置
     * @param {string} json
     * @returns {Promise<void>}
     */
    async importSettings(json) {
      let parsed
      try {
        parsed = JSON.parse(json)
      } catch (err) {
        throw new Error('导入失败: JSON 格式无效')
      }
      if (!parsed.settings || typeof parsed.settings !== 'object') {
        throw new Error('导入失败: 缺少 settings 字段')
      }
      // 校验所有待导入值
      for (const [key, value] of Object.entries(parsed.settings)) {
        if (SENSITIVE_KEYS.has(key) && !value) continue
        registry.validate(key, value)
      }
      // 校验通过后串行写入
      return _enqueue(async () => {
        const data = await _load()
        for (const [key, value] of Object.entries(parsed.settings)) {
          if (SENSITIVE_KEYS.has(key) && !value) continue
          data[key] = value
        }
        await _save(data)
        for (const [key, value] of Object.entries(parsed.settings)) {
          if (SENSITIVE_KEYS.has(key) && !value) continue
          events.emit(key, value)
        }
      })
    },

    /**
     * 重置为默认值
     * @param {string} [scope] — 分类名，不传则重置全部
     * @returns {Promise<void>}
     */
    async resetToDefaults(scope) {
      return _enqueue(async () => {
        const data = await _load()
        const defaults = registry.getDefaults()
        const reg = registry.getRegistry()
        const keysToReset = []
        for (const [key, def] of reg) {
          if (!scope || def.category === scope) {
            keysToReset.push(key)
          }
        }
        for (const key of keysToReset) {
          const oldValue = key in data ? data[key] : defaults[key]
          data[key] = defaults[key]
          if (oldValue !== defaults[key]) {
            events.emit(key, defaults[key])
          }
        }
        await _save(data)
      })
    },
  }
}

/**
 * @typedef {Object} SettingsStorageAPI
 * @property {(key: string) => Promise<*>} get
 * @property {(key: string, value: *) => Promise<void>} set
 * @property {() => Promise<object>} getAll
 * @property {() => Promise<string>} exportSettings
 * @property {(json: string) => Promise<void>} importSettings
 * @property {(scope?: string) => Promise<void>} resetToDefaults
 */
