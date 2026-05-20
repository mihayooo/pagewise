/**
 * BookmarkImportExport — 书签导入导出模块
 *
 * R207: 合并至 bookmark-io.js，保留向后兼容 re-export。
 * 所有函数和类现在从 bookmark-io.js 统一导出。
 *
 * @module lib/bookmark-import-export
 */

export {
  BookmarkImportExport,
  exportToHTML,
  exportToJSON,
  exportToCSV,
  importFromHTML,
  importFromJSON,
  validateImportData,
} from './bookmark-io.js'
