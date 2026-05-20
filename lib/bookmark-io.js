/**
 * BookmarkImportExport — 数据导入导出
 *
 * 功能:
 *   1. exportJSON()      — 导出完整图谱数据 (书签+聚类+标签+状态) 为 JSON 字符串
 *   2. exportCSV()       — 导出书签列表为 CSV 字符串 (含表头)
 *   3. importFromChromeHTML(html) — 解析 Chrome 书签 HTML 导入书签
 *   4. importFromJSON(json)      — 从 JSON 字符串导入完整图谱数据
 *   5. exportToFile(format)      — 导出为 Blob ('json' | 'csv')
 *
 * 纯前端实现，不依赖外部 API。
 */

/**
 * @typedef {Object} Bookmark
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string[]} [folderPath]
 * @property {string[]} [tags]
 * @property {string}   [status]
 * @property {number}   [dateAdded]
 */

/**
 * @typedef {Object} ExportData
 * @property {Bookmark[]} bookmarks
 * @property {Object[]}   clusters
 * @property {Object[]}   tags
 * @property {Object[]}   statuses
 */

// ==================== BookmarkImportExport ====================

export class BookmarkImportExport {
  /**
   * @param {Object}      opts
   * @param {Bookmark[]}  [opts.bookmarks=[]]
   * @param {Object[]}    [opts.clusters=[]]
   * @param {Object[]}    [opts.tags=[]]
   * @param {Object[]}    [opts.statuses=[]]
   * @param {Function}    [opts.onProgress] — 进度回调 (phase, current, total)
   */
  constructor({ bookmarks = [], clusters = [], tags = [], statuses = [], onProgress = null } = {}) {
    this.bookmarks = bookmarks;
    this.clusters = clusters;
    this.tags = tags;
    this.statuses = statuses;
    this.onProgress = onProgress;
  }

  // ==================== 进度通知 ====================

  /** @private */
  _notify(phase, current, total) {
    if (typeof this.onProgress === 'function') {
      this.onProgress(phase, current, total);
    }
  }

  // ==================== 导出 JSON ====================

  /**
   * 导出完整图谱数据为 JSON 字符串
   * @returns {string}
   */
  exportJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      bookmarks: this.bookmarks,
      clusters: this.clusters,
      tags: this.tags,
      statuses: this.statuses,
    };

    const total = this.bookmarks.length;
    this._notify('export-json-start', 0, total);
    const result = JSON.stringify(data, null, 2);
    this._notify('export-json-done', total, total);
    return result;
  }

  // ==================== 导出 CSV ====================

  /**
   * 导出书签列表为 CSV 字符串
   * @returns {string}
   */
  exportCSV() {
    const header = 'title,url,folderPath,dateAdded,tags,status';
    const total = this.bookmarks.length;
    this._notify('export-csv-start', 0, total);

    const rows = this.bookmarks.map((bm, i) => {
      this._notify('export-csv-progress', i + 1, total);
      return BookmarkImportExport._bmToCsvRow(bm);
    });

    this._notify('export-csv-done', total, total);
    return [header, ...rows].join('\n');
  }

  /**
   * 将单个书签转为 CSV 行
   * @private
   * @param {Bookmark} bm
   * @returns {string}
   */
  static _bmToCsvRow(bm) {
    const title = BookmarkImportExport._escapeCsv(bm.title || '');
    const url = BookmarkImportExport._escapeCsv(bm.url || '');
    const folderPath = BookmarkImportExport._escapeCsv(
      Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : (bm.folderPath || '')
    );
    const dateAdded = bm.dateAdded
      ? new Date(bm.dateAdded).toISOString().split('T')[0]
      : '';
    const tags = BookmarkImportExport._escapeCsv(
      Array.isArray(bm.tags) ? bm.tags.join(',') : (bm.tags || '')
    );
    const status = BookmarkImportExport._escapeCsv(bm.status || '');

    return `${title},${url},${folderPath},"${dateAdded}",${tags},${status}`;
  }

  /**
   * CSV 字段转义：包含逗号/双引号/换行的字段用双引号包裹
   * @private
   * @param {string} val
   * @returns {string}
   */
  static _escapeCsv(val) {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return '"' + str + '"';
  }

  // ==================== 导入 Chrome HTML ====================

  /**
   * 解析 Chrome 书签 HTML 文件，返回 Bookmark[]
   * @param {string} html
   * @returns {Bookmark[]}
   */
  importFromChromeHTML(html) {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const bookmarks = [];
    const folderStack = [];
    let idCounter = 0;

    this._notify('import-html-start', 0, 0);

    // 逐行解析 DT/H3 和 DT/A 标签
    const lines = html.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 H3 标签 — 文件夹
      const h3Match = line.match(/<H3[^>]*>([^<]*)<\/H3>/i);
      if (h3Match) {
        folderStack.push(h3Match[1].trim());
        continue;
      }

      // 检测关闭的 DL 标签 — 退出文件夹层级
      if (/<\/DL>/i.test(line)) {
        folderStack.pop();
        continue;
      }

      // 检测 A 标签 — 书签
      const aMatch = line.match(
        /<A\s+HREF="([^"]*)"[^>]*ADD_DATE="([^"]*)"[^>]*>([^<]*)<\/A>/i
      );
      if (aMatch) {
        const url = aMatch[1];
        const addDate = parseInt(aMatch[2], 10) * 1000; // Unix → ms
        const title = aMatch[2] ? aMatch[3].trim() : aMatch[3].trim();

        bookmarks.push({
          id: `html-${++idCounter}`,
          title: title,
          url: url,
          folderPath: [...folderStack],
          tags: [],
          status: 'unread',
          dateAdded: isNaN(addDate) ? undefined : addDate,
        });
        continue;
      }

      // 回退: A 标签没有 ADD_DATE
      const aNoDate = line.match(/<A\s+HREF="([^"]*)"[^>]*>([^<]*)<\/A>/i);
      if (aNoDate) {
        bookmarks.push({
          id: `html-${++idCounter}`,
          title: aNoDate[2].trim(),
          url: aNoDate[1],
          folderPath: [...folderStack],
          tags: [],
          status: 'unread',
        });
      }
    }

    this._notify('import-html-done', bookmarks.length, bookmarks.length);
    return bookmarks;
  }

  // ==================== 导入 JSON ====================

  /**
   * 从 JSON 字符串导入完整图谱数据
   * @param {string} json
   * @returns {ExportData}
   */
  importFromJSON(json) {
    if (!json || typeof json !== 'string') {
      return { bookmarks: [], clusters: [], tags: [], statuses: [] };
    }

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { bookmarks: [], clusters: [], tags: [], statuses: [] };
    }

    const bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];
    const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const statuses = Array.isArray(parsed.statuses) ? parsed.statuses : [];

    this._notify('import-json-done', bookmarks.length, bookmarks.length);
    return { bookmarks, clusters, tags, statuses };
  }

  // ==================== 导出为 Blob ====================

  /**
   * 导出为 Blob 对象
   * @param {'json'|'csv'} format
   * @returns {Blob}
   */
  exportToFile(format) {
    this._notify('export-file-start', 0, 1);

    let content, mimeType;
    if (format === 'csv') {
      content = this.exportCSV();
      mimeType = 'text/csv;charset=utf-8';
    } else {
      content = this.exportJSON();
      mimeType = 'application/json;charset=utf-8';
    }

    const blob = new Blob([content], { type: mimeType });
    this._notify('export-file-done', 1, 1);
    return blob;
  }
}

// =====================================================================
//  R207: 从 bookmark-import-export-io.js 合并的独立函数
//  提供与 BookmarkImportExport 类相同的导入导出能力，但使用纯函数 API。
// =====================================================================

// ==================== 独立函数: 导出 HTML ====================

/**
 * 将书签数组导出为 Chrome 书签 HTML 格式
 *
 * @param {Array} bookmarks — 书签数组
 * @returns {string} Chrome 书签 HTML 字符串
 */
export function exportToHTML(bookmarks) {
  if (!Array.isArray(bookmarks)) return _htmlShell('')

  const folderGroups = _groupByFolder(bookmarks)
  const body = _buildHtmlTree(folderGroups)
  return _htmlShell(body)
}

function _htmlShell(body) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    body,
    '</DL><p>'
  ]
  return lines.join('\n')
}

function _groupByFolder(bookmarks) {
  const groups = new Map()
  for (const bm of bookmarks) {
    const key = Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(bm)
  }
  return groups
}

function _buildHtmlTree(folderGroups) {
  return _buildFolderHtml('', folderGroups)
}

function _buildFolderHtml(path, folderGroups) {
  const items = folderGroups.get(path) || []

  const pathPrefix = path ? path + '/' : ''
  const seen = new Map()
  for (const [key] of folderGroups) {
    if (key === path) continue
    if (!key.startsWith(pathPrefix)) continue
    const remainder = key.slice(pathPrefix.length)
    const parts = remainder.split('/')
    const name = parts[0]
    if (name && !seen.has(name)) {
      seen.set(name, path ? path + '/' + name : name)
    }
  }

  const indent = '    '
  const lines = ['<DL><p>']
  for (const [name, fullPath] of seen) {
    lines.push(`${indent}<DT><H3>${_escapeHtml(name)}</H3>`)
    lines.push(_buildFolderHtml(fullPath, folderGroups))
  }
  for (const bm of items) {
    const addDate = _toChromeTimestamp(bm.dateAdded)
    lines.push(`${indent}<DT><A HREF="${_escapeAttr(bm.url)}" ADD_DATE="${addDate}">${_escapeHtml(bm.title || '')}</A>`)
  }
  lines.push('</DL><p>')
  return lines.join('\n')
}

// ==================== 独立函数: 导出 JSON ====================

export function exportToJSON(bookmarks) {
  if (!Array.isArray(bookmarks)) return '[]'
  const data = bookmarks.map(bm => ({
    id: String(bm.id || ''),
    title: bm.title || '',
    url: bm.url || '',
    folderPath: Array.isArray(bm.folderPath) ? [...bm.folderPath] : [],
    dateAdded: bm.dateAdded || 0,
    dateAddedISO: bm.dateAddedISO || ''
  }))
  return JSON.stringify(data, null, 2)
}

// ==================== 独立函数: 导出 CSV ====================

export function exportToCSV(bookmarks) {
  if (!Array.isArray(bookmarks)) return ''

  const BOM = '﻿'
  const header = 'title,url,folderPath,dateAddedISO,id'
  const rows = bookmarks.map(bm => {
    const title = _csvEscape(bm.title || '')
    const url = _csvEscape(bm.url || '')
    const folderPath = _csvEscape(
      Array.isArray(bm.folderPath) ? bm.folderPath.join('/') : ''
    )
    const dateAddedISO = _csvEscape(bm.dateAddedISO || '')
    const id = _csvEscape(String(bm.id || ''))
    return `${title},${url},${folderPath},${dateAddedISO},${id}`
  })
  return BOM + [header, ...rows].join('\n')
}

function _csvEscape(value) {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

// ==================== 独立函数: 导入 HTML ====================

export function importFromHTML(htmlString) {
  if (typeof htmlString !== 'string' || !htmlString.trim()) return []

  const bookmarks = []
  const folderStack = []
  const folderDepths = []
  let depth = 0

  const tagRegex = /<(?:\/DL|DL|DT>\s*<H3|DT>\s*<A)\b/gi

  let pos = 0

  while (pos < htmlString.length) {
    tagRegex.lastIndex = pos
    const match = tagRegex.exec(htmlString)
    if (!match) break

    const tagStart = match.index
    const tagText = match[0]
    const tagName = tagText.replace(/^<\s*/, '')
    pos = tagStart + tagText.length

    if (/^DL\b/i.test(tagName)) {
      depth++
      continue
    }

    if (/^\/DL\b/i.test(tagName)) {
      depth--
      if (folderDepths.length && folderDepths[folderDepths.length - 1] === depth) {
        folderDepths.pop()
        folderStack.pop()
      }
      continue
    }

    const h3Match = htmlString.slice(tagStart).match(
      /^<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>/i
    )
    if (h3Match) {
      const folderName = _unescapeHtml(h3Match[1].trim())
      folderStack.push(folderName)
      folderDepths.push(depth)
      pos = tagStart + h3Match[0].length
      continue
    }

    const aMatch = htmlString.slice(tagStart).match(
      /^<DT>\s*<A\b([\s\S]*?)<\/A>/i
    )
    if (aMatch) {
      const attrsAndContent = aMatch[1]
      const hrefMatch = attrsAndContent.match(/\bHREF\s*=\s*"([\s\S]*?)"/i)
      const url = hrefMatch ? _unescapeHtml(hrefMatch[1]) : ''

      const addMatch = attrsAndContent.match(/\bADD_DATE\s*=\s*"(\d+)"/i)
      const dateAdded = addMatch ? parseInt(addMatch[1], 10) : 0

      const lastGt = attrsAndContent.lastIndexOf('>')
      const title = lastGt >= 0
        ? _unescapeHtml(attrsAndContent.slice(lastGt + 1).trim())
        : ''

      if (url) {
        bookmarks.push({
          id: _generateId(),
          title,
          url,
          folderPath: [...folderStack],
          dateAdded,
          dateAddedISO: dateAdded ? _fromChromeTimestamp(dateAdded) : ''
        })
      }
      pos = tagStart + aMatch[0].length
      continue
    }

    pos = tagStart + tagText.length
  }

  return bookmarks
}

// ==================== 独立函数: 导入 JSON ====================

export function importFromJSON(jsonString) {
  if (typeof jsonString !== 'string') {
    throw new Error('importFromJSON: 输入必须是字符串')
  }

  const data = JSON.parse(jsonString)
  const items = Array.isArray(data) ? data : [data]

  return items.map(item => ({
    id: String(item.id || _generateId()),
    title: item.title || '',
    url: item.url || '',
    folderPath: Array.isArray(item.folderPath) ? [...item.folderPath] : [],
    dateAdded: item.dateAdded || 0,
    dateAddedISO: item.dateAddedISO || ''
  }))
}

// ==================== 独立函数: 校验导入数据 ====================

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

    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}: 必须是对象`)
      continue
    }

    if (!item.title || typeof item.title !== 'string') {
      errors.push(`${prefix}: 缺少有效的 title 字段`)
    }

    if (!item.url || typeof item.url !== 'string') {
      errors.push(`${prefix}: 缺少有效的 url 字段`)
    } else {
      const urlPattern = /^(https?|ftp|file|chrome|chrome-extension|moz-extension):\/\/.+$/i
      if (!urlPattern.test(item.url)) {
        if (!/^javascript:/i.test(item.url) && !/^data:/i.test(item.url)) {
          errors.push(`${prefix}: url 格式不合法 — "${item.url.slice(0, 80)}"`)
        }
      }
    }

    if (item.folderPath !== undefined && !Array.isArray(item.folderPath)) {
      errors.push(`${prefix}: folderPath 必须是数组`)
    }

    if (item.dateAdded !== undefined && typeof item.dateAdded !== 'number') {
      errors.push(`${prefix}: dateAdded 必须是数字`)
    }
  }

  return { valid: errors.length === 0, errors }
}

// ==================== 工具函数 (R207 合并) ====================

function _escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function _escapeAttr(str) {
  return _escapeHtml(str)
}

function _unescapeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function _toChromeTimestamp(timestamp) {
  if (!timestamp) return 0
  if (timestamp > 1e15) return Math.floor(timestamp / 1e6)
  if (timestamp > 1e12) return Math.floor(timestamp / 1e3)
  return Math.floor(timestamp)
}

function _fromChromeTimestamp(chromeTimestamp) {
  if (!chromeTimestamp) return ''
  const ms = chromeTimestamp > 1e15
    ? chromeTimestamp / 1e3
    : chromeTimestamp > 1e12
      ? chromeTimestamp
      : chromeTimestamp * 1000
  try {
    return new Date(ms).toISOString()
  } catch {
    return ''
  }
}

function _generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
