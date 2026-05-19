/**
 * CacheManager — 统一缓存管理器
 *
 * R127: CachePerfUnify — 提取公共缓存层，替代各模块自实现的 LRU/TTL 缓存。
 *
 * 功能:
 *   - LRU (Least Recently Used) 淘汰策略
 *   - TTL (Time To Live) 过期机制
 *   - 模式失效 (invalidatePattern)
 *   - 标签失效 (invalidateByTag)
 *   - 缓存统计 (stats)
 *
 * 设计决策:
 *   - 基于 Map 的有序性实现 LRU（迭代序 = 插入序，访问时 delete+reinsert 刷新位置）
 *   - 惰性 TTL 清理（get/has 时检查过期，避免定时器开销）
 *   - 可选标签系统（tags 参数），支持按标签批量失效
 *   - 纯 ES Module，零外部依赖，不依赖 DOM / Chrome API
 *
 * @example
 *   // 基础 LRU 缓存
 *   const cache = new CacheManager({ maxSize: 100 });
 *   cache.set('key', value);
 *   cache.get('key');
 *
 * @example
 *   // LRU + TTL 缓存（查询缓存场景）
 *   const queryCache = new CacheManager({ maxSize: 50, ttlMs: 60_000 });
 *   queryCache.set('search:query', results, { tags: ['search'] });
 *   queryCache.invalidateByTag('search'); // 批量失效
 *
 * @example
 *   // 无 TTL 的纯 LRU（向量缓存场景）
 *   const vecCache = new CacheManager({ maxSize: 5000 });
 *   vecCache.set('bm-123', vectorData);
 */

export class CacheManager {
  /**
   * @param {Object}  [options]
   * @param {number}  [options.maxSize=100]  — 最大缓存条目数
   * @param {number}  [options.ttlMs=0]      — 条目存活时间（毫秒），0 表示永不过期
   */
  constructor(options = {}) {
    /** @type {number} */
    this.maxSize = options.maxSize ?? 100;
    /** @type {number} */
    this.ttlMs = options.ttlMs ?? 0;

    /** @type {Map<string, { value: any, expiresAt: number, tags: string[] }>} */
    this._store = new Map();

    /** @type {Map<string, Set<string>>} tag → set of keys */
    this._tagIndex = new Map();

    // 统计
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  /**
   * 获取缓存条目
   *
   * LRU: 命中时删除再重新插入，刷新访问顺序。
   * TTL: 超过 expiresAt 则惰性清除。
   *
   * @param {string} key
   * @returns {any} 缓存值，或 undefined（未命中/已过期）
   */
  get(key) {
    if (!this._store.has(key)) {
      this._misses++;
      return undefined;
    }

    const entry = this._store.get(key);

    // TTL 检查
    if (this.ttlMs > 0 && Date.now() > entry.expiresAt) {
      this._deleteEntry(key);
      this._misses++;
      return undefined;
    }

    // LRU: 删除并重新插入（Map 迭代序 = 插入序）
    this._store.delete(key);
    this._store.set(key, entry);

    this._hits++;
    return entry.value;
  }

  /**
   * 存入缓存条目
   *
   * @param {string}  key
   * @param {any}     value
   * @param {Object}  [options]
   * @param {string[]} [options.tags] — 可选标签列表，用于批量失效
   */
  set(key, value, options = {}) {
    // 如果已存在，先清理旧标签索引
    if (this._store.has(key)) {
      this._removeTagIndex(key);
      this._store.delete(key);
    } else if (this.maxSize <= 0) {
      this._evictions++;
      return;
    }

    // LRU 淘汰
    while (this._store.size >= this.maxSize) {
      const oldestKey = this._store.keys().next().value;
      this._deleteEntry(oldestKey);
      this._evictions++;
    }

    const expiresAt = this.ttlMs > 0 ? Date.now() + this.ttlMs : 0;
    const tags = options.tags || [];

    this._store.set(key, { value, expiresAt, tags });

    // 更新标签索引
    for (const tag of tags) {
      if (!this._tagIndex.has(tag)) {
        this._tagIndex.set(tag, new Set());
      }
      this._tagIndex.get(tag).add(key);
    }
  }

  /**
   * 删除缓存条目
   *
   * @param {string} key
   * @returns {boolean} 是否存在并被删除
   */
  delete(key) {
    if (!this._store.has(key)) return false;
    this._deleteEntry(key);
    return true;
  }

  /**
   * 检查键是否存在且未过期
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    if (!this._store.has(key)) return false;

    const entry = this._store.get(key);

    // TTL 检查
    if (this.ttlMs > 0 && Date.now() > entry.expiresAt) {
      this._deleteEntry(key);
      return false;
    }

    // LRU: 刷新访问顺序
    this._store.delete(key);
    this._store.set(key, entry);

    return true;
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this._store.clear();
    this._tagIndex.clear();
  }

  /**
   * 当前缓存条目数
   *
   * @returns {number}
   */
  size() {
    return this._store.size;
  }

  /**
   * 主动清理过期条目
   *
   * @returns {number} 被清理的条目数
   */
  evictExpired() {
    if (this.ttlMs <= 0) return 0;

    let evicted = 0;
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._deleteEntry(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * 按正则模式批量失效
   *
   * @param {RegExp} pattern — 匹配键的正则表达式
   * @returns {number} 被清除的条目数
   */
  invalidatePattern(pattern) {
    let removed = 0;
    for (const key of [...this._store.keys()]) {
      if (pattern.test(key)) {
        this._deleteEntry(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * 按标签批量失效
   *
   * @param {string} tag — 标签名
   * @returns {number} 被清除的条目数
   */
  invalidateByTag(tag) {
    const keys = this._tagIndex.get(tag);
    if (!keys || keys.size === 0) return 0;

    let removed = 0;
    for (const key of [...keys]) {
      if (this._store.has(key)) {
        this._deleteEntry(key);
        removed++;
      }
    }
    // 清理标签索引本身
    this._tagIndex.delete(tag);

    return removed;
  }

  /**
   * 缓存统计
   *
   * @returns {{ hits: number, misses: number, evictions: number, size: number, maxSize: number }}
   */
  stats() {
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      size: this._store.size,
      maxSize: this.maxSize,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 删除条目并清理标签索引
   *
   * @param {string} key
   * @private
   */
  _deleteEntry(key) {
    const entry = this._store.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        const tagKeys = this._tagIndex.get(tag);
        if (tagKeys) {
          tagKeys.delete(key);
          if (tagKeys.size === 0) {
            this._tagIndex.delete(tag);
          }
        }
      }
    }
    this._store.delete(key);
  }

  /**
   * 仅清除标签索引（用于 set 时覆盖旧条目前的清理）
   *
   * @param {string} key
   * @private
   */
  _removeTagIndex(key) {
    const entry = this._store.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        const tagKeys = this._tagIndex.get(tag);
        if (tagKeys) {
          tagKeys.delete(key);
          if (tagKeys.size === 0) {
            this._tagIndex.delete(tag);
          }
        }
      }
    }
  }
}
