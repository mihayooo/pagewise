/**
 * Bookmark Batch — 移动与导出操作
 * 从 bookmark-batch.js 拆分
 *
 * @module lib/bookmark-batch-export
 */

import { buildIdMap, createResult, cloneBookmark } from './bookmark-batch-utils.js';

// ==================== 批量移动 ====================

/**
 * 批量移动书签到指定文件夹
 *
 * @param {Bookmark[]} bookmarks    — 书签数组 (原数组不变，返回修改后的新数组)
 * @param {string[]}   ids          — 目标书签 id 列表
 * @param {string[]}   targetFolder — 目标文件夹路径 (如 ["前端", "React"])
 * @returns {BatchResult & { moved: Bookmark[] }}
 */
export function batchMove(bookmarks, ids, targetFolder) {
  const result = createResult();
  result.moved = [];

  if (!Array.isArray(bookmarks)) return result;
  if (!Array.isArray(ids) || ids.length === 0) {
    result.moved = bookmarks.map(cloneBookmark);
    return result;
  }
  if (!Array.isArray(targetFolder) || targetFolder.length === 0) {
    result.moved = bookmarks.map(cloneBookmark);
    result.errors.push({ id: '*', reason: 'targetFolder must be a non-empty array' });
    result.failed = ids.length;
    return result;
  }

  // 验证 targetFolder 每一层都是有效字符串
  for (let i = 0; i < targetFolder.length; i++) {
    if (typeof targetFolder[i] !== 'string' || !targetFolder[i].trim()) {
      result.moved = bookmarks.map(cloneBookmark);
      result.errors.push({ id: '*', reason: `invalid folder segment at index ${i}` });
      result.failed = ids.length;
      return result;
    }
  }

  const targetSet = new Set(ids.map(String));
  const idMap = buildIdMap(bookmarks);
  const cleanFolder = targetFolder.map(s => s.trim());

  // 验证所有 ids 是否存在
  for (const id of targetSet) {
    if (!idMap.has(id)) {
      result.failed++;
      result.errors.push({ id, reason: 'bookmark not found' });
    }
  }

  for (const bm of bookmarks) {
    const id = String(bm.id);
    const clone = cloneBookmark(bm);

    if (targetSet.has(id) && idMap.has(id)) {
      const oldFolder = [...clone.folderPath];
      clone.folderPath = [...cleanFolder];
      result.success++;
      result.results.push({ id, from: oldFolder, to: [...cleanFolder] });
    }

    result.moved.push(clone);
  }

  return result;
}

/**
 * 批量移动到指定文件夹 (batchMove 的便捷封装，接受字符串路径)
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @param {string[]}   ids       — 目标书签 id 列表
 * @param {string}     folder    — 目标文件夹路径 (用 "/" 分隔，如 "前端/React")
 * @returns {BatchResult & { moved: Bookmark[] }}
 */
export function batchMoveToFolder(bookmarks, ids, folder) {
  const parts = typeof folder === 'string'
    ? folder.split('/').map(s => s.trim()).filter(Boolean)
    : Array.isArray(folder) ? folder : []
  return batchMove(bookmarks, ids, parts)
}

// ==================== 批量导出 ====================

/** 支持的导出格式 */
const SUPPORTED_FORMATS = new Set(['json', 'html', 'csv']);

/**
 * 将选中的书签导出为指定格式的字符串
 *
 * @param {Bookmark[]} bookmarks — 书签数组
 * @param {string[]}   ids       — 要导出的书签 id 列表; 空数组表示导出全部
 * @param {'json'|'html'|'csv'} format — 导出格式
 * @returns {{ content: string, count: number, format: string, errors: Object[] }}
 */
export function batchExport(bookmarks, ids, format) {
  const errors = [];

  if (!Array.isArray(bookmarks)) {
    return { content: '', count: 0, format: format || '', errors };
  }

  if (!SUPPORTED_FORMATS.has(format)) {
    errors.push({ id: '*', reason: `unsupported format: "${format}", use json/html/csv` });
    return { content: '', count: 0, format: format || '', errors };
  }

  // 确定要导出的书签列表
  let selected;
  if (!Array.isArray(ids) || ids.length === 0) {
    selected = bookmarks.map(cloneBookmark);
  } else {
    const idSet = new Set(ids.map(String));
    const idMap = buildIdMap(bookmarks);
    selected = [];
    for (const id of idSet) {
      const bm = idMap.get(id);
      if (bm) {
        selected.push(cloneBookmark(bm));
      } else {
        errors.push({ id, reason: 'bookmark not found' });
      }
    }
  }

  let content = '';
  switch (format) {
    case 'json':
      content = _exportJSON(selected);
      break;
    case 'html':
      content = _exportHTML(selected);
      break;
    case 'csv':
      content = _exportCSV(selected);
      break;
  }

  return { content, count: selected.length, format, errors };
}

/**
 * 导出为 JSON 字符串
 * @param {Bookmark[]} bookmarks
 * @returns {string}
 * @private
 */
function _exportJSON(bookmarks) {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: bookmarks.length,
    bookmarks: bookmarks,
  };
  return JSON.stringify(data, null, 2);
}

/**
 * 导出为 HTML (Chrome 书签格式)
 * @param {Bookmark[]} bookmarks
 * @returns {string}
 * @private
 */
function _exportHTML(bookmarks) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const bm of bookmarks) {
    const title = _escapeHTML(bm.title || '');
    const url = _escapeHTML(bm.url || '');
    const dateAdded = bm.dateAdded ? Math.floor(bm.dateAdded / 1000) : 0;
    const tags = Array.isArray(bm.tags) ? bm.tags.join(',') : '';
    const folderPath = Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : '';

    lines.push(
      `    <DT><A HREF="${url}" ADD_DATE="${dateAdded}" TAGS="${_escapeHTML(tags)}">${title}</A>`
    );
    if (folderPath) {
      lines.push(`    <!-- folder: ${_escapeHTML(folderPath)} -->`);
    }
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * 导出为 CSV 字符串
 * @param {Bookmark[]} bookmarks
 * @returns {string}
 * @private
 */
function _exportCSV(bookmarks) {
  const header = 'title,url,folderPath,tags,dateAdded,status';
  const rows = bookmarks.map(bm => {
    const title = _escapeCsv(bm.title || '');
    const url = _escapeCsv(bm.url || '');
    const folderPath = _escapeCsv(
      Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : ''
    );
    const tags = _escapeCsv(
      Array.isArray(bm.tags) ? bm.tags.join(';') : ''
    );
    const dateAdded = bm.dateAdded
      ? new Date(bm.dateAdded).toISOString().split('T')[0]
      : '';
    const status = _escapeCsv(bm.status || '');
    return `${title},${url},${folderPath},${tags},"${dateAdded}",${status}`;
  });
  return [header, ...rows].join('\n');
}

/**
 * HTML 转义
 * @param {string} str
 * @returns {string}
 * @private
 */
function _escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CSV 字段转义
 * @param {string} val
 * @returns {string}
 * @private
 */
function _escapeCsv(val) {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return '"' + str + '"';
}
