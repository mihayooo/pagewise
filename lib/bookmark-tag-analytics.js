/**
 * BookmarkTagAnalytics — 书签标签分析辅助函数
 *
 * 从 bookmark-tag-editor-v2.js (R226) 拆分:
 *   - getUnusedTags(bookmarks, existingTags) — 查找未使用的标签
 *   - getTagCooccurrence(bookmarks, minCount) — 标签共现分析
 *   - prioritizeSuggestionCandidates(candidates, existingTags, limit) — 推荐候选排序
 *
 * @module lib/bookmark-tag-analytics
 */

import { TECH_KEYWORDS, DOMAIN_TAG_MAP, normalizeTag } from './tag-editor-constants.js'

// ==================== 未使用标签检测 ====================

/**
 * 查找全局标签库中未被任何书签使用的标签
 *
 * @param {Map<string, Object>} bookmarks — id → bookmark (含 tags 数组)
 * @param {Set<string>} existingTags — 全局已有标签库
 * @returns {string[]} 未使用的标签列表（排序）
 */
export function getUnusedTags(bookmarks, existingTags) {
  const usedTags = new Set()
  for (const bm of bookmarks.values()) {
    for (const t of bm.tags) {
      usedTags.add(t)
    }
  }

  const unused = []
  for (const tag of existingTags) {
    if (!usedTags.has(tag)) {
      unused.push(tag)
    }
  }

  return unused.sort()
}

// ==================== 标签共现分析 ====================

/**
 * 分析标签共现关系 — 找出经常一起出现的标签对
 *
 * @param {Map<string, Object>} bookmarks — id → bookmark (含 tags 数组)
 * @param {number} [minCount=2] — 最小共现次数（低于此值不返回）
 * @returns {Array<{tagA: string, tagB: string, count: number}>} 按共现次数降序
 */
export function getTagCooccurrence(bookmarks, minCount = 2) {
  const pairMap = new Map()

  for (const bm of bookmarks.values()) {
    const sorted = [...bm.tags].sort()
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`
        pairMap.set(key, (pairMap.get(key) || 0) + 1)
      }
    }
  }

  const results = []
  for (const [key, count] of pairMap) {
    if (count >= minCount) {
      const [tagA, tagB] = key.split('|')
      results.push({ tagA, tagB, count })
    }
  }

  results.sort((a, b) => b.count - a.count)
  return results
}

// ==================== 推荐候选排序 ====================

/**
 * 标签推荐候选排序 — 技术关键词优先
 *
 * @param {string[]} candidates — 原始候选标签
 * @param {Set<string>} existingTags — 全局已有标签库
 * @param {number} limit — 最大推荐数
 * @returns {string[]} 去重排序后的标签
 */
export function prioritizeSuggestionCandidates(candidates, existingTags, limit) {
  // 去重
  const seen = new Set()
  const unique = []
  for (const c of candidates) {
    const norm = normalizeTag(c)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      unique.push(norm)
    }
  }

  // 优先级: 技术关键词(0) > 域名映射(1) > 已有标签库(2) > 其他(3)
  const priority = (tag) => {
    if (TECH_KEYWORDS.has(tag)) return 0
    if (Object.values(DOMAIN_TAG_MAP).includes(tag)) return 1
    if (existingTags.has(tag)) return 2
    return 3
  }

  unique.sort((a, b) => priority(a) - priority(b))
  return unique.slice(0, limit)
}
