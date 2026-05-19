/**
 * BookmarkExporter — 导入解析子模块
 *
 * 从 bookmark-exporter.js 拆分，负责:
 *   - Netscape Bookmark HTML 解析
 *   - Markdown 书签解析
 *
 * @module lib/bookmark-exporter-import
 */

/**
 * HTML 实体反转义
 */
export function unescapeHTML(str) {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * 从 Netscape Bookmark HTML 解析书签
 *
 * @param {string} htmlString — Netscape Bookmark HTML 字符串
 * @returns {Object[]} 解析后的书签数组
 */
export function importFromNetscape(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return []

  const bookmarks = []
  const folderStack = []

  const lines = htmlString.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const folderMatch = line.match(/<DT>\s*<H3[^>]*>([^<]*)<\/H3>/i)
    if (folderMatch) {
      folderStack.push(folderMatch[1].trim())
      continue
    }

    if (/<\/DL>/i.test(line)) {
      folderStack.pop()
      continue
    }

    const linkMatch = line.match(/<DT>\s*<A\s+HREF="([^"]*)"[^>]*>([^<]*)<\/A>/i)
    if (linkMatch) {
      const url = linkMatch[1]
      const title = unescapeHTML(linkMatch[2].trim())

      const addDateMatch = line.match(/ADD_DATE="(\d+)"/i)
      const addDate = addDateMatch ? addDateMatch[1] : ''

      const tagsMatch = line.match(/TAGS="([^"]*)"/i)
      const tags = tagsMatch
        ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean)
        : []

      let description = ''
      if (i + 1 < lines.length) {
        const ddMatch = lines[i + 1].match(/<DD>(.*)/i)
        if (ddMatch) {
          description = unescapeHTML(ddMatch[1].trim())
          i++
        }
      }

      bookmarks.push({
        id: `imported-${bookmarks.length + 1}`,
        title,
        url,
        folderPath: [...folderStack],
        tags,
        description,
        dateAdded: addDate || '',
        lastModified: '',
      })
    }
  }

  return bookmarks
}

/**
 * 从 Markdown 解析书签
 *
 * @param {string} mdString — Markdown 字符串
 * @returns {Object[]} 解析后的书签数组
 */
export function importFromMarkdown(mdString) {
  if (!mdString || typeof mdString !== 'string') return []

  const bookmarks = []
  const folderStack = []
  const lines = mdString.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const name = headingMatch[2].trim()
      if (level === 1 && /^bookmarks?$/i.test(name)) continue
      folderStack.length = level - 1
      folderStack[level - 1] = name
      continue
    }

    const linkMatch = line.match(/^[\s]*[-*]\s+\[([^\]]*)\]\(([^)]+)\)/)
    if (linkMatch) {
      const title = linkMatch[1].trim()
      const url = linkMatch[2].trim()

      const tagMatches = [...line.matchAll(/`([^`]+)`/g)]
      const tags = tagMatches.map(m => m[1]).filter(t => t !== title)

      let description = ''
      if (i + 1 < lines.length) {
        const descMatch = lines[i + 1].match(/^\s*>\s*(.*)/)
        if (descMatch) {
          description = descMatch[1].trim()
          i++
        }
      }

      bookmarks.push({
        id: `imported-${bookmarks.length + 1}`,
        title,
        url,
        folderPath: folderStack.filter(Boolean),
        tags,
        description,
        dateAdded: '',
        lastModified: '',
      })
    }
  }

  return bookmarks
}
