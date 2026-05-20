/**
 * BookmarkIndexerTokenizer — 书签索引器分词方法
 *
 * 从 bookmark-indexer.js (R226) 拆分:
 *   - tokenize(text) — 中英文混合分词
 *   - extractTokens(bookmark) — 从书签中提取所有可索引 token
 *   - tokenizeUrl(url) — 从 URL 提取关键词
 *
 * @module lib/bookmark-indexer-tokenizer
 */

/**
 * 中英文混合分词
 * - 中文: 逐字切分 (unigram)
 * - 英文: 按空格/标点分词, 全小写
 * - 数字: 保留完整数字
 *
 * @param {string} text — 输入文本
 * @returns {string[]} tokens
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];

  const tokens = [];
  // 用正则拆分: 中文字符 | 英文单词 | 数字序列
  const segments = text.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];

  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) {
      // 中文: 逐字
      for (const char of seg) {
        tokens.push(char);
      }
    } else if (/[a-zA-Z]/.test(seg)) {
      // 英文: 小写
      tokens.push(seg.toLowerCase());
    } else {
      // 数字
      tokens.push(seg);
    }
  }

  return tokens;
}

/**
 * 从书签中提取所有可索引的 token
 * @param {Object} bookmark
 * @returns {string[]}
 */
export function extractTokens(bookmark) {
  const allTokens = [];

  // 1. 标题分词
  if (bookmark.title) {
    allTokens.push(...tokenize(bookmark.title));
  }

  // 2. URL 提取
  if (bookmark.url) {
    allTokens.push(...tokenizeUrl(bookmark.url));
  }

  // 3. 文件夹路径分词
  if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
    for (const folder of bookmark.folderPath) {
      allTokens.push(...tokenize(folder));
    }
  }

  // 4. 标签
  if (bookmark.tags && Array.isArray(bookmark.tags)) {
    for (const tag of bookmark.tags) {
      allTokens.push(...tokenize(tag));
    }
  }

  // 去重
  return [...new Set(allTokens)];
}

/**
 * 从 URL 提取关键词
 * - 域名: example.com → ["example", "com"]
 * - 路径段: /docs/react → ["docs", "react"]
 *
 * @param {string} url
 * @returns {string[]}
 */
export function tokenizeUrl(url) {
  const tokens = [];
  try {
    const parsed = new URL(url);

    // 域名分词 (去掉 www 前缀)
    let hostname = parsed.hostname.replace(/^www\./, '');
    const domainParts = hostname.split('.').filter(Boolean);
    for (const part of domainParts) {
      if (part.length > 1) {
        tokens.push(part.toLowerCase());
      }
    }

    // 路径分词
    const pathSegments = parsed.pathname.split('/').filter(s => s.length > 0);
    for (const seg of pathSegments) {
      // 拆分路径段中的连字符和下划线
      const parts = seg.split(/[-_]/).filter(s => s.length > 1);
      for (const p of parts) {
        tokens.push(p.toLowerCase());
      }
    }
  } catch {
    // 非法 URL，忽略
  }
  return tokens;
}
