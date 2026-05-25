/**
 * BookmarkTagger — 标签自动生成
 *
 * 基于书签的标题、URL、文件夹路径自动生成 3-5 个标签。
 * 支持中英文混合标签、标签去重/合并、全局频率统计。
 *
 * R157: 常量数据拆分至 bookmark-tagger-data.js (≤131 行)
 *
 * 标签生成规则:
 *   1. 域名标签: github.com → "github"
 *   2. 路径标签: /react/tutorial → "react", "tutorial"
 *   3. 标题分词: 按空格/标点分割，过滤停用词
 *   4. 技术关键词: 提取已知技术词汇
 *   5. 中文标签: 保留 2-4 字中文词组
 *
 * 纯前端实现，不依赖外部 API。
 */

import {
  ENGLISH_STOP_WORDS,
  CHINESE_STOP_WORDS,
  TECH_KEYWORDS,
  DOMAIN_TAG_MAP,
} from './bookmark-tagger-data.js';

// ==================== BookmarkTagger ====================

/** BookmarkTagger 类 */
export class BookmarkTagger {
  /**
   * @param {Array} bookmarks — 书签数组 {id, title, url, folderPath?, tags?}
   */
  constructor(bookmarks = []) {
    /** @type {Array} 书签列表 */
    this._bookmarks = Array.isArray(bookmarks) ? [...bookmarks] : [];
    /** @type {Map<string, Object>} id → bookmark 快速查找 */
    this._idMap = new Map();
    /** @type {Map<string, string[]>} bookmarkId → tags 缓存 */
    this._tagCache = new Map();
    /** @type {Map<string, string[]>} 全局标签映射 — tag → [bookmarkId, ...] */
    this._globalTagMap = new Map();

    for (const bm of this._bookmarks) {
      this._idMap.set(String(bm.id), bm);
    }
  }

  // ==================== 核心方法 ====================

  /**
   * 为单个书签生成 3-5 个标签
   * @param {Object} bookmark — {id, title, url, folderPath?, tags?}
   * @returns {string[]} 3-5 个去重后的标签
   */
  generateTags(bookmark) {
    if (!bookmark || typeof bookmark !== 'object') return [];

    const candidates = [];

    // 1. 域名标签
    const domainTag = this._extractDomainTag(bookmark.url);
    if (domainTag) candidates.push(domainTag);

    // 2. 路径标签
    const pathTags = this._extractPathTags(bookmark.url);
    candidates.push(...pathTags);

    // 3. 标题分词
    const titleTags = this._tokenizeTitle(bookmark.title);
    candidates.push(...titleTags);

    // 4. 技术关键词 (从标题 + URL 中提取)
    const techTags = this._extractTechKeywords(bookmark.title, bookmark.url);
    candidates.push(...techTags);

    // 5. 中文标签 (从标题 + 文件夹中提取)
    const chineseTags = this._extractChineseTags(bookmark.title, bookmark.folderPath);
    candidates.push(...chineseTags);

    // 6. 文件夹路径标签
    if (bookmark.folderPath && Array.isArray(bookmark.folderPath)) {
      for (const folder of bookmark.folderPath) {
        if (folder && typeof folder === 'string') {
          const folderTag = folder.trim().toLowerCase();
          if (folderTag && folderTag.length >= 2 && folderTag.length <= 20) {
            candidates.push(folderTag);
          }
        }
      }
    }

    // 去重 + 限制 3-5 个
    return this._finalizeTags(candidates);
  }

  /**
   * 为所有书签生成标签
   * @returns {Map<string, string[]>} Map<bookmarkId, tags[]>
   */
  generateAllTags() {
    const result = new Map();
    this._globalTagMap.clear();
    this._tagCache.clear();

    for (const bm of this._bookmarks) {
      const id = String(bm.id);
      const tags = this.generateTags(bm);
      result.set(id, tags);
      this._tagCache.set(id, tags);

      // 构建全局标签 → 书签映射
      for (const tag of tags) {
        if (!this._globalTagMap.has(tag)) {
          this._globalTagMap.set(tag, []);
        }
        this._globalTagMap.get(tag).push(id);
      }
    }

    return result;
  }

  /**
   * 获取全局标签频率
   * @returns {Map<string, number>} Map<tag, count>
   */
  getTagFrequency() {
    if (this._globalTagMap.size === 0) {
      this.generateAllTags();
    }

    const freq = new Map();
    for (const [tag, ids] of this._globalTagMap) {
      freq.set(tag, ids.length);
    }
    return freq;
  }

  /**
   * 获取热门标签
   * @param {number} [limit=10] — 返回数量
   * @returns {{tag: string, count: number}[]} 按频率降序
   */
  getPopularTags(limit = 10) {
    const freq = this.getTagFrequency();
    const arr = [];
    for (const [tag, count] of freq) {
      arr.push({ tag, count });
    }
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, limit);
  }

  /**
   * 合并两个标签: 将所有书签中的 oldTag 替换为 newTag，然后去重
   * @param {string} oldTag — 被合并的标签
   * @param {string} newTag — 保留的标签
   * @returns {number} 受影响的书签数
   */
  mergeTags(oldTag, newTag) {
    if (!oldTag || !newTag || oldTag === newTag) return 0;

    // 确保全局映射是最新的
    if (this._globalTagMap.size === 0) {
      this.generateAllTags();
    }

    const oldTagLower = String(oldTag).trim().toLowerCase();
    const newTagLower = String(newTag).trim().toLowerCase();

    if (!oldTagLower || !newTagLower || oldTagLower === newTagLower) return 0;

    const affectedIds = this._globalTagMap.get(oldTagLower) || [];
    let affectedCount = 0;

    for (const bmId of affectedIds) {
      const tags = this._tagCache.get(bmId);
      if (!tags) continue;

      const idx = tags.indexOf(oldTagLower);
      if (idx === -1) continue;

      // 替换
      tags[idx] = newTagLower;
      // 去重: 如果 newTag 已经存在，去掉重复
      const unique = [...new Set(tags)];
      this._tagCache.set(bmId, unique);
      affectedCount++;
    }

    // 更新全局映射
    const newTagIds = this._globalTagMap.get(newTagLower) || [];
    const mergedIds = [...new Set([...newTagIds, ...affectedIds])];
    this._globalTagMap.set(newTagLower, mergedIds);
    this._globalTagMap.delete(oldTagLower);

    return affectedCount;
  }

  /**
   * 按标签查找书签
   * @param {string} tag — 标签名
   * @returns {Object[]} 匹配的书签数组
   */
  getBookmarksByTag(tag) {
    if (!tag || typeof tag !== 'string') return [];

    if (this._globalTagMap.size === 0) {
      this.generateAllTags();
    }

    const tagLower = tag.trim().toLowerCase();
    const ids = this._globalTagMap.get(tagLower) || [];
    const bookmarks = [];
    for (const id of ids) {
      const bm = this._idMap.get(id);
      if (bm) bookmarks.push(bm);
    }
    return bookmarks;
  }

  // ==================== 内部: 标签提取策略 ====================

  /**
   * 域名标签提取
   * @param {string} url
   * @returns {string|null}
   */
  _extractDomainTag(url) {
    if (!url || typeof url !== 'string') return null;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

      // 优先匹配已知域名映射
      for (const [domain, tag] of Object.entries(DOMAIN_TAG_MAP)) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return tag;
        }
      }

      // 取主域名 (去掉 TLD)
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const mainDomain = parts[parts.length - 2];
        if (mainDomain && mainDomain.length >= 2 && !['com', 'org', 'net', 'io', 'dev', 'app', 'co'].includes(mainDomain)) {
          return mainDomain.toLowerCase();
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * URL 路径标签提取
   * @param {string} url
   * @returns {string[]}
   */
  _extractPathTags(url) {
    if (!url || typeof url !== 'string') return [];

    try {
      const parsed = new URL(url);
      const segments = parsed.pathname
        .split('/')
        .filter(s => s.length > 1 && s.length <= 20)
        .map(s => s.toLowerCase().replace(/\.(html?|php|asp|aspx|jsp)$/i, ''))
        .filter(s => s.length >= 2 && !/^\d+$/.test(s));

      // 只取有意义的前 2 个路径段
      return segments.slice(0, 2);
    } catch {
      return [];
    }
  }

  /**
   * 标题分词
   * @param {string} title
   * @returns {string[]}
   */
  _tokenizeTitle(title) {
    if (!title || typeof title !== 'string') return [];

    // 分离中英文，按空格/标点分割英文部分
    const tokens = title
      .replace(/([^\w\s一-鿿])/g, ' ') // 标点替换为空格
      .split(/\s+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length >= 2 && t.length <= 20)
      .filter(t => !ENGLISH_STOP_WORDS.has(t))
      .filter(t => !/^\d+$/.test(t)); // 过滤纯数字

    return tokens;
  }

  /**
   * 提取技术关键词
   * @param {string} title
   * @param {string} url
   * @returns {string[]}
   */
  _extractTechKeywords(title, url) {
    const combined = `${title || ''} ${url || ''}`.toLowerCase();
    const found = [];

    for (const keyword of TECH_KEYWORDS) {
      // 使用单词边界匹配
      const regex = new RegExp(`(?:^|[\\s_\\-/\\.])${this._escapeRegex(keyword)}(?:$|[\\s_\\-/\\.])`, 'i');
      if (regex.test(combined)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * 提取中文标签
   * @param {string} title
   * @param {string[]} folderPath
   * @returns {string[]}
   */
  _extractChineseTags(title, folderPath) {
    const source = [title || '', ...(folderPath || [])].join(' ');
    const tags = [];

    // 匹配 2-4 个连续中文字符的词组
    const matches = source.match(/[一-鿿]{2,4}/g) || [];
    for (const m of matches) {
      const word = m.trim();
      if (word.length >= 2 && word.length <= 4 && !CHINESE_STOP_WORDS.has(word)) {
        tags.push(word);
      }
    }

    return tags;
  }

  /**
   * 最终标签去重 + 排序 + 数量限制
   * @param {string[]} candidates
   * @returns {string[]} 3-5 个标签
   */
  _finalizeTags(candidates) {
    // 小写化 + 去重
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const lower = String(c).trim().toLowerCase();
      if (lower && lower.length >= 2 && !seen.has(lower)) {
        seen.add(lower);
        unique.push(lower);
      }
    }

    // 优先级排序: 技术关键词 > 域名 > 路径 > 中文 > 其他
    const priority = (tag) => {
      if (TECH_KEYWORDS.has(tag)) return 0;
      if (Object.values(DOMAIN_TAG_MAP).includes(tag)) return 1;
      return 2;
    };

    unique.sort((a, b) => priority(a) - priority(b));

    // 限制 3-5 个
    if (unique.length > 5) return unique.slice(0, 5);
    if (unique.length < 3 && unique.length > 0) return unique; // 不足 3 个也返回
    return unique;
  }

  /**
   * 正则转义
   * @param {string} str
   * @returns {string}
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
