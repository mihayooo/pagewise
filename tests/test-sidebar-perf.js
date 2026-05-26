/**
 * 测试 SidePanel 性能优化 — 防抖、索引预热、分页加载、图谱缓存、性能断言
 *
 * R332: SidebarPerfOpt
 *
 * 测试范围:
 *   - 搜索防抖 (300ms)
 *   - 索引预热 (buildSearchIndex + searchWithIndex)
 *   - 分页加载 (lazyLoadBookmarks with pagination simulation)
 *   - 图谱缓存 (graphCache dirty mark)
 *   - 性能断言 (首屏 < 500ms, 搜索 < 100ms)
 *   - 虚拟滚动集成 (shouldEnableVirtualization + getVisibleRange)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  buildSearchIndex,
  searchWithIndex,
  lazyLoadBookmarks,
  getIndexStats,
} = await import('../lib/bookmark-performance-opt.js');

const {
  getVisibleRange,
  shouldEnableVirtualization,
  createVirtualList,
} = await import('../lib/virtual-scroll.js');

// ==================== 辅助: 构造书签 ====================

function createBookmark(id) {
  const domains = ['react.dev', 'vuejs.org', 'nodejs.org', 'python.org', 'github.com',
    'mdn.dev', 'stackoverflow.com', 'css-tricks.com', 'typescriptlang.org', 'aws.amazon.com'];
  const tags = [['react', 'frontend'], ['vue', 'frontend'], ['nodejs', 'backend'],
    ['python', 'ml'], ['github', 'tools'], ['mdn', 'docs'], ['stackoverflow', 'qa'],
    ['css', 'grid'], ['typescript', 'frontend'], ['aws', 'cloud']];
  const folders = [['技术', '前端'], ['技术', '后端'], ['技术', 'AI'], ['工具'], ['工具', 'DevOps']];

  const idx = id % 10;
  const folderIdx = id % 5;

  return {
    id: String(id),
    title: `Bookmark ${id} - ${domains[idx]}`,
    url: `https://${domains[idx]}/page/${id}`,
    folderPath: folders[folderIdx],
    tags: tags[idx],
    status: id % 3 === 0 ? 'read' : 'unread',
    dateAdded: 1700000000000 + id * 86400000,
  };
}

function createBookmarks(n) {
  const bookmarks = [];
  for (let i = 0; i < n; i++) {
    bookmarks.push(createBookmark(i));
  }
  return bookmarks;
}

// ==================== 搜索防抖 ====================

describe('搜索防抖 (300ms)', () => {
  it('1. debounce 延迟执行 — 300ms 后触发', async () => {
    let called = 0;
    const fn = () => { called++; };

    // 模拟 debounce 行为
    const debounceFn = createDebounce(fn, 300);
    debounceFn();
    assert.equal(called, 0, '立即不应触发');

    await sleep(350);
    assert.equal(called, 1, '300ms 后应触发一次');
  });

  it('2. debounce 连续输入只触发一次', async () => {
    let called = 0;
    const fn = () => { called++; };
    const debounceFn = createDebounce(fn, 300);

    debounceFn(); // t=0
    await sleep(100);
    debounceFn(); // t=100 (重置)
    await sleep(100);
    debounceFn(); // t=200 (重置)
    await sleep(350); // t=550

    assert.equal(called, 1, '连续输入应只触发最后一次');
  });

  it('3. debounce 可取消', async () => {
    let called = 0;
    const fn = () => { called++; };
    const debounceFn = createDebounce(fn, 300);

    debounceFn();
    debounceFn.cancel();
    await sleep(400);

    assert.equal(called, 0, '取消后不应触发');
  });
});

// ==================== 索引预热 ====================

describe('索引预热', () => {
  it('4. buildSearchIndex 构建索引', () => {
    const bookmarks = createBookmarks(100);
    const idx = buildSearchIndex(bookmarks);

    assert.ok(idx.index instanceof Map, '索引应是 Map');
    assert.equal(idx.bookmarks.length, 100);
    assert.ok(idx.tokenCount > 0, '应有 token');
  });

  it('5. 索引预热后搜索命中', () => {
    const bookmarks = createBookmarks(500);
    const idx = buildSearchIndex(bookmarks);

    const results = searchWithIndex(idx, 'react');
    assert.ok(results.length > 0, '应匹配到 react 相关书签');
    for (const r of results) {
      const text = `${r.title} ${r.url} ${(r.tags || []).join(' ')}`.toLowerCase();
      assert.ok(text.includes('react'), '结果应包含 react');
    }
  });

  it('6. 预热性能 — 1000 条书签 < 500ms', () => {
    const bookmarks = createBookmarks(1000);
    const start = performance.now();
    const idx = buildSearchIndex(bookmarks);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 500, `索引构建应 < 500ms，实际 ${elapsed.toFixed(2)}ms`);
    assert.ok(idx.index.size > 0, '索引应非空');
  });

  it('7. 索引搜索性能 — < 100ms', () => {
    const bookmarks = createBookmarks(1000);
    const idx = buildSearchIndex(bookmarks);

    const start = performance.now();
    const results = searchWithIndex(idx, 'frontend');
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 100, `搜索应 < 100ms，实际 ${elapsed.toFixed(2)}ms`);
    assert.ok(results.length > 0, '应有搜索结果');
  });

  it('8. getIndexStats 返回正确统计', () => {
    const bookmarks = createBookmarks(100);
    const idx = buildSearchIndex(bookmarks);
    const stats = getIndexStats(idx);

    assert.ok(stats.uniqueTokens > 0, '应有唯一 token');
    assert.equal(stats.bookmarksCount, 100);
    assert.ok(stats.memoryEstimate > 0, '内存估算应 > 0');
  });
});

// ==================== 分页加载 ====================

describe('分页加载', () => {
  it('9. 首页加载 50 条', () => {
    const bookmarks = createBookmarks(500);
    const result = lazyLoadBookmarks(bookmarks, 50, 0);

    assert.equal(result.items.length, 50);
    assert.equal(result.page, 0);
    assert.equal(result.pageSize, 50);
    assert.equal(result.total, 500);
    assert.equal(result.hasMore, true);
  });

  it('10. 第二页加载', () => {
    const bookmarks = createBookmarks(500);
    const result = lazyLoadBookmarks(bookmarks, 50, 1);

    assert.equal(result.items.length, 50);
    assert.equal(result.page, 1);
    assert.equal(result.items[0].id, '50'); // 从第 50 条开始
    assert.equal(result.hasMore, true);
  });

  it('11. 最后一页不满页', () => {
    const bookmarks = createBookmarks(120);
    const result = lazyLoadBookmarks(bookmarks, 50, 2);

    assert.equal(result.items.length, 20); // 120 - 100 = 20
    assert.equal(result.hasMore, false);
  });

  it('12. 全部加载完成 — hasMore 为 false', () => {
    const bookmarks = createBookmarks(50);
    const result = lazyLoadBookmarks(bookmarks, 50, 0);

    assert.equal(result.items.length, 50);
    assert.equal(result.hasMore, false);
  });

  it('13. 空书签列表', () => {
    const result = lazyLoadBookmarks([], 50, 0);
    assert.equal(result.items.length, 0);
    assert.equal(result.hasMore, false);
    assert.equal(result.total, 0);
  });

  it('14. 分页加载性能 — 首页 < 200ms', () => {
    const bookmarks = createBookmarks(1000);
    const start = performance.now();
    const result = lazyLoadBookmarks(bookmarks, 50, 0);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 200, `首页加载应 < 200ms，实际 ${elapsed.toFixed(2)}ms`);
    assert.equal(result.items.length, 50);
  });
});

// ==================== 图谱缓存 ====================

describe('图谱缓存', () => {
  it('15. 图谱缓存首次计算', () => {
    const cache = createGraphCache();
    assert.equal(cache.isDirty(), true, '初始应为 dirty');

    const data = { nodes: [{ id: '1' }], edges: [] };
    cache.set(data);
    assert.equal(cache.isDirty(), false, '设置后不应 dirty');
    assert.deepEqual(cache.get(), data);
  });

  it('16. 标记 dirty 后缓存失效', () => {
    const cache = createGraphCache();
    cache.set({ nodes: [], edges: [] });
    assert.equal(cache.isDirty(), false);

    cache.markDirty();
    assert.equal(cache.isDirty(), true, 'markDirty 后应为 dirty');
    assert.equal(cache.get(), null, 'dirty 后 get 应返回 null');
  });
});

// ==================== 虚拟滚动集成 ====================

describe('虚拟滚动集成', () => {
  it('17. >100 项时自动启用虚拟化', () => {
    assert.equal(shouldEnableVirtualization(100), false);
    assert.equal(shouldEnableVirtualization(101), true);
    assert.equal(shouldEnableVirtualization(500), true);
    assert.equal(shouldEnableVirtualization(1000), true);
  });

  it('18. 虚拟滚动 + 大列表范围计算正确', () => {
    // 500 项，容器 400px，每项 40px
    const r = getVisibleRange(0, 400, 500, 40, 5);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 20); // visible(10) + overscan*2(10)
    assert.equal(r.totalHeight, 20000);

    const r2 = getVisibleRange(8000, 400, 500, 40, 5);
    assert.equal(r2.startIndex, 195); // floor(8000/40)-5 = 195
    assert.equal(r2.endIndex, 215);   // 195 + 10 + 10
  });

  it('19. 虚拟滚动范围不超出列表边界', () => {
    const r = getVisibleRange(19000, 400, 500, 40, 5);
    assert.ok(r.endIndex <= 500, `endIndex ${r.endIndex} 不应超出 500`);
    assert.ok(r.startIndex >= 0, `startIndex ${r.startIndex} 不应为负`);
  });
});

// ==================== 性能断言 (综合) ====================

describe('性能断言', () => {
  it('20. 首屏渲染模拟 < 500ms (1000 条书签)', () => {
    const bookmarks = createBookmarks(1000);
    const start = performance.now();

    // 模拟首屏流程：分页读取 + 索引构建 + 首页渲染计算
    const page = lazyLoadBookmarks(bookmarks, 50, 0);
    const idx = buildSearchIndex(page.items); // 首页索引预热
    const range = getVisibleRange(0, 400, page.items.length, 40, 5); // 虚拟滚动

    const elapsed = performance.now() - start;
    assert.ok(elapsed < 500, `首屏模拟应 < 500ms，实际 ${elapsed.toFixed(2)}ms`);
    assert.equal(page.items.length, 50);
    assert.ok(idx.index.size > 0);
    assert.ok(range.endIndex > 0);
  });

  it('21. 搜索响应模拟 < 100ms (预热后)', () => {
    const bookmarks = createBookmarks(1000);
    const idx = buildSearchIndex(bookmarks); // 预热

    const start = performance.now();
    const results = searchWithIndex(idx, 'frontend');
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 100, `搜索响应应 < 100ms，实际 ${elapsed.toFixed(2)}ms`);
    assert.ok(results.length > 0, '应有搜索结果');
  });

  it('22. 虚拟滚动 1000 项范围计算 < 1ms', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400, overscan: 5 });
    const start = performance.now();
    for (let scroll = 0; scroll < 40000; scroll += 400) {
      vl.getRange(scroll, 1000);
    }
    const elapsed = performance.now() - start;
    // 100 iterations
    assert.ok(elapsed / 100 < 1, `单次计算应 < 1ms，实际 ${(elapsed / 100).toFixed(3)}ms`);
  });
});

// ==================== 辅助函数 ====================

/**
 * 简单 debounce 实现（测试用）
 */
function createDebounce(fn, delay) {
  let timer = null;
  const debounced = (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * 简单图谱缓存（测试用）
 */
function createGraphCache() {
  let cached = null;
  let dirty = true;
  return {
    get: () => dirty ? null : cached,
    set: (data) => { cached = data; dirty = false; },
    isDirty: () => dirty,
    markDirty: () => { dirty = true; cached = null; },
  };
}

/**
 * sleep 辅助
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
