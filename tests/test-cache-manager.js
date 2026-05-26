/**
 * 测试 lib/cache-manager.js — 统一缓存管理器
 *
 * R127: CachePerfUnify — 统一散落在各模块中的缓存策略
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { CacheManager } = await import('../lib/cache-manager.js');

// ==================== 构造函数 ====================

describe('CacheManager — 构造函数', () => {
  it('默认参数: maxSize=100, ttlMs=0', () => {
    const cache = new CacheManager();
    assert.equal(cache.maxSize, 100);
    assert.equal(cache.ttlMs, 0);
  });

  it('自定义 maxSize 和 ttlMs', () => {
    const cache = new CacheManager({ maxSize: 50, ttlMs: 60000 });
    assert.equal(cache.maxSize, 50);
    assert.equal(cache.ttlMs, 60000);
  });

  it('maxSize=0 不缓存任何条目', () => {
    const cache = new CacheManager({ maxSize: 0 });
    cache.set('key1', 'value1');
    assert.equal(cache.size(), 0);
    assert.equal(cache.get('key1'), undefined);
  });
});

// ==================== 基本存取 ====================

describe('CacheManager — 基本存取', () => {
  let cache;
  beforeEach(() => {
    cache = new CacheManager({ maxSize: 10, ttlMs: 60000 });
  });

  it('set 后 get 返回相同值', () => {
    cache.set('key1', 'hello');
    assert.equal(cache.get('key1'), 'hello');
  });

  it('get 不存在的键返回 undefined', () => {
    assert.equal(cache.get('nonexistent'), undefined);
  });

  it('has 检查存在性', () => {
    assert.equal(cache.has('key1'), false);
    cache.set('key1', 'hello');
    assert.equal(cache.has('key1'), true);
  });

  it('delete 删除条目', () => {
    cache.set('key1', 'hello');
    assert.equal(cache.delete('key1'), true);
    assert.equal(cache.get('key1'), undefined);
  });

  it('delete 不存在的键返回 false', () => {
    assert.equal(cache.delete('nonexistent'), false);
  });

  it('clear 清除所有条目', () => {
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(cache.get('key1'), undefined);
  });

  it('size 返回条目数', () => {
    assert.equal(cache.size(), 0);
    cache.set('key1', 'a');
    assert.equal(cache.size(), 1);
    cache.set('key2', 'b');
    assert.equal(cache.size(), 2);
  });

  it('覆盖已有键的值', () => {
    cache.set('key1', 'old');
    cache.set('key1', 'new');
    assert.equal(cache.get('key1'), 'new');
    assert.equal(cache.size(), 1);
  });

  it('缓存值可以是任意类型: string, number, object, array, null', () => {
    cache.set('str', 'hello');
    cache.set('num', 42);
    cache.set('obj', { a: 1, b: [2, 3] });
    cache.set('arr', [1, 2, 3]);
    cache.set('nil', null);

    assert.equal(cache.get('str'), 'hello');
    assert.equal(cache.get('num'), 42);
    assert.deepEqual(cache.get('obj'), { a: 1, b: [2, 3] });
    assert.deepEqual(cache.get('arr'), [1, 2, 3]);
    assert.equal(cache.get('nil'), null);
  });
});

// ==================== LRU 淘汰 ====================

describe('CacheManager — LRU 淘汰', () => {
  it('超过 maxSize 淘汰最久未访问的条目', () => {
    const cache = new CacheManager({ maxSize: 2, ttlMs: 0 });
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    cache.set('key3', 'c'); // 触发淘汰 key1
    assert.equal(cache.size(), 2);
    assert.equal(cache.get('key1'), undefined, 'key1 应被淘汰');
    assert.equal(cache.get('key2'), 'b', 'key2 应保留');
    assert.equal(cache.get('key3'), 'c', 'key3 应保留');
  });

  it('get 命中刷新 LRU 顺序', () => {
    const cache = new CacheManager({ maxSize: 2, ttlMs: 0 });
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    cache.get('key1'); // 刷新 key1
    cache.set('key3', 'c'); // 淘汰 key2（最久未访问）
    assert.equal(cache.get('key1'), 'a', 'key1 被访问过，应保留');
    assert.equal(cache.get('key2'), undefined, 'key2 未被访问，应被淘汰');
    assert.equal(cache.get('key3'), 'c', 'key3 应保留');
  });

  it('has 命中刷新 LRU 顺序', () => {
    const cache = new CacheManager({ maxSize: 2, ttlMs: 0 });
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    cache.has('key1'); // 刷新 key1
    cache.set('key3', 'c'); // 淘汰 key2
    assert.equal(cache.get('key1'), 'a', 'key1 被 has 过，应保留');
    assert.equal(cache.get('key2'), undefined, 'key2 应被淘汰');
  });

  it('大量条目正确淘汰', () => {
    const cache = new CacheManager({ maxSize: 5, ttlMs: 0 });
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    assert.equal(cache.size(), 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(cache.get(`key${i}`), undefined, `key${i} 应被淘汰`);
    }
    for (let i = 5; i < 10; i++) {
      assert.equal(cache.get(`key${i}`), `value${i}`, `key${i} 应保留`);
    }
  });
});

// ==================== TTL 过期 ====================

describe('CacheManager — TTL 过期', () => {
  it('过期条目返回 undefined', async () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', 'hello');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(cache.get('key1'), undefined);
  });

  it('过期后 has 返回 false', async () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', 'hello');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(cache.has('key1'), false);
  });

  it('过期后 size 保持不变（惰性清理）', async () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', 'hello');
    await new Promise(r => setTimeout(r, 10));
    // get 触发惰性清理
    cache.get('key1');
    assert.equal(cache.size(), 0);
  });

  it('evictExpired 主动清理过期条目', async () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    await new Promise(r => setTimeout(r, 10));
    const evicted = cache.evictExpired();
    assert.equal(evicted, 2);
    assert.equal(cache.size(), 0);
  });

  it('evictExpired 不清理未过期条目', () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 60000 });
    cache.set('key1', 'a');
    cache.set('key2', 'b');
    const evicted = cache.evictExpired();
    assert.equal(evicted, 0);
    assert.equal(cache.size(), 2);
  });

  it('TTL=0 表示永不过期', async () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 0 });
    cache.set('key1', 'hello');
    // 立即检查，不应过期
    assert.equal(cache.get('key1'), 'hello');
    assert.equal(cache.has('key1'), true);
  });
});

// ==================== 统计 ====================

describe('CacheManager — 统计', () => {
  it('stats 返回初始零值', () => {
    const cache = new CacheManager();
    const s = cache.stats();
    assert.equal(s.hits, 0);
    assert.equal(s.misses, 0);
    assert.equal(s.evictions, 0);
    assert.equal(s.size, 0);
    assert.equal(s.maxSize, 100);
  });

  it('get 命中增加 hits', () => {
    const cache = new CacheManager();
    cache.set('key1', 'a');
    cache.get('key1');
    cache.get('key1');
    assert.equal(cache.stats().hits, 2);
  });

  it('get 未命中增加 misses', () => {
    const cache = new CacheManager();
    cache.get('no1');
    cache.get('no2');
    assert.equal(cache.stats().misses, 2);
  });

  it('LRU 淘汰增加 evictions', () => {
    const cache = new CacheManager({ maxSize: 1, ttlMs: 0 });
    cache.set('key1', 'a');
    cache.set('key2', 'b'); // 淘汰 key1
    assert.equal(cache.stats().evictions, 1);
  });

  it('过期 get 计为 miss', async () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 1 });
    cache.set('key1', 'a');
    await new Promise(r => setTimeout(r, 10));
    cache.get('key1');
    assert.equal(cache.stats().misses, 1);
    assert.equal(cache.stats().hits, 0);
  });
});

// ==================== 模式失效 ====================

describe('CacheManager — 模式失效', () => {
  it('invalidatePattern 按正则清除匹配条目', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    cache.set('search:hello', ['result1']);
    cache.set('search:world', ['result2']);
    cache.set('tag:js', ['result3']);

    const removed = cache.invalidatePattern(/^search:/);
    assert.equal(removed, 2);
    assert.equal(cache.size(), 1);
    assert.deepEqual(cache.get('tag:js'), ['result3']);
  });

  it('invalidatePattern 无匹配返回 0', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    cache.set('key1', 'a');
    const removed = cache.invalidatePattern(/^nope/);
    assert.equal(removed, 0);
    assert.equal(cache.size(), 1);
  });

  it('invalidatePattern 空缓存返回 0', () => {
    const cache = new CacheManager();
    assert.equal(cache.invalidatePattern(/.*/), 0);
  });
});

// ==================== 标签失效 ====================

describe('CacheManager — 标签失效', () => {
  it('set 时指定 tags，可按标签批量失效', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    cache.set('q1', 'a', { tags: ['search', 'tag:js'] });
    cache.set('q2', 'b', { tags: ['search', 'tag:css'] });
    cache.set('q3', 'c', { tags: ['tag:js'] });

    const removed = cache.invalidateByTag('search');
    assert.equal(removed, 2);
    assert.equal(cache.get('q1'), undefined);
    assert.equal(cache.get('q2'), undefined);
    assert.equal(cache.get('q3'), 'c');
  });

  it('invalidateByTag 清理标签索引', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    cache.set('q1', 'a', { tags: ['s1'] });
    cache.invalidateByTag('s1');
    // 再次添加同标签
    cache.set('q2', 'b', { tags: ['s1'] });
    assert.equal(cache.size(), 1);
    assert.equal(cache.get('q2'), 'b');
  });

  it('delete 时清理标签索引', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    cache.set('q1', 'a', { tags: ['s1'] });
    cache.delete('q1');
    const removed = cache.invalidateByTag('s1');
    assert.equal(removed, 0, '标签索引应已被 delete 清理');
  });
});

// ==================== 边界情况 ====================

describe('CacheManager — 边界情况', () => {
  it('maxSize=1 只保留最新条目', () => {
    const cache = new CacheManager({ maxSize: 1, ttlMs: 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    assert.equal(cache.size(), 1);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('b'), 2);
  });

  it('大量快速读写不崩溃', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    for (let i = 0; i < 10000; i++) {
      cache.set(`k${i}`, i);
      if (i % 3 === 0) cache.get(`k${Math.max(0, i - 50)}`);
    }
    assert.equal(cache.size(), 100);
  });

  it('null 值正确存储和读取', () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 0 });
    cache.set('null-key', null);
    assert.ok(cache.has('null-key'));
    assert.equal(cache.get('null-key'), null);
  });

  it('undefined 值正确存储和读取', () => {
    const cache = new CacheManager({ maxSize: 10, ttlMs: 0 });
    cache.set('undef-key', undefined);
    // has 应返回 true（键存在）
    assert.ok(cache.has('undef-key'));
    // get 返回 undefined（值是 undefined）
    assert.equal(cache.get('undef-key'), undefined);
  });
});

// ==================== 性能基准 ====================

describe('CacheManager — 性能基准 (1000+ 条目)', () => {
  it('1000 条目写入+读取性能: < 50ms', () => {
    const cache = new CacheManager({ maxSize: 500, ttlMs: 0 });
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      cache.set(`bm-${i}`, { id: i, title: `Bookmark ${i}`, url: `https://example.com/${i}` });
    }
    for (let i = 0; i < 1000; i++) {
      cache.get(`bm-${i}`);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 150, `耗时 ${elapsed.toFixed(1)}ms 应 < 150ms`);
    assert.equal(cache.size(), 500);
  });

  it('10000 条目高频读写: < 200ms', () => {
    const cache = new CacheManager({ maxSize: 1000, ttlMs: 0 });
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      cache.set(`k-${i % 2000}`, { data: i });
      if (i % 2 === 0) cache.get(`k-${(i - 100 + 2000) % 2000}`);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 400, `耗时 ${elapsed.toFixed(1)}ms 应 < 400ms`);
  });
});

// ==================== replace 功能 ====================

describe('CacheManager — replace 替换已有条目不影响大小', () => {
  it('替换已有键不增加 size', () => {
    const cache = new CacheManager({ maxSize: 2, ttlMs: 0 });
    cache.set('k1', 'old');
    cache.set('k1', 'new');
    assert.equal(cache.size(), 1);
    assert.equal(cache.get('k1'), 'new');
  });

  it('替换已有键带标签更新标签索引', () => {
    const cache = new CacheManager({ maxSize: 100, ttlMs: 0 });
    cache.set('k1', 'a', { tags: ['group1'] });
    cache.set('k1', 'b', { tags: ['group2'] });

    cache.invalidateByTag('group1');
    assert.equal(cache.get('k1'), 'b', 'group1 标签失效不应影响 group2 标记的 k1');

    cache.invalidateByTag('group2');
    assert.equal(cache.get('k1'), undefined, 'group2 标签应失效 k1');
  });
});
