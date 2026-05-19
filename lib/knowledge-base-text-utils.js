/**
 * KnowledgeBaseTextUtils — 知识库文本工具
 * 职责: bigram 分词、余弦相似度、文本比较
 * 从 KnowledgeBase 静态方法提取，保持向后兼容
 */

/**
 * 对文本进行 bigram 分词
 * 中文按字符 bigram，英文按空格分词后取 bigram
 * @param {string} text - 输入文本
 * @returns {string[]} - bigram 数组
 */
export function bigrams(text) {
  if (!text) return [];
  const normalized = text.toLowerCase().trim();
  const tokens = [];
  const words = normalized.split(/[\s,;.!?，。；！？、\-\(\)\[\]\{\}]+/).filter(Boolean);
  for (const word of words) {
    if (word.length <= 2) { tokens.push(word); }
    else { for (let i = 0; i < word.length - 1; i++) tokens.push(word.substring(i, i + 2)); }
  }
  return tokens;
}

/**
 * 计算两段文本的相似度（基于 TF 向量余弦相似度）
 * @param {string} text1 - 文本 1
 * @param {string} text2 - 文本 2
 * @returns {number} - 0-1 之间的相似度分数
 */
export function calculateSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 1;
  const tokens1 = bigrams(text1);
  const tokens2 = bigrams(text2);
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  const tf1 = {}; const tf2 = {};
  for (const t of tokens1) tf1[t] = (tf1[t] || 0) + 1;
  for (const t of tokens2) tf2[t] = (tf2[t] || 0) + 1;
  const allTerms = new Set([...Object.keys(tf1), ...Object.keys(tf2)]);
  let dot = 0, m1 = 0, m2 = 0;
  for (const term of allTerms) {
    const v1 = tf1[term] || 0, v2 = tf2[term] || 0;
    dot += v1 * v2; m1 += v1 * v1; m2 += v2 * v2;
  }
  const mag = Math.sqrt(m1) * Math.sqrt(m2);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * 构造条目的比较文本（title + summary + tags + question）
 * @param {Object} entry - 知识条目
 * @returns {string} - 合并后的文本
 */
export function getEntryCompareText(entry) {
  return [entry.title || '', entry.summary || '', (entry.tags || []).join(' '), entry.question || ''].filter(Boolean).join(' ');
}

/**
 * 构造条目的搜索比较文本（title + summary + question + answer）
 * @param {Object} entry - 知识条目
 * @returns {string} - 合并后的文本
 */
export function getSearchCompareText(entry) {
  return [entry.title || '', entry.summary || '', entry.question || '', entry.answer || ''].filter(Boolean).join(' ');
}

/**
 * 语义搜索 — 基于 bigram 向量余弦相似度
 * @param {string} query - 搜索查询
 * @param {Array} entries - 知识条目数组
 * @param {number} limit - 返回数量上限
 * @returns {Array<{entry: Object, score: number}>} - 按相关度排序的结果
 */
export function semanticSearch(query, entries, limit = 20) {
  if (!query || !entries || entries.length === 0) return [];
  const scored = [];
  for (const entry of entries) {
    const score = calculateSimilarity(query, getSearchCompareText(entry));
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * 获取搜索推荐词
 * @param {string} query - 搜索查询
 * @param {Array} entries - 知识条目数组
 * @param {number} limit - 推荐数量
 * @returns {string[]} - 推荐搜索词
 */
export function getSearchSuggestions(query, entries, limit = 3) {
  if (!query || !entries || entries.length === 0) return [];
  const queryBigrams = new Set(bigrams(query));
  const bigramTitles = {};
  for (const entry of entries) {
    const entryBigrams = bigrams((entry.title || '') + ' ' + (entry.summary || '') + ' ' + (entry.question || ''));
    for (const bg of entryBigrams) {
      if (!bigramTitles[bg]) bigramTitles[bg] = new Set();
      bigramTitles[bg].add(entry.title);
    }
  }
  const titleScores = {};
  for (const bg of queryBigrams) {
    if (bigramTitles[bg]) { for (const title of bigramTitles[bg]) titleScores[title] = (titleScores[title] || 0) + 1; }
  }
  return Object.entries(titleScores).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([title]) => title);
}

/**
 * 标记文本中匹配 query 的字段
 * @param {string} query - 搜索查询
 * @param {Object} entry - 知识条目
 * @returns {Object} - { matchedFields: string[] }
 */
export function getMatchedFields(query, entry) {
  if (!query || !entry) return { matchedFields: [] };
  const lowerQuery = query.toLowerCase();
  const fields = [];
  if ((entry.title || '').toLowerCase().includes(lowerQuery)) fields.push('title');
  if ((entry.summary || '').toLowerCase().includes(lowerQuery)) fields.push('summary');
  if ((entry.question || '').toLowerCase().includes(lowerQuery)) fields.push('question');
  if ((entry.answer || '').toLowerCase().includes(lowerQuery)) fields.push('answer');
  if ((entry.content || '').toLowerCase().includes(lowerQuery)) fields.push('content');
  if ((entry.tags || []).some(t => t.toLowerCase().includes(lowerQuery))) fields.push('tags');
  return { matchedFields: fields };
}
