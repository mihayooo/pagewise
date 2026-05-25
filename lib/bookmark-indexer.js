/**
 * BookmarkIndexer — 书签索引器
 *
 * 对书签建立倒排索引，支持中英文混合分词的快速搜索。
 * 1000 条书签索引构建 < 3 秒，搜索响应 < 100ms。
 *
 * 索引策略:
 *   - title: 中英文混合分词 (中文逐字 + 英文空格/标点分词)
 *   - url: 提取域名关键词 + 路径段
 *   - folderPath: 层级索引 (每个层级独立索引)
 *   - 倒排索引: token → Set<bookmarkId>
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string}   [folder]     — 按文件夹名称过滤
 * @property {string[]} [tags]       — 按标签过滤 (匹配 bookmark.tags)
 * @property {number}   [limit]      — 最大返回数量 (默认 50)
 */

/**
 * @typedef {Object} SearchResult
 * @property {string}   id       — 书签 ID
 * @property {number}   score    — 匹配分数 (越高越相关)
 * @property {Object}   bookmark — 原始书签对象
 */

import { tokenize, extractTokens, tokenizeUrl } from './bookmark-indexer-tokenizer.js';

/** BookmarkIndexer 类 */
export class BookmarkIndexer {
  constructor() {
    /** @type {Map<string, Set<string>>} token → Set<bookmarkId> */
    this._invertedIndex = new Map();
    /** @type {Map<string, Object>} bookmarkId → bookmark object */
    this._bookmarkStore = new Map();
    /** @type {Map<string, Set<string>>} folderPath → Set<bookmarkId> */
    this._folderIndex = new Map();
  }

  // ==================== 核心方法 ====================

  /**
   * 对书签数组批量建立索引
   * @param {Object[]} bookmarks — 标准化书签数组
   */
  buildIndex(bookmarks) {
    this._invertedIndex.clear();
    this._bookmarkStore.clear();
    this._folderIndex.clear();

    if (!Array.isArray(bookmarks)) return;

    for (const bookmark of bookmarks) {
      this.addBookmark(bookmark);
    }
  }

  /**
   * 搜索书签
   * @param {string} query — 搜索关键词 (多词用空格分隔)
   * @param {SearchOptions} [options] — 搜索选项
   * @returns {SearchResult[]} 按匹配度排序的结果
   */
  search(query, options = {}) {
    if (!query || typeof query !== 'string') return [];

    const { folder, tags, limit = 50 } = options;
    const tokens = this._tokenize(query.trim());

    if (tokens.length === 0) return [];

    // 收集每个 token 匹配的书签 ID 集合 (AND 逻辑)
    let candidateIds = null;

    for (const token of tokens) {
      const matchedIds = this._invertedIndex.get(token);
      if (!matchedIds) {
        // 任一 token 无匹配 → 无结果
        return [];
      }

      if (candidateIds === null) {
        // 首次: 复制一份
        candidateIds = new Set(matchedIds);
      } else {
        // AND 交集
        const intersection = new Set();
        for (const id of candidateIds) {
          if (matchedIds.has(id)) {
            intersection.add(id);
          }
        }
        candidateIds = intersection;
      }

      if (candidateIds.size === 0) return [];
    }

    if (candidateIds === null) return [];

    // 计算匹配分数
    let results = [];
    for (const id of candidateIds) {
      const bookmark = this._bookmarkStore.get(id);
      if (!bookmark) continue;

      // 文件夹过滤
      if (folder && !this._matchesFolder(bookmark, folder)) continue;

      // 标签过滤
      if (tags && tags.length > 0 && !this._matchesTags(bookmark, tags)) continue;

      const score = this._computeScore(bookmark, tokens);
      results.push({ id, score, bookmark });
    }

    // 按分数降序排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 增量添加书签到索引
   * @param {Object} bookmark — 标准化书签对象
   */
  addBookmark(bookmark) {
    if (!bookmark || !bookmark.id) return;

    const id = String(bookmark.id);

    // 存储书签
    this._bookmarkStore.set(id, bookmark);

    // 提取所有 token 并加入倒排索引
    const tokens = this._extractTokens(bookmark);
    for (const token of tokens) {
      let entry = this._invertedIndex.get(token);
      if (!entry) {
        entry = new Set();
        this._invertedIndex.set(token, entry);
      }
      entry.add(id);
    }

    // 文件夹索引
    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      const folderKey = bookmark.folderPath.join('/');
      if (folderKey) {
        let folderSet = this._folderIndex.get(folderKey);
        if (!folderSet) {
          folderSet = new Set();
          this._folderIndex.set(folderKey, folderSet);
        }
        folderSet.add(id);
      }
    }
  }

  /**
   * 从索引移除书签
   * @param {string} id — 书签 ID
   * @returns {boolean} 是否成功移除
   */
  removeBookmark(id) {
    const strId = String(id);

    if (!this._bookmarkStore.has(strId)) return false;

    const bookmark = this._bookmarkStore.get(strId);

    // 从倒排索引中移除
    const tokens = this._extractTokens(bookmark);
    for (const token of tokens) {
      const entry = this._invertedIndex.get(token);
      if (entry) {
        entry.delete(strId);
        if (entry.size === 0) {
          this._invertedIndex.delete(token);
        }
      }
    }

    // 从文件夹索引中移除
    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      const folderKey = bookmark.folderPath.join('/');
      if (folderKey) {
        const folderSet = this._folderIndex.get(folderKey);
        if (folderSet) {
          folderSet.delete(strId);
          if (folderSet.size === 0) {
            this._folderIndex.delete(folderKey);
          }
        }
      }
    }

    // 从存储中移除
    this._bookmarkStore.delete(strId);

    return true;
  }

  /**
   * 返回索引大小
   * @returns {{ bookmarks: number, tokens: number, folders: number }}
   */
  getSize() {
    return {
      bookmarks: this._bookmarkStore.size,
      tokens: this._invertedIndex.size,
      folders: this._folderIndex.size,
    };
  }

  // ==================== 分词（委托 bookmark-indexer-tokenizer.js） ====================

  /**
   * 中英文混合分词（委托独立分词模块）
   * @param {string} text
   * @returns {string[]}
   */
  _tokenize(text) {
    return tokenize(text);
  }

  /**
   * 从书签中提取所有可索引 token（委托独立分词模块）
   * @param {Object} bookmark
   * @returns {string[]}
   */
  _extractTokens(bookmark) {
    return extractTokens(bookmark);
  }

  /**
   * 从 URL 提取关键词（委托独立分词模块）
   * @param {string} url
   * @returns {string[]}
   */
  _tokenizeUrl(url) {
    return tokenizeUrl(url);
  }

  // ==================== 评分 ====================

  /**
   * 计算书签与搜索词的匹配分数
   *
   * 评分规则:
   *   - title 精确匹配 token: +10 per match
   *   - title 包含 bigram: +5 per match
   *   - url 域名匹配: +3 per match
   *   - folderPath 匹配: +2 per match
   *
   * @param {Object} bookmark
   * @param {string[]} queryTokens
   * @returns {number}
   */
  _computeScore(bookmark, queryTokens) {
    let score = 0;

    const titleTokens = bookmark.title ? this._tokenize(bookmark.title) : [];
    const titleText = bookmark.title ? bookmark.title.toLowerCase() : '';
    const urlTokens = bookmark.url ? this._tokenizeUrl(bookmark.url) : [];
    const folderTokens = [];
    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      for (const f of bookmark.folderPath) {
        folderTokens.push(...this._tokenize(f));
      }
    }

    for (const qt of queryTokens) {
      // title token 匹配
      if (titleTokens.includes(qt)) {
        score += 10;
      }

      // title 全文包含 (中文子串)
      if (titleText.includes(qt)) {
        score += 5;
      }

      // url 域名/路径匹配
      if (urlTokens.includes(qt)) {
        score += 3;
      }

      // 文件夹匹配
      if (folderTokens.includes(qt)) {
        score += 2;
      }
    }

    return score;
  }

  // ==================== 过滤辅助 ====================

  /**
   * 检查书签是否匹配文件夹过滤条件
   * @param {Object} bookmark
   * @param {string} folder — 文件夹关键词
   * @returns {boolean}
   */
  _matchesFolder(bookmark, folder) {
    if (!bookmark.folderPath || !Array.isArray(bookmark.folderPath)) return false;
    const folderLower = folder.toLowerCase();
    return bookmark.folderPath.some(f => f.toLowerCase().includes(folderLower));
  }

  /**
   * 检查书签是否匹配标签过滤条件
   * @param {Object} bookmark
   * @param {string[]} tags — 要求匹配的标签数组
   * @returns {boolean}
   */
  _matchesTags(bookmark, tags) {
    if (!bookmark.tags || !Array.isArray(bookmark.tags)) return false;
    const bmTags = new Set(bookmark.tags.map(t => t.toLowerCase()));
    return tags.every(t => bmTags.has(t.toLowerCase()));
  }
}
