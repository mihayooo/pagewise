/**
 * VirtualScroll — 通用虚拟滚动计算引擎
 *
 * R332: SidePanel 启动与渲染性能优化 (SidebarPerfOpt)
 *
 * 纯逻辑模块，零 DOM 依赖。提供独立的虚拟滚动计算层：
 *   - getVisibleRange(scrollTop, containerHeight, totalItems, itemHeight, overscan)
 *   - shouldEnableVirtualization(itemCount, threshold)
 *   - createVirtualList(options)
 *
 * 支持固定高度和动态高度两种模式：
 *   - 固定高度: 统一 itemHeight，计算 O(1)
 *   - 动态高度: 接受 getItemHeight(index) 回调，维护高度缓存
 *
 * 设计约束:
 *   - 纯 ES Module，零外部依赖
 *   - 不直接操作 DOM
 *   - 区别于 bookmark-performance-opt.js 的 createVirtualScroller（绑定容器元素）
 *
 * @module lib/virtual-scroll
 */

// ==================== 核心计算函数 ====================

/**
 * 计算可见范围
 *
 * @param {number} scrollTop       — 当前滚动偏移 (px)
 * @param {number} containerHeight — 可视容器高度 (px)
 * @param {number} totalItems      — 总数据项数
 * @param {number} itemHeight      — 每项固定高度 (px)
 * @param {number} [overscan=5]    — 上下缓冲项数
 * @returns {{ startIndex: number, endIndex: number, offsetY: number, totalHeight: number }}
 */
export function getVisibleRange(scrollTop, containerHeight, totalItems, itemHeight, overscan = 5) {
  if (totalItems <= 0 || itemHeight <= 0 || containerHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const totalHeight = totalItems * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  let startIndex = Math.floor(scrollTop / itemHeight) - overscan;
  startIndex = Math.max(0, startIndex);

  let endIndex = startIndex + visibleCount + overscan * 2;
  endIndex = Math.min(totalItems, endIndex);

  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, offsetY, totalHeight };
}

/**
 * 判断是否应启用虚拟化
 *
 * @param {number}  itemCount        — 当前数据项数
 * @param {number}  [threshold=100]  — 启用虚拟化的阈值
 * @returns {boolean}
 */
export function shouldEnableVirtualization(itemCount, threshold = 100) {
  if (typeof itemCount !== 'number' || itemCount < 0) return false;
  if (typeof threshold !== 'number' || threshold <= 0) return false;
  return itemCount > threshold;
}

// ==================== 虚拟列表实例 ====================

/**
 * 创建虚拟列表实例
 *
 * @param {Object}   options
 * @param {number}   options.itemHeight       — 每项固定高度 (px)
 * @param {number}   [options.containerHeight=600] — 容器高度 (px)
 * @param {number}   [options.overscan=5]     — 上下缓冲项数
 * @param {number}   [options.threshold=100]  — 虚拟化启用阈值
 * @param {Function} [options.getItemHeight]  — 动态高度回调 (index) => number
 * @returns {Object} 虚拟列表实例
 */
export function createVirtualList(options = {}) {
  const {
    itemHeight = 40,
    containerHeight = 600,
    overscan = 5,
    threshold = 100,
    getItemHeight = null,
  } = options;

  /** @type {Map<number, number>} 动态高度缓存 */
  const heightCache = new Map();

  /** @type {number[]} 前缀和数组 (动态高度模式) */
  let prefixSums = null;

  /** @type {number} 缓存的总高度 */
  let cachedTotalHeight = 0;

  /** @type {number} 缓存的总项数 */
  let cachedTotalItems = 0;

  /** @type {boolean} 是否脏数据需重建 */
  let dirty = true;

  /**
   * 动态高度模式：重建前缀和
   * @param {number} totalItems
   */
  function _rebuildPrefixSums(totalItems) {
    prefixSums = new Array(totalItems + 1);
    prefixSums[0] = 0;
    for (let i = 0; i < totalItems; i++) {
      let h = heightCache.get(i);
      if (h === undefined && typeof getItemHeight === 'function') {
        h = getItemHeight(i);
        if (typeof h !== 'number' || h <= 0) h = itemHeight;
        heightCache.set(i, h);
      }
      if (h === undefined) h = itemHeight;
      prefixSums[i + 1] = prefixSums[i] + h;
    }
    cachedTotalHeight = prefixSums[totalItems];
    cachedTotalItems = totalItems;
    dirty = false;
  }

  /**
   * 动态高度模式：二分查找滚动位置对应的起始索引
   * @param {number} scrollTop
   * @returns {number}
   */
  function _binarySearch(scrollTop) {
    if (!prefixSums || prefixSums.length <= 1) return 0;
    let lo = 0;
    let hi = prefixSums.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (prefixSums[mid] <= scrollTop) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return Math.max(0, lo - 1);
  }

  /**
   * 计算可见范围
   *
   * @param {number} scrollTop  — 当前滚动偏移 (px)
   * @param {number} totalItems — 总数据项数
   * @returns {{ startIndex: number, endIndex: number, offsetY: number, totalHeight: number }}
   */
  function getRange(scrollTop, totalItems) {
    if (totalItems <= 0) {
      return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
    }

    // 是否启用虚拟化
    if (!shouldEnableVirtualization(totalItems, threshold)) {
      return {
        startIndex: 0,
        endIndex: totalItems,
        offsetY: 0,
        totalHeight: totalItems * itemHeight,
      };
    }

    // 动态高度模式
    if (typeof getItemHeight === 'function') {
      if (dirty || cachedTotalItems !== totalItems) {
        _rebuildPrefixSums(totalItems);
      }

      const startIdx = _binarySearch(scrollTop - overscan * itemHeight);
      const startIndex = Math.max(0, startIdx);

      // 找 endIndex：累计高度 >= scrollTop + containerHeight + overscan * itemHeight
      let endIndex = startIndex;
      const targetBottom = scrollTop + containerHeight + overscan * itemHeight;
      while (endIndex < totalItems && prefixSums[endIndex + 1] <= targetBottom) {
        endIndex++;
      }
      endIndex = Math.min(totalItems, endIndex + 1);

      return {
        startIndex,
        endIndex,
        offsetY: prefixSums[startIndex],
        totalHeight: cachedTotalHeight,
      };
    }

    // 固定高度模式
    return getVisibleRange(scrollTop, containerHeight, totalItems, itemHeight, overscan);
  }

  /**
   * 标记缓存为脏（数据变更后调用）
   */
  function markDirty() {
    dirty = true;
    heightCache.clear();
    prefixSums = null;
  }

  /**
   * 获取实例度量信息
   * @param {number} totalItems
   * @returns {Object}
   */
  function getMetrics(totalItems) {
    return {
      itemHeight,
      containerHeight,
      overscan,
      threshold,
      virtualized: shouldEnableVirtualization(totalItems, threshold),
      totalItems,
      dynamicHeight: typeof getItemHeight === 'function',
      cacheSize: heightCache.size,
    };
  }

  return {
    getRange,
    markDirty,
    getMetrics,
    shouldEnableVirtualization: (n) => shouldEnableVirtualization(n, threshold),
  };
}
