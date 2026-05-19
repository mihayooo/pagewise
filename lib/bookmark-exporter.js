/**
 * BookmarkExporter — 书签导出器增强
 *
 * 支持多种格式的书签导入/导出。
 * 导入逻辑已拆分至 bookmark-exporter-import.js
 *
 * @module lib/bookmark-exporter
 */

import {
  importFromNetscape as _importFromNetscape,
  importFromMarkdown as _importFromMarkdown,
} from './bookmark-exporter-import.js'

/**
 * 默认 CSV 列配置
 */
const DEFAULT_CSV_COLUMNS = ['title', 'url', 'folderPath', 'tags', 'description', 'dateAdded']

/**
 * CSV 分隔符转义
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * XML 特殊字符转义
 */
function escapeXML(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * HTML 特殊字符转义 (用于 Netscape 格式)
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 将 dateAdded 时间戳转为 Unix 时间戳字符串
 */
function toUnixTimestamp(dateStr) {
  if (!dateStr) return ''
  if (/^\d+$/.test(dateStr)) {
    return dateStr
  }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return String(Math.floor(d.getTime() / 1000))
}

/**
 * 递归构建文件夹树结构
 */
function buildFolderTree(bookmarks) {
  const root = { _items: [] }
  for (const bm of bookmarks) {
    const parts = (bm.folderPath && bm.folderPath.length > 0)
      ? bm.folderPath
      : []
    let node = root
    for (const part of parts) {
      if (!node[part]) node[part] = { _items: [] }
      node = node[part]
    }
    node._items.push(bm)
  }
  return root
}

// ==================== exportToNetscape ====================

function exportToNetscape(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p></DL><p>'
  }

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]

  const tree = buildFolderTree(bookmarks)
  _renderNetscapeNode(tree, lines, 1)

  lines.push('</DL><p>')
  return lines.join('\n')
}

function _renderNetscapeNode(node, lines, indent) {
  const pad = '    '.repeat(indent)

  for (const bm of node._items) {
    const ts = toUnixTimestamp(bm.dateAdded)
    const tsAttr = ts ? ` ADD_DATE="${ts}"` : ''
    const tags = (bm.tags && bm.tags.length > 0)
      ? ` TAGS="${escapeHTML(bm.tags.join(','))}"`
      : ''
    const desc = bm.description
      ? `\n${pad}    <DD>${escapeHTML(bm.description)}`
      : ''
    lines.push(`${pad}<DT><A HREF="${escapeHTML(bm.url)}"${tsAttr}${tags}>${escapeHTML(bm.title)}</A>${desc}`)
  }

  const subFolders = Object.keys(node).filter(k => k !== '_items').sort()
  for (const folderName of subFolders) {
    lines.push(`${pad}<DT><H3>${escapeHTML(folderName)}</H3>`)
    lines.push(`${pad}<DL><p>`)
    _renderNetscapeNode(node[folderName], lines, indent + 1)
    lines.push(`${pad}</DL><p>`)
  }
}

// ==================== exportToMarkdown ====================

function exportToMarkdown(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return '# Bookmarks\n\n_No bookmarks to export._'
  }

  const lines = ['# Bookmarks', '']

  const tree = buildFolderTree(bookmarks)
  _renderMarkdownNode(tree, lines, 2)

  return lines.join('\n')
}

function _renderMarkdownNode(node, lines, headingLevel) {
  const level = Math.min(headingLevel, 6)

  for (const bm of node._items) {
    const tags = (bm.tags && bm.tags.length > 0)
      ? ` \`${bm.tags.join('` `')}\``
      : ''
    const desc = bm.description
      ? `\n  > ${bm.description}`
      : ''
    lines.push(`- [${bm.title}](${bm.url})${tags}${desc}`)
  }

  if (node._items.length > 0) {
    lines.push('')
  }

  const subFolders = Object.keys(node).filter(k => k !== '_items').sort()
  for (const folderName of subFolders) {
    const hashes = '#'.repeat(level)
    lines.push(`${hashes} ${folderName}`)
    lines.push('')
    _renderMarkdownNode(node[folderName], lines, headingLevel + 1)
  }
}

// ==================== exportToOPML ====================

function exportToOPML(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Bookmarks</title>\n  </head>\n  <body>\n  </body>\n</opml>'
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>Bookmarks</title>',
    '  </head>',
    '  <body>',
  ]

  const tree = buildFolderTree(bookmarks)
  _renderOPMLNode(tree, lines, 2)

  lines.push('  </body>')
  lines.push('</opml>')
  return lines.join('\n')
}

function _renderOPMLNode(node, lines, indent) {
  const pad = '  '.repeat(indent)

  for (const bm of node._items) {
    const attrs = [
      `text="${escapeXML(bm.title)}"`,
      `type="rss"`,
      `xmlUrl="${escapeXML(bm.url)}"`,
      `htmlUrl="${escapeXML(bm.url)}"`,
    ]
    if (bm.description) {
      attrs.push(`description="${escapeXML(bm.description)}"`)
    }
    lines.push(`${pad}<outline ${attrs.join(' ')} />`)
  }

  const subFolders = Object.keys(node).filter(k => k !== '_items').sort()
  for (const folderName of subFolders) {
    lines.push(`${pad}<outline text="${escapeXML(folderName)}">`)
    _renderOPMLNode(node[folderName], lines, indent + 1)
    lines.push(`${pad}</outline>`)
  }
}

// ==================== exportToJSONLD ====================

function exportToJSONLD(bookmarks) {
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'Bookmarks',
      'numberOfItems': 0,
      'itemListElement': [],
    }, null, 2)
  }

  const itemListElement = bookmarks.map((bm, index) => {
    const entry = {
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'WebPage',
        'name': bm.title || '',
        'url': bm.url || '',
        'identifier': bm.id || '',
      },
    }

    if (bm.description) entry.item.description = bm.description
    if (bm.tags && bm.tags.length > 0) entry.item.keywords = bm.tags.join(', ')
    if (bm.folderPath && bm.folderPath.length > 0) entry.item.genre = bm.folderPath.join(' > ')
    if (bm.dateAdded) entry.item.dateCreated = bm.dateAdded
    if (bm.lastModified) entry.item.dateModified = bm.lastModified

    return entry
  })

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'Bookmarks',
    'numberOfItems': bookmarks.length,
    'itemListElement': itemListElement,
  }, null, 2)
}

// ==================== exportToCSV ====================

function exportToCSV(bookmarks, options = {}) {
  const columns = (Array.isArray(options.columns) && options.columns.length > 0)
    ? options.columns
    : DEFAULT_CSV_COLUMNS

  const delimiter = options.delimiter || ','
  const includeHeader = options.includeHeader !== false

  if (!Array.isArray(bookmarks)) {
    return includeHeader ? columns.join(delimiter) : ''
  }

  const lines = []

  if (includeHeader) {
    lines.push(columns.map(c => escapeCSV(c)).join(delimiter))
  }

  for (const bm of bookmarks) {
    const row = columns.map(col => {
      let value = bm[col]
      if (Array.isArray(value)) {
        value = value.join(';')
      }
      return escapeCSV(value)
    })
    lines.push(row.join(delimiter))
  }

  return lines.join('\n')
}

// ==================== BookmarkExporter 命名空间类 ====================

class BookmarkExporter {
  static exportToNetscape(bookmarks) { return exportToNetscape(bookmarks) }
  static exportToMarkdown(bookmarks) { return exportToMarkdown(bookmarks) }
  static exportToOPML(bookmarks) { return exportToOPML(bookmarks) }
  static exportToJSONLD(bookmarks) { return exportToJSONLD(bookmarks) }
  static exportToCSV(bookmarks, options) { return exportToCSV(bookmarks, options) }
  static importFromNetscape(htmlString) { return _importFromNetscape(htmlString) }
  static importFromMarkdown(mdString) { return _importFromMarkdown(mdString) }
}

export {
  BookmarkExporter,
  exportToNetscape,
  exportToMarkdown,
  exportToOPML,
  exportToJSONLD,
  exportToCSV,
}
export { _importFromNetscape as importFromNetscape, _importFromMarkdown as importFromMarkdown }
export default BookmarkExporter
