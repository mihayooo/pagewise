/**
 * SettingsManager — 统一设置管理器（薄编排层）
 *
 * R248: UnifiedSettingsPanel
 * R250: 模块拆分 — settings-manager.js 保持为薄编排层
 *
 * 子模块:
 *   - settings-registry.js  — 设置注册/校验/分类
 *   - settings-storage.js   — 读写/导入导出/重置/并发安全
 *   - settings-events.js    — 变更事件/订阅/取消订阅
 *
 * 设计约束:
 *   - 纯 ES Module，不依赖 DOM 或 Chrome API
 *   - 通过依赖注入 storage 接口
 *   - 所有公开 API 签名不变确保向后兼容
 *
 * @module lib/settings-manager
 */

import { createSettingsRegistry, SETTING_TYPES, SETTING_CATEGORIES } from './settings-registry.js'
import { createSettingsEvents } from './settings-events.js'
import { createSettingsStorage } from './settings-storage.js'

// Re-export 常量以保持向后兼容
export { SETTING_TYPES, SETTING_CATEGORIES }

// ==================== 工厂函数 ====================

/**
 * 创建 SettingsManager 实例
 *
 * @param {object} storage — chrome.storage 兼容接口 (get/set/remove)
 * @returns {SettingsManagerAPI}
 */
export function createSettingsManager(storage) {
  // 组装子模块
  const registry = createSettingsRegistry()
  const events = createSettingsEvents()
  const store = createSettingsStorage(storage, registry, events)

  return {
    // ─── 读写（委托 storage） ───
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    getAll: () => store.getAll(),

    // ─── Schema 生成（编排层负责） ───
    getSchema() {
      const reg = registry.getRegistry()
      const schema = {}
      for (const [key, def] of reg) {
        const entry = {
          type: def.type,
          label: def.label,
          description: def.description,
          default: def.default,
          category: def.category,
        }
        if (def.options) entry.options = def.options.map(o => ({ ...o }))
        if (def.min !== undefined) entry.min = def.min
        if (def.max !== undefined) entry.max = def.max
        schema[key] = entry
      }
      return schema
    },

    getSchemaByCategory(category) {
      const schema = this.getSchema()
      const result = {}
      for (const [key, def] of Object.entries(schema)) {
        if (def.category === category) {
          result[key] = def
        }
      }
      return result
    },

    // ─── 变更事件（委托 events） ───
    onSettingChange: (key, callback) => events.onSettingChange(key, callback),

    // ─── 导入导出（委托 storage） ───
    exportSettings: () => store.exportSettings(),
    importSettings: (json) => store.importSettings(json),

    // ─── 重置（委托 storage） ───
    resetToDefaults: (scope) => store.resetToDefaults(scope),

    // ─── 注册（委托 registry） ───
    registerSetting: (def) => registry.registerSetting(def),
    getRegisteredKeys: () => registry.getRegisteredKeys(),
  }
}

/**
 * @typedef {Object} SettingsManagerAPI
 * @property {(key: string) => Promise<*>} get
 * @property {(key: string, value: *) => Promise<void>} set
 * @property {() => Promise<object>} getAll
 * @property {() => object} getSchema
 * @property {(category: string) => object} getSchemaByCategory
 * @property {(key: string, cb: Function) => Function} onSettingChange
 * @property {() => Promise<string>} exportSettings
 * @property {(json: string) => Promise<void>} importSettings
 * @property {(scope?: string) => Promise<void>} resetToDefaults
 * @property {(def: object) => void} registerSetting
 * @property {() => string[]} getRegisteredKeys
 */
