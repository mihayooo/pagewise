/**
 * 测试 lib/bookmark-semantic-search-index.js — 索引管理子模块 IndexOperations
 *
 * 测试范围:
 *   IVF_DEFAULTS / buildIvfIndex / serializeIndex / deserializeIndex
 *   persistToIndexedDB / loadFromIndexedDB / clearIndexedDB
 *   _idbPut / _idbGet (可注入实现)
 *
 * R402: 提升覆盖率从 36.3% → ≥70%
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { IndexOperations, IVF_DEFAULTS } = await import('../lib/bookmark-semantic-search-index.js');

// ==================== 辅助函数 ====================

/** 创建模拟 EmbeddingEngine */
function createMockEmbeddingEngine() {
  return {
    _vocabulary: new Map(),
    _docCount: 0,
    _vectorCache: new Map(),
    cosineSimilarity(vecA, vecB) {
      // 简化: 基于共同 key 数量计算相似度
      let common = 0;
      for (const key of vecA.keys()) {
        if (vecB.has(key)) common++;
      }
      const total = new Set([...vecA.keys(), ...vecB.keys()]).size || 1;
      return common / total;
    },
  };
}

/** 创建模拟 ctx（BookmarkSemanticSearch 实例上下文） */
function createMockCtx(opts = {}) {
  const embeddingEngine = createMockEmbeddingEngine();
  return {
    _documentVectors: new Map(),
    _bookmarkStore: new Map(),
    _vocabulary: new Map(),
    _documentCount: 0,
    _searchCache: new Map(),
    _embeddingEngine: embeddingEngine,
    _ivfIndex: null,
    _ivfClusters: opts.ivfClusters || 4,
    _ivfNprobe: opts.ivfNprobe || 2,
    _ivfThreshold: opts.ivfThreshold || 1000,
  };
}

/** 创建简单向量 Map */
function createVector(dims) {
  const vec = new Map();
  for (let i = 0; i < dims; i++) {
    vec.set(`dim${i}`, Math.random());
  }
  return vec;
}

// ==================== IVF_DEFAULTS ====================

describe('IVF_DEFAULTS', () => {
  it('应该有正确的默认值', () => {
    assert.equal(IVF_DEFAULTS.threshold, 1000);
    assert.equal(IVF_DEFAULTS.nClusters, 16);
    assert.equal(IVF_DEFAULTS.nprobe, 3);
  });

  it('应该是冻结对象', () => {
    assert.throws(() => { IVF_DEFAULTS.threshold = 999; });
    assert.equal(IVF_DEFAULTS.threshold, 1000);
  });
});

// ==================== buildIvfIndex ====================

describe('IndexOperations.buildIvfIndex', () => {
  it('文档数少于 k 时返回 null 索引', () => {
    const ctx = createMockCtx({ ivfClusters: 4 });
    // 只添加 2 个文档 < k=4
    ctx._documentVectors.set('b1', createVector(5));
    ctx._documentVectors.set('b2', createVector(5));

    IndexOperations.buildIvfIndex(ctx);
    assert.equal(ctx._ivfIndex, null);
  });

  it('空文档集时返回 null 索引', () => {
    const ctx = createMockCtx({ ivfClusters: 4 });
    IndexOperations.buildIvfIndex(ctx);
    assert.equal(ctx._ivfIndex, null);
  });

  it('文档数 ≥ k 时构建有效索引', () => {
    const ctx = createMockCtx({ ivfClusters: 3 });
    for (let i = 0; i < 10; i++) {
      ctx._documentVectors.set(`b${i}`, createVector(8));
    }

    IndexOperations.buildIvfIndex(ctx);
    assert.ok(ctx._ivfIndex, '索引应被创建');
    assert.ok(ctx._ivfIndex.centroids.length > 0, '应有质心');
    assert.ok(ctx._ivfIndex.clusters.length > 0, '应有聚类');
    assert.equal(ctx._ivfIndex.centroids.length, ctx._ivfIndex.clusters.length);
    assert.equal(ctx._ivfIndex.nprobe, 2);
  });

  it('使用自定义 nClusters 参数', () => {
    const ctx = createMockCtx({ ivfClusters: 10 }); // 默认 10，文档不够
    for (let i = 0; i < 5; i++) {
      ctx._documentVectors.set(`b${i}`, createVector(4));
    }

    // 用 nClusters=3 覆盖
    IndexOperations.buildIvfIndex(ctx, 3);
    assert.ok(ctx._ivfIndex, '应使用自定义 k=3 构建');
    assert.ok(ctx._ivfIndex.centroids.length <= 3);
  });

  it('所有文档分配到聚类后无遗漏', () => {
    const ctx = createMockCtx({ ivfClusters: 2 });
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const id = `b${i}`;
      ids.push(id);
      ctx._documentVectors.set(id, createVector(4));
    }

    IndexOperations.buildIvfIndex(ctx);
    const assigned = ctx._ivfIndex.clusters.flat();
    assert.equal(assigned.length, ids.length, '所有文档应被分配');
    for (const id of ids) {
      assert.ok(assigned.includes(id), `${id} 应在聚类中`);
    }
  });

  it('移除空聚类 — 非空聚类数 ≤ k', () => {
    const ctx = createMockCtx({ ivfClusters: 2 });
    // 所有向量相同，应全部分配到同一聚类
    const sameVec = createVector(4);
    for (let i = 0; i < 6; i++) {
      ctx._documentVectors.set(`b${i}`, new Map(sameVec));
    }

    IndexOperations.buildIvfIndex(ctx);
    // 可能只有 1 个非空聚类（取决于随机初始化选取的质心）
    assert.ok(ctx._ivfIndex.clusters.length >= 1);
    for (const cluster of ctx._ivfIndex.clusters) {
      assert.ok(cluster.length > 0, '不应有空聚类');
    }
  });
});

// ==================== serializeIndex ====================

describe('IndexOperations.serializeIndex', () => {
  it('输出包含必要字段', () => {
    const ctx = createMockCtx();
    ctx._bookmarkStore.set('b1', { title: 'Test' });
    ctx._documentVectors.set('b1', new Map([['a', 1], ['b', 2]]));
    ctx._vocabulary.set('word', 5);
    ctx._documentCount = 42;

    const snapshot = IndexOperations.serializeIndex(ctx);
    assert.equal(snapshot.version, 2);
    assert.ok(typeof snapshot.timestamp === 'number');
    assert.deepEqual(snapshot.bookmarks, [['b1', { title: 'Test' }]]);
    assert.equal(snapshot.documentCount, 42);
    assert.ok(Array.isArray(snapshot.vectors));
    assert.ok(Array.isArray(snapshot.vocabulary));
  });

  it('空索引序列化不报错', () => {
    const ctx = createMockCtx();
    const snapshot = IndexOperations.serializeIndex(ctx);
    assert.deepEqual(snapshot.bookmarks, []);
    assert.deepEqual(snapshot.vectors, []);
    assert.deepEqual(snapshot.vocabulary, []);
    assert.equal(snapshot.documentCount, 0);
  });

  it('向量序列化为 entries 数组', () => {
    const ctx = createMockCtx();
    const vec = new Map([['x', 0.5], ['y', 0.8]]);
    ctx._documentVectors.set('b1', vec);

    const snapshot = IndexOperations.serializeIndex(ctx);
    assert.equal(snapshot.vectors.length, 1);
    assert.equal(snapshot.vectors[0][0], 'b1');
    // entries: [['x', 0.5], ['y', 0.8]]
    assert.ok(Array.isArray(snapshot.vectors[0][1]));
    assert.equal(snapshot.vectors[0][1].length, 2);
  });
});

// ==================== deserializeIndex ====================

describe('IndexOperations.deserializeIndex', () => {
  it('null/undefined data 不报错', () => {
    const ctx = createMockCtx();
    IndexOperations.deserializeIndex(ctx, null);
    IndexOperations.deserializeIndex(ctx, undefined);
    IndexOperations.deserializeIndex(ctx, 'string');
    // 不应抛异常
  });

  it('恢复 bookmarks、vectors、vocabulary', () => {
    const ctx = createMockCtx();
    const data = {
      version: 2,
      documentCount: 5,
      bookmarks: [['b1', { title: 'A' }], ['b2', { title: 'B' }]],
      vectors: [['b1', [['dim0', 0.1], ['dim1', 0.2]]]],
      vocabulary: [['word', 3], ['test', 7]],
    };

    IndexOperations.deserializeIndex(ctx, data);
    assert.equal(ctx._bookmarkStore.size, 2);
    assert.equal(ctx._documentVectors.size, 1);
    assert.equal(ctx._vocabulary.size, 2);
    assert.equal(ctx._documentCount, 5);
    assert.deepEqual(ctx._bookmarkStore.get('b1'), { title: 'A' });
  });

  it('同步到嵌入引擎', () => {
    const ctx = createMockCtx();
    const data = {
      documentCount: 3,
      bookmarks: [],
      vectors: [],
      vocabulary: [['hello', 1]],
    };

    IndexOperations.deserializeIndex(ctx, data);
    assert.equal(ctx._embeddingEngine._vocabulary.get('hello'), 1);
    assert.equal(ctx._embeddingEngine._docCount, 3);
  });

  it('缺少可选字段时安全降级', () => {
    const ctx = createMockCtx();
    ctx._bookmarkStore.set('old', { title: 'old' });

    IndexOperations.deserializeIndex(ctx, { documentCount: 1 });
    assert.equal(ctx._bookmarkStore.size, 0, '应清空旧数据');
    assert.equal(ctx._documentCount, 1);
  });

  it('大书签库自动构建 IVF', () => {
    const ctx = createMockCtx({ ivfThreshold: 3, ivfClusters: 2 });
    const bookmarks = [];
    const vectors = [];
    for (let i = 0; i < 5; i++) {
      bookmarks.push([`b${i}`, { title: `B${i}` }]);
      vectors.push([`b${i}`, [[`dim${i}`, 0.5]]]);
    }

    IndexOperations.deserializeIndex(ctx, {
      documentCount: 5,
      bookmarks,
      vectors,
      vocabulary: [],
    });

    assert.equal(ctx._documentVectors.size, 5);
    // 5 > threshold 3，应自动构建 IVF
    assert.ok(ctx._ivfIndex, '应自动构建 IVF 索引');
  });

  it('小书签库不构建 IVF', () => {
    const ctx = createMockCtx({ ivfThreshold: 100 });
    IndexOperations.deserializeIndex(ctx, {
      documentCount: 2,
      bookmarks: [['b1', {}]],
      vectors: [],
      vocabulary: [],
    });

    assert.equal(ctx._ivfIndex, null, '不应构建 IVF');
  });
});

// ==================== persistToIndexedDB / loadFromIndexedDB ====================

describe('IndexOperations IDB 操作', () => {
  let savedPutImpl, savedGetImpl;

  beforeEach(() => {
    savedPutImpl = IndexOperations._idbPutImpl;
    savedGetImpl = IndexOperations._idbGetImpl;
  });

  afterEach(() => {
    IndexOperations._idbPutImpl = savedPutImpl;
    IndexOperations._idbGetImpl = savedGetImpl;
  });

  it('persistToIndexedDB 调用 _idbPut 并传入序列化数据', async () => {
    const calls = [];
    IndexOperations._idbPutImpl = (dbName, storeName, key, value) => {
      calls.push({ dbName, storeName, key, value });
      return Promise.resolve();
    };

    const ctx = createMockCtx();
    ctx._documentCount = 7;
    await IndexOperations.persistToIndexedDB(ctx, 'test-db', 'test-store');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].dbName, 'test-db');
    assert.equal(calls[0].storeName, 'test-store');
    assert.equal(calls[0].key, 'current');
    assert.equal(calls[0].value.documentCount, 7);
    assert.equal(calls[0].value.version, 2);
  });

  it('loadFromIndexedDB 成功加载返回 true', async () => {
    const snapshot = {
      version: 2,
      documentCount: 3,
      bookmarks: [['b1', { title: 'Loaded' }]],
      vectors: [],
      vocabulary: [],
    };
    IndexOperations._idbGetImpl = () => Promise.resolve(snapshot);

    const ctx = createMockCtx();
    const result = await IndexOperations.loadFromIndexedDB(ctx, 'test-db', 'test-store');

    assert.equal(result, true);
    assert.equal(ctx._bookmarkStore.size, 1);
    assert.equal(ctx._documentCount, 3);
  });

  it('loadFromIndexedDB 无数据返回 false', async () => {
    IndexOperations._idbGetImpl = () => Promise.resolve(null);

    const ctx = createMockCtx();
    const result = await IndexOperations.loadFromIndexedDB(ctx);

    assert.equal(result, false);
  });

  it('loadFromIndexedDB 数据为 falsy 值返回 false', async () => {
    IndexOperations._idbGetImpl = () => Promise.resolve(undefined);

    const ctx = createMockCtx();
    const result = await IndexOperations.loadFromIndexedDB(ctx);

    assert.equal(result, false);
  });

  it('默认 dbName 和 storeName', async () => {
    const calls = [];
    IndexOperations._idbPutImpl = (dbName, storeName, key, value) => {
      calls.push({ dbName, storeName });
      return Promise.resolve();
    };

    const ctx = createMockCtx();
    await IndexOperations.persistToIndexedDB(ctx);

    assert.equal(calls[0].dbName, 'pagewise-semantic-index');
    assert.equal(calls[0].storeName, 'index');
  });
});

// ==================== _idbPut / _idbGet 无注入时的降级 ====================

describe('IndexOperations._idbPut/_idbGet 无 indexedDB 环境', () => {
  let savedPutImpl, savedGetImpl;

  beforeEach(() => {
    savedPutImpl = IndexOperations._idbPutImpl;
    savedGetImpl = IndexOperations._idbGetImpl;
    IndexOperations._idbPutImpl = null;
    IndexOperations._idbGetImpl = null;
  });

  afterEach(() => {
    IndexOperations._idbPutImpl = savedPutImpl;
    IndexOperations._idbGetImpl = savedGetImpl;
  });

  it('_idbPut 无 indexedDB 时静默返回 undefined', async () => {
    // Node.js 环境通常没有 globalThis.indexedDB
    if (typeof globalThis.indexedDB !== 'undefined') return;

    const result = await IndexOperations._idbPut('db', 'store', 'key', {});
    assert.equal(result, undefined);
  });

  it('_idbGet 无 indexedDB 时返回 null', async () => {
    if (typeof globalThis.indexedDB !== 'undefined') return;

    const result = await IndexOperations._idbGet('db', 'store', 'key');
    assert.equal(result, null);
  });
});

// ==================== clearIndexedDB ====================

describe('IndexOperations.clearIndexedDB', () => {
  it('无 indexedDB 环境时静默返回', async () => {
    if (typeof globalThis.indexedDB !== 'undefined') return;

    const result = await IndexOperations.clearIndexedDB('test-db');
    assert.equal(result, undefined);
  });
});

// ==================== 边界场景 ====================

describe('IndexOperations 边界场景', () => {
  it('serialize → deserialize 往返一致性', () => {
    const ctx = createMockCtx();
    ctx._bookmarkStore.set('b1', { title: 'Test', url: 'https://example.com' });
    ctx._documentVectors.set('b1', new Map([['a', 0.5], ['b', 0.8]]));
    ctx._vocabulary.set('hello', 10);
    ctx._documentCount = 100;

    const snapshot = IndexOperations.serializeIndex(ctx);

    const ctx2 = createMockCtx();
    IndexOperations.deserializeIndex(ctx2, snapshot);

    assert.equal(ctx2._bookmarkStore.size, 1);
    assert.deepEqual(ctx2._bookmarkStore.get('b1'), { title: 'Test', url: 'https://example.com' });
    assert.equal(ctx2._documentVectors.size, 1);
    assert.equal(ctx2._vocabulary.get('hello'), 10);
    assert.equal(ctx2._documentCount, 100);
  });

  it('buildIvfIndex 单文档时返回 null', () => {
    const ctx = createMockCtx({ ivfClusters: 2 });
    ctx._documentVectors.set('b1', createVector(4));
    IndexOperations.buildIvfIndex(ctx);
    assert.equal(ctx._ivfIndex, null);
  });

  it('buildIvfIndex 多次调用覆盖旧索引', () => {
    const ctx = createMockCtx({ ivfClusters: 2 });
    for (let i = 0; i < 6; i++) {
      ctx._documentVectors.set(`b${i}`, createVector(4));
    }

    IndexOperations.buildIvfIndex(ctx);
    const firstIndex = ctx._ivfIndex;
    assert.ok(firstIndex);

    // 再次构建
    ctx._documentVectors.set('b6', createVector(4));
    ctx._documentVectors.set('b7', createVector(4));
    IndexOperations.buildIvfIndex(ctx);
    assert.ok(ctx._ivfIndex);
    // 新索引可能不同（随机初始化）
  });

  it('deserializeIndex 空 bookmarks 数组', () => {
    const ctx = createMockCtx();
    ctx._bookmarkStore.set('old', { title: 'old' });

    IndexOperations.deserializeIndex(ctx, {
      bookmarks: [],
      vectors: [],
      vocabulary: [],
      documentCount: 0,
    });

    assert.equal(ctx._bookmarkStore.size, 0);
    assert.equal(ctx._documentCount, 0);
  });
});
