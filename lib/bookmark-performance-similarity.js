/**
 * BookmarkPerformanceOptimizer — 相似度计算
 *
 * R203: 从 bookmark-performance.js 拆分
 * 包含: _computePairSimilarity / _tokenizeTitle / _extractDomain
 *       _folderOverlapScore / _jaccard
 *
 * @module lib/bookmark-performance-similarity
 */

/**
 * 计算两个书签的相似度（简化版本，不依赖引擎实例）
 *
 * 混合策略:
 *   0.4 × Jaccard(titleTokens) +
 *   0.3 × domainMatch +
 *   0.3 × folderOverlap
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number} 0-1
 */
export function computePairSimilarity(a, b) {
  if (!a || !b) return 0;

  // 1. 标题 Jaccard (0.4)
  const tokensA = tokenizeTitle(a.title || '');
  const tokensB = tokenizeTitle(b.title || '');
  const jac = jaccard(tokensA, tokensB);

  // 2. 域名匹配 (0.3)
  const domainA = extractDomain(a.url || '');
  const domainB = extractDomain(b.url || '');
  const domainMatch = (domainA && domainB && domainA === domainB) ? 1 : 0;

  // 3. 文件夹重叠 (0.3)
  const folderOverlap = folderOverlapScore(
    a.folderPath || [],
    b.folderPath || []
  );

  return 0.4 * jac + 0.3 * domainMatch + 0.3 * folderOverlap;
}

/**
 * 标题分词 — 中英文混合分词
 * @param {string} title
 * @returns {Set<string>}
 */
export function tokenizeTitle(title) {
  const tokens = new Set();
  if (!title) return tokens;

  // 英文: 按空格/标点分词并转小写
  const englishParts = title.split(/[\s\-_/,.;:!?()[\]{}'"]+/);
  for (const part of englishParts) {
    if (part.length > 0) {
      tokens.add(part.toLowerCase());
    }
  }

  // 中文: 逐字分词
  for (const char of title) {
    if (/[一-鿿]/.test(char)) {
      tokens.add(char);
    }
  }

  return tokens;
}

/**
 * 提取域名
 * @param {string} url
 * @returns {string|null}
 */
export function extractDomain(url) {
  if (!url) return null;
  try {
    const match = url.match(/^https?:\/\/([^/]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * 计算文件夹路径重叠分数
 * @param {string[]} pathA
 * @param {string[]} pathB
 * @returns {number} 0-1
 */
export function folderOverlapScore(pathA, pathB) {
  if (!pathA.length || !pathB.length) return 0;
  const setA = new Set(pathA);
  const setB = new Set(pathB);
  let overlap = 0;
  for (const folder of setA) {
    if (setB.has(folder)) overlap++;
  }
  const union = new Set([...pathA, ...pathB]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * Jaccard 相似度
 * @param {Set} setA
 * @param {Set} setB
 * @returns {number} 0-1
 */
export function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
