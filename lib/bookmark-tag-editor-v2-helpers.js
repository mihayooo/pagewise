/**
 * BookmarkTagEditorV2 — 辅助方法
 *
 * 从 bookmark-tag-editor-v2.js 拆分的内部方法:
 *   - prioritizeSuggestionCandidates — 标签推荐候选排序
 *
 * @module lib/bookmark-tag-editor-v2-helpers
 */

import { TECH_KEYWORDS, DOMAIN_TAG_MAP, normalizeTag } from './tag-editor-constants.js'

/**
 * 标签推荐候选排序 — 技术关键词优先
 * @param {string[]} candidates — 候选标签
 * @param {number} limit — 最大推荐数
 * @param {Set<string>} existingTags — 全局已有标签库
 * @returns {string[]} 排序后的推荐标签
 */
export function prioritizeSuggestionCandidates(candidates, limit, existingTags) {
  const seen = new Set()
  const unique = []
  for (const c of candidates) {
    const norm = normalizeTag(c)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      unique.push(norm)
    }
  }

  const priority = (tag) => {
    if (TECH_KEYWORDS.has(tag)) return 0
    if (Object.values(DOMAIN_TAG_MAP).includes(tag)) return 1
    if (existingTags.has(tag)) return 2
    return 3
  }

  unique.sort((a, b) => priority(a) - priority(b))
  return unique.slice(0, limit)
}
