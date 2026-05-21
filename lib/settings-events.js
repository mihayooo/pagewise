/**
 * SettingsEvents — 变更事件/订阅/取消订阅
 *
 * R250: 从 settings-manager.js 拆分
 * 职责: 设置变更事件的注册、触发、取消订阅
 *
 * @module lib/settings-events
 */

// ==================== 事件工厂 ====================

/**
 * 创建设置事件系统
 *
 * @returns {SettingsEventsAPI}
 */
export function createSettingsEvents() {
  /** @type {Map<string, Set<Function>>} key → callbacks */
  const _listeners = new Map()

  return {
    /**
     * 注册设置变更监听
     * @param {string} key
     * @param {Function} callback — (key, value) => void
     * @returns {Function} 取消订阅函数
     */
    onSettingChange(key, callback) {
      if (!_listeners.has(key)) _listeners.set(key, new Set())
      _listeners.get(key).add(callback)
      return () => {
        const cbs = _listeners.get(key)
        if (cbs) cbs.delete(callback)
      }
    },

    /**
     * 触发变更事件
     * @param {string} key
     * @param {*} value
     */
    emit(key, value) {
      const cbs = _listeners.get(key)
      if (!cbs || cbs.size === 0) return
      for (const cb of cbs) {
        try { cb(key, value) } catch (_e) { /* 静默 */ }
      }
    },
  }
}

/**
 * @typedef {Object} SettingsEventsAPI
 * @property {(key: string, cb: Function) => Function} onSettingChange
 * @property {(key: string, value: *) => void} emit
 */
