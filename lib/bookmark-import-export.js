/**
 * BookmarkImportExport — 书签导入导出模块
 *
 * 提供书签数据的多格式导出与导入功能:
 *   - exportToHTML(bookmarks)      — 导出为 Chrome 书签 HTML 格式
 *   - exportToJSON(bookmarks)      — 导出为 JSON 字符串
 *   - exportToCSV(bookmarks)       — 导出为 CSV 字符串
 *   - importFromHTML(htmlString)   — 从 Chrome 书签 HTML 解析书签数组
 *   - importFromJSON(jsonString)   — 从 JSON 字符串解析书签数组
 *   - validateImportData(data)     — 校验导入数据的合法性
 *
 * R157: IO 函数拆分至 bookmark-import-export-io.js
 *
 * 设计约束:
 * - 纯 ES Module，不依赖 DOM 或 Chrome API
 * - 纯函数，无副作用
 */

// Re-export IO functions from sub-module (API 向后兼容)
export {
  exportToHTML,
  exportToJSON,
  exportToCSV,
  importFromHTML,
  importFromJSON,
} from './bookmark-import-export-io.js'

// ==================== 校验 ====================

/**
 * 校验导入数据的合法性
 *
 * @param {any} data — 待校验数据
 * @returns {{ valid: boolean, errors: string[] }} 校验结果
 */
export function validateImportData(data) {
  const errors = []

  if (!data) {
    errors.push('数据为空')
    return { valid: false, errors }
  }

  const items = Array.isArray(data) ? data : [data]

  if (items.length === 0) {
    errors.push('书签列表为空')
    return { valid: false, errors }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const prefix = `书签[${i}]`

    // 对象检查
    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}: 必须是对象`)
      continue
    }

    // title 检查
    if (!item.title || typeof item.title !== 'string') {
      errors.push(`${prefix}: 缺少有效的 title 字段`)
    }

    // url 检查
    if (!item.url || typeof item.url !== 'string') {
      errors.push(`${prefix}: 缺少有效的 url 字段`)
    } else {
      // 基本 URL 格式校验
      const urlPattern = /^(https?|ftp|file|chrome|chrome-extension|moz-extension):\/\/.+$/i
      if (!urlPattern.test(item.url)) {
        // 允许 javascript: 和 data: URL
        if (!/^javascript:/i.test(item.url) && !/^data:/i.test(item.url)) {
          errors.push(`${prefix}: url 格式不合法 — "${item.url.slice(0, 80)}"`)
        }
      }
    }

    // folderPath 检查
    if (item.folderPath !== undefined && !Array.isArray(item.folderPath)) {
      errors.push(`${prefix}: folderPath 必须是数组`)
    }

    // dateAdded 检查
    if (item.dateAdded !== undefined && typeof item.dateAdded !== 'number') {
      errors.push(`${prefix}: dateAdded 必须是数字`)
    }
  }

  return { valid: errors.length === 0, errors }
}
