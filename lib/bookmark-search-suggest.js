/**
 * Bookmark Search — 搜索建议与工具方法
 * 从 bookmark-search.js 拆分
 *
 * @module lib/bookmark-search-suggest
 */

/**
 * 搜索建议 — 基于已有标签 + 热门搜索
 *
 * @param {string} partial — 用户输入的部分文本
 * @returns {string[]} 建议列表
 */
export function getSearchSuggestions(partial) {
  if (!partial || typeof partial !== 'string') return [];

  const lower = partial.toLowerCase().trim();
  if (lower.length === 0) return [];

  const suggestions = [];

  // 1. 基于标签
  for (const tag of this._knownTags) {
    if (tag.toLowerCase().includes(lower) && !suggestions.includes(tag)) {
      suggestions.push(tag);
    }
  }

  // 2. 基于热门搜索
  const sorted = [...this._searchHistory.entries()]
    .sort((a, b) => b[1] - a[1]);

  for (const [query] of sorted) {
    if (query.toLowerCase().includes(lower) && !suggestions.includes(query)) {
      suggestions.push(query);
    }
  }

  // 3. 基于书签标题 (从图谱节点)
  const graphData = this._graphEngine.getGraphData();
  for (const node of graphData.nodes) {
    const title = node.label || '';
    if (title.toLowerCase().includes(lower) && !suggestions.includes(title)) {
      suggestions.push(title);
    }
  }

  return suggestions.slice(0, 10);
}

/**
 * getSuggestions — getSearchSuggestions 的别名
 * @param {string} partial
 * @returns {string[]}
 */
export function getSuggestions(partial) {
  return this.getSearchSuggestions(partial);
}

/**
 * 注册已知标签 (用于搜索建议)
 * @param {string[]} tags
 */
export function setKnownTags(tags) {
  if (Array.isArray(tags)) {
    this._knownTags = [...new Set(tags)];
  }
}

/**
 * 防抖版搜索建议
 *
 * @param {string}   partial  — 输入文本
 * @param {Function} callback — 回调函数 (suggestions: string[]) => void
 */
export function getSearchSuggestionsDebounced(partial, callback) {
  if (this._debounceTimer !== null) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
  }

  this._debounceTimer = setTimeout(() => {
    this._debounceTimer = null;
    const results = this.getSearchSuggestions(partial);
    callback(results);
  }, this._debounceDelay);
}

/**
 * 获取搜索统计
 * @returns {{ totalBookmarks: number, totalTokens: number, searchHistorySize: number, knownTagsCount: number }}
 */
export function getStats() {
  const size = this._indexer.getSize();
  return {
    totalBookmarks: size.bookmarks,
    totalTokens: size.tokens,
    searchHistorySize: this._searchHistory.size,
    knownTagsCount: this._knownTags.length,
  };
}

/**
 * 记录搜索历史
 * @param {string} query
 */
export function _recordSearch(query) {
  const normalized = query.toLowerCase().trim();
  const count = this._searchHistory.get(normalized) || 0;
  this._searchHistory.set(normalized, count + 1);
}

/**
 * 计算高亮 token
 * @param {Object}   bookmark
 * @param {string[]} queryTokens
 * @returns {string[]}
 */
export function _computeHighlights(bookmark, queryTokens) {
  const highlights = [];
  const titleTokens = this._tokenize(bookmark.title || '');

  for (const qt of queryTokens) {
    if (titleTokens.includes(qt)) {
      highlights.push(qt);
    }
  }

  return highlights;
}

/**
 * 中英文混合分词
 * @param {string} text
 * @returns {string[]}
 */
export function _tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const tokens = [];
  const segments = text.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];
  for (const seg of segments) {
    if (/[一-鿿]/.test(seg)) {
      for (const char of seg) {
        tokens.push(char);
      }
    } else if (/[a-zA-Z]/.test(seg)) {
      tokens.push(seg.toLowerCase());
    } else {
      tokens.push(seg);
    }
  }
  return tokens;
}

/**
 * 检查书签是否匹配文件夹条件
 * @param {Object} bookmark
 * @param {string} folder
 * @returns {boolean}
 */
export function _matchesFolder(bookmark, folder) {
  if (!bookmark.folderPath || !Array.isArray(bookmark.folderPath)) return false;
  const folderLower = folder.toLowerCase();
  return bookmark.folderPath.some(f => f.toLowerCase().includes(folderLower));
}

/**
 * 检查书签是否匹配标签条件
 * @param {Object}   bookmark
 * @param {string[]} tags
 * @returns {boolean}
 */
export function _matchesTags(bookmark, tags) {
  if (!bookmark.tags || !Array.isArray(bookmark.tags)) return false;
  const bmTags = new Set(bookmark.tags.map(t => t.toLowerCase()));
  return tags.every(t => bmTags.has(t.toLowerCase()));
}

/**
 * 检查书签是否匹配域名条件
 * @param {Object} bookmark
 * @param {string} domain
 * @returns {boolean}
 */
export function _matchesDomain(bookmark, domain) {
  if (!bookmark.url) return false;
  try {
    const bmDomain = new URL(bookmark.url).hostname.replace(/^www\./, '').toLowerCase();
    return bmDomain.includes(domain.toLowerCase());
  } catch (e) { console.warn('[SearchSuggest]', e?.message || e);
    return false;
  }
}
