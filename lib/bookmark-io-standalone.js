/**
 * BookmarkIO — 独立导入导出函数 + 工具函数
 *
 * 从 bookmark-io.js 拆分的纯函数 API:
 *   - exportToHTML(bookmarks)    — 导出为 Chrome 书签 HTML
 *   - exportToJSON(bookmarks)    — 导出为 JSON 字符串
 *   - exportToCSV(bookmarks)     — 导出为 CSV 字符串
 *   - importFromHTML(htmlString) — 从 Chrome HTML 导入
 *   - importFromJSON(jsonString) — 从 JSON 导入
 *   - validateImportData(data)   — 校验导入数据
 *
 * @module lib/bookmark-io-standalone
 */

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

/**
 * @param {Array} bookmarks - 书签列表
 * * @returns {string} JSON 字符串
 */
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

/**
 * @param {Array} bookmarks - 书签列表
 * * @returns {string} CSV 字符串
 */
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

/**
 * @param {string} html - Chrome 书签 HTML
 * * @returns {Array} 解析后的书签列表
 */
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

/**
 * @param {string} json - JSON 字符串
 * * @returns {Array} 书签列表
 */
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

// ==================== 工具函数 ====================

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
