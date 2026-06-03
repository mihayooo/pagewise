/**
 * BookmarkGraphEngine — 相似度计算与工具方法
 *
 * 从 bookmark-graph.js 拆分的辅助函数:
 *   - similarity 计算 (Jaccard + 域名匹配 + 文件夹重叠)
 *   - 标题分词、域名提取、文件夹键、分组分配
 *
 * @module lib/bookmark-graph-helpers
 */

/**
 * 计算两个书签的相似度 (0-1)
 *
 * 混合策略:
 *   0.4 × Jaccard(titleTokens) +
 *   0.3 × domainMatch +
 *   0.3 × folderOverlap
 *
 * @param {Map} store — id → bookmark 映射
 * @param {Object|string} a — 书签或 ID
 * @param {Object|string} b — 书签或 ID
 * @returns {number} 相似度分数 (0-1)
 */
export function computeSimilarity(store, a, b) {
  const bmA = typeof a === 'string' ? store.get(a) : a
  const bmB = typeof b === 'string' ? store.get(b) : b

  if (!bmA || !bmB) return 0

  const tokensA = tokenizeTitle(bmA.title || '')
  const tokensB = tokenizeTitle(bmB.title || '')
  const jaccard = jaccardSimilarity(tokensA, tokensB)

  const domainA = extractDomain(bmA.url || '')
  const domainB = extractDomain(bmB.url || '')
  const domainMatch = (domainA && domainB && domainA === domainB) ? 1 : 0

  const folderOverlap = folderOverlapScore(
    bmA.folderPath || [],
    bmB.folderPath || [],
  )

  return 0.4 * jaccard + 0.3 * domainMatch + 0.3 * folderOverlap
}

/**
 * Jaccard 相似度
 * @param {string[]} setA
 * @param {string[]} setB
 * @returns {number} 0-1
 */
export function jaccardSimilarity(setA, setB) {
  if (setA.length === 0 && setB.length === 0) return 0
  const a = new Set(setA)
  const b = new Set(setB)
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * 文件夹路径重叠评分
 * @param {string[]} pathA
 * @param {string[]} pathB
 * @returns {number} 0-1
 */
export function folderOverlapScore(pathA, pathB) {
  if (!pathA || !pathB || pathA.length === 0 || pathB.length === 0) return 0
  const maxLen = Math.max(pathA.length, pathB.length)
  let common = 0
  for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
    if (pathA[i] === pathB[i]) {
      common++
    } else {
      break
    }
  }
  return common / maxLen
}

/**
 * 标题分词 — 中英文混合分词
 * @param {string} title
 * @returns {string[]}
 */
export function tokenizeTitle(title) {
  if (!title || typeof title !== 'string') return []
  const tokens = []
  const segments = title.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || []
  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) {
      for (const char of seg) {
        tokens.push(char)
      }
    } else if (/[a-zA-Z]/.test(seg)) {
      tokens.push(seg.toLowerCase())
    } else {
      tokens.push(seg)
    }
  }
  return tokens
}

/**
 * 从 URL 提取域名
 * @param {string} url
 * @returns {string} 去掉 www. 的域名，或空字符串
 */
export function extractDomain(url) {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '').toLowerCase()
  } catch (e) {
    console.warn('[GraphHelpers]', e?.message || e);
    return ''
  }
}

/**
 * 文件夹路径 → 索引键
 * @param {string[]} folderPath
 * @returns {string}
 */
export function getFolderKey(folderPath) {
  if (!folderPath || !Array.isArray(folderPath) || folderPath.length === 0) return ''
  return folderPath.join('/')
}

/**
 * 为书签分配分组 (优先文件夹 → 域名 → "default")
 * @param {Object} bm
 * @returns {string}
 */
export function assignGroup(bm) {
  if (bm.folderPath && bm.folderPath.length > 0) {
    return bm.folderPath[0]
  }
  const domain = extractDomain(bm.url || '')
  if (domain) return domain
  return 'default'
}
