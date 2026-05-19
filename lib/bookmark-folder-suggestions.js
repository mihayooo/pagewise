/**
 * BookmarkFolderSuggestions — 独立的文件夹建议模块
 *
 * R125: 从 bookmark-folder-analyzer.js 提取 suggestOrganization / exportFolderTree
 * 为独立函数，方便按需引入。
 *
 * @module lib/bookmark-folder-suggestions
 */

import { BookmarkFolderAnalyzer } from './bookmark-folder-analyzer.js';

/**
 * 对书签文件夹结构提出组织建议
 * @param {Array} bookmarks - 书签数组
 * @returns {Array} 建议列表
 */
function suggestOrganization(bookmarks = []) {
  const analyzer = new BookmarkFolderAnalyzer(bookmarks);
  return analyzer.suggestOrganization();
}

/**
 * 导出文件夹树形结构
 * @param {Array} bookmarks - 书签数组
 * @param {string} format - 'text' | 'json'
 * @returns {string}
 */
function exportFolderTree(bookmarks = [], format = 'text') {
  const analyzer = new BookmarkFolderAnalyzer(bookmarks);
  return analyzer.exportFolderTree(format);
}

export { suggestOrganization, exportFolderTree };
