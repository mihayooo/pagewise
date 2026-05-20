/**
 * BookmarkImportExport IO — HTML/CSV 导出与 HTML/JSON 导入
 *
 * R207: 合并至 bookmark-io.js，保留向后兼容 re-export。
 * 所有独立函数 (exportToHTML / exportToJSON / exportToCSV /
 * importFromHTML / importFromJSON) 现在从 bookmark-io.js 统一导出。
 *
 * @module lib/bookmark-import-export-io
 */

export {
  exportToHTML,
  exportToJSON,
  exportToCSV,
  importFromHTML,
  importFromJSON,
} from './bookmark-io.js'
