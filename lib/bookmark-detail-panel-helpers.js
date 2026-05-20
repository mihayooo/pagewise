/**
 * BookmarkDetailPanel — 辅助方法
 *
 * 从 bookmark-detail-panel.js 拆分的内部方法:
 *   - emitAction          — 触发操作回调
 *   - formatDate          — 格式化日期
 *   - formatFolderPath    — 格式化文件夹路径
 *
 * @module lib/bookmark-detail-panel-helpers
 */

import { formatDateByLocale } from './bookmark-i18n.js'

/**
 * 触发操作回调
 * @param {Function[]} callbacks — 回调列表
 * @param {string} action — 操作类型
 * @param {Object} data — 操作数据
 */
export function emitAction(callbacks, action, data) {
  for (const cb of callbacks) {
    try {
      cb(action, data)
    } catch {
      // 回调异常不应影响面板逻辑
    }
  }
}

/**
 * 格式化日期
 * @param {number} dateAdded — 时间戳 (ms)
 * @returns {string}
 */
export function formatDate(dateAdded) {
  return formatDateByLocale(dateAdded)
}

/**
 * 格式化文件夹路径
 * @param {string[]} folderPath
 * @returns {string}
 */
export function formatFolderPath(folderPath) {
  if (!Array.isArray(folderPath) || folderPath.length === 0) return '/'
  return '/' + folderPath.join('/')
}
