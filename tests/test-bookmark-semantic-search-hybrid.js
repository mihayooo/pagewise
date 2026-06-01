/**
 * 测试 lib/bookmark-semantic-search-hybrid.js — SearchOperations 类
 *
 * 专注测试 rrfMerge / mergeResults / IVF 搜索 / 缓存行为等未覆盖路径
 * 与 test-bookmark-semantic-search.js 互补（后者已覆盖基本 semanticSearch/hybridSearch/findSimilar）
 *
 * R361: bookmark-semantic-search-hybrid 单元测试
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { SearchOperations } = await import('../lib/bookmark-semantic-search-hybrid.js');

// ==================== 辅助函数 ====================

function createVector(terms) {
  const vec = new Map();
  for (const [term, weight] of Object.entries(terms)) {
    vec.set(term, weight);
  }
  return vec;
}

function createBookmark(id, title = `Bookmark ${id}`) {
  return { id: String(id), title, url: `https://example.com/${id}` };
}

function createMockCtx(opts = {}) {
  const searchCache = new Map();
  searchCache.get = searchCache.get.bind(searchCache);
  searchCache.set = function (key, value) { searchCache.set(key, value); }.bind(searchCache);

  // Simple LRU-like cache with tags support
  const cache = {
    _store: new Map(),
    get(key) { return this._store.get(key); },
    set(key, value) { this._store.set(key, value); },
    clear() { this._store.clear(); },
  };

  const documentVectors = opts.documentVectors || new Map();
  const bookmarkStore = opts.bookmarkStore || new Map();

  return {
    _searchCache: cache,
    _embeddingEngine: {
      generateVector(text) {
        // Simple TF-IDF mock: split by space, weight by word length
        const vec = new Map();
        const words = text.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.length > 1) vec.set(w, w.length * 0.1);
        }
        return vec;
      },
      cosineSimilarity(a, b) {
        if (!a || !b || a.size === 0 || b.size === 0) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (const [k, v] of a) {
          magA += v * v;
          const bv = b.get(k);
          if (bv !== undefined) dot += v * bv;
        }
        for (const [, v] of b) magB += v * v;
        const denom = Math.sqrt(magA) * Math.sqrt(magB);
        return denom > 0 ? dot / denom : 0;
      },
    },
    _documentVectors: documentVectors,
    _bookmarkStore: bookmarkStore,
    _bookmarkSearch: opts.bookmarkSearch || null,
    _ivfIndex: opts.ivfIndex || null,
    _ivfThreshold: opts.ivfThreshold || 1000,
  };
}

function setupBookmarks(ctx, bookmarks) {
  for (const bm of bookmarks) {
    ctx._bookmarkStore.set(bm.id, bm);
    // Generate a vector from the title
    const vec = ctx._embeddingEngine.generateVector(bm.title);
    ctx._documentVectors.set(bm.id, vec);
  }
}

// ==================== rrfMerge 测试 ====================

describe('SearchOperations.rrfMerge', () => {
  it('1. 空列表合并返回空数组', () => {
    const result = SearchOperations.rrfMerge([], []);
    assert.deepEqual(result, []);
  });

  it('2. 仅关键词列表返回关键词结果', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
      { id: '2', score: 0.7, bookmark: createBookmark('2'), matchType: 'keyword' },
    ];
    const result = SearchOperations.rrfMerge(keyword, []);
    assert.equal(result.length, 2);
    assert.equal(result[0].matchType, 'keyword');
    // RRF score = 1/(k+rank) where k=60, rank=1 for first item
    assert.ok(result[0].score > result[1].score);
  });

  it('3. 仅语义列表返回语义结果', () => {
    const semantic = [
      { id: '3', score: 0.8, bookmark: createBookmark('3'), matchType: 'semantic' },
    ];
    const result = SearchOperations.rrfMerge([], semantic);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchType, 'semantic');
  });

  it('4. 重叠文档标记为 hybrid', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '1', score: 0.8, bookmark: createBookmark('1'), matchType: 'semantic' },
    ];
    const result = SearchOperations.rrfMerge(keyword, semantic);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchType, 'hybrid');
    // RRF score = 1/(60+1) + 1/(60+1) = 2/61
    assert.ok(Math.abs(result[0].score - 2 / 61) < 0.001);
  });

  it('5. 不重叠文档各自保留', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '2', score: 0.8, bookmark: createBookmark('2'), matchType: 'semantic' },
    ];
    const result = SearchOperations.rrfMerge(keyword, semantic);
    assert.equal(result.length, 2);
    // Both should have RRF score of 1/(60+1)
    assert.ok(Math.abs(result[0].score - result[1].score) < 0.001);
  });

  it('6. k 参数影响分数', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '1', score: 0.8, bookmark: createBookmark('1'), matchType: 'semantic' },
    ];
    const smallK = SearchOperations.rrfMerge(keyword, semantic, { k: 1 });
    const largeK = SearchOperations.rrfMerge(keyword, semantic, { k: 1000 });
    // Smaller k → larger score (1/(1+1) + 1/(1+1) = 1.0 vs 1/(1000+1) + 1/(1000+1) ≈ 0.002)
    assert.ok(smallK[0].score > largeK[0].score);
  });

  it('7. 排名靠前的文档 RRF 分数更高', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
      { id: '2', score: 0.8, bookmark: createBookmark('2'), matchType: 'keyword' },
      { id: '3', score: 0.7, bookmark: createBookmark('3'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '3', score: 0.95, bookmark: createBookmark('3'), matchType: 'semantic' },
      { id: '1', score: 0.6, bookmark: createBookmark('1'), matchType: 'semantic' },
    ];
    const result = SearchOperations.rrfMerge(keyword, semantic);
    // id=1: rank 1 in keyword + rank 2 in semantic = 1/61 + 1/62
    // id=3: rank 3 in keyword + rank 1 in semantic = 1/63 + 1/61
    // id=1 should rank higher (1/61 + 1/62 > 1/63 + 1/61)
    const r1 = result.find(r => r.id === '1');
    const r3 = result.find(r => r.id === '3');
    assert.ok(r1.score > r3.score, `id=1 score ${r1.score} should be > id=3 score ${r3.score}`);
  });

  it('8. 保留 bookmark 信息', () => {
    const bm = createBookmark('1', 'Test Title');
    const keyword = [{ id: '1', score: 0.5, bookmark: bm, matchType: 'keyword' }];
    const result = SearchOperations.rrfMerge(keyword, []);
    assert.deepEqual(result[0].bookmark, bm);
  });

  it('9. 结果按 RRF 分数降序', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
      { id: '2', score: 0.5, bookmark: createBookmark('2'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '2', score: 0.95, bookmark: createBookmark('2'), matchType: 'semantic' },
      { id: '3', score: 0.8, bookmark: createBookmark('3'), matchType: 'semantic' },
    ];
    const result = SearchOperations.rrfMerge(keyword, semantic);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score, `Results not sorted at index ${i}`);
    }
  });
});

// ==================== mergeResults 测试 ====================

describe('SearchOperations.mergeResults', () => {
  it('10. 空列表合并返回空数组', () => {
    const result = SearchOperations.mergeResults([], []);
    assert.deepEqual(result, []);
  });

  it('11. 仅关键词返回归一化结果', () => {
    const keyword = [
      { id: '1', score: 1.0, bookmark: createBookmark('1'), matchType: 'keyword' },
      { id: '2', score: 0.5, bookmark: createBookmark('2'), matchType: 'keyword' },
    ];
    const result = SearchOperations.mergeResults(keyword, [], 0.6);
    assert.equal(result.length, 2);
    // Max score is 1.0, so normalized: 1.0/1.0*0.6=0.6, 0.5/1.0*0.6=0.3
    assert.ok(Math.abs(result[0].score - 0.6) < 0.001);
    assert.ok(Math.abs(result[1].score - 0.3) < 0.001);
  });

  it('12. 仅语义返回归一化结果', () => {
    const semantic = [
      { id: '3', score: 2.0, bookmark: createBookmark('3'), matchType: 'semantic' },
    ];
    const result = SearchOperations.mergeResults([], semantic, 0.6);
    assert.equal(result.length, 1);
    // 2.0/2.0 * 0.4 = 0.4
    assert.ok(Math.abs(result[0].score - 0.4) < 0.001);
  });

  it('13. 重叠文档分数相加标记为 hybrid', () => {
    const keyword = [
      { id: '1', score: 1.0, bookmark: createBookmark('1'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '1', score: 1.0, bookmark: createBookmark('1'), matchType: 'semantic' },
    ];
    const result = SearchOperations.mergeResults(keyword, semantic, 0.6);
    assert.equal(result.length, 1);
    assert.equal(result[0].matchType, 'hybrid');
    // keyword: 1.0/1.0*0.6 = 0.6, semantic: 1.0/1.0*0.4 = 0.4, total = 1.0
    assert.ok(Math.abs(result[0].score - 1.0) < 0.001);
  });

  it('14. ratio 参数影响权重分配', () => {
    const keyword = [
      { id: '1', score: 1.0, bookmark: createBookmark('1'), matchType: 'keyword' },
    ];
    const resultA = SearchOperations.mergeResults(keyword, [], 0.8);
    const resultB = SearchOperations.mergeResults(keyword, [], 0.2);
    assert.ok(resultA[0].score > resultB[0].score, 'Higher ratio should give higher keyword weight');
  });

  it('15. 结果按合并分数降序', () => {
    const keyword = [
      { id: '1', score: 2.0, bookmark: createBookmark('1'), matchType: 'keyword' },
      { id: '2', score: 1.0, bookmark: createBookmark('2'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '2', score: 3.0, bookmark: createBookmark('2'), matchType: 'semantic' },
      { id: '3', score: 0.5, bookmark: createBookmark('3'), matchType: 'semantic' },
    ];
    const result = SearchOperations.mergeResults(keyword, semantic, 0.6);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });

  it('16. 保留 _keywordScore 和 _semanticScore', () => {
    const keyword = [
      { id: '1', score: 0.9, bookmark: createBookmark('1'), matchType: 'keyword' },
    ];
    const semantic = [
      { id: '1', score: 0.8, bookmark: createBookmark('1'), matchType: 'semantic' },
    ];
    const result = SearchOperations.mergeResults(keyword, semantic, 0.6);
    assert.equal(result[0]._keywordScore, 0.9);
    assert.equal(result[0]._semanticScore, 0.8);
  });
});

// ==================== semanticSearch 测试 ====================

describe('SearchOperations.semanticSearch — 缓存与边界', () => {
  it('17. 空查询返回空数组', () => {
    const ctx = createMockCtx();
    assert.deepEqual(SearchOperations.semanticSearch(ctx, ''), []);
    assert.deepEqual(SearchOperations.semanticSearch(ctx, null), []);
    assert.deepEqual(SearchOperations.semanticSearch(ctx, undefined), []);
  });

  it('18. 查询结果被缓存', () => {
    const ctx = createMockCtx();
    const bm = createBookmark('1', 'test query');
    setupBookmarks(ctx, [bm]);

    const result1 = SearchOperations.semanticSearch(ctx, 'test', { limit: 5 });
    // Cache should have the result now
    const cached = ctx._searchCache._store.get('semantic:test:5');
    assert.ok(cached, 'Result should be cached');
    assert.deepEqual(result1, cached);
  });

  it('19. 缓存命中返回相同结果', () => {
    const ctx = createMockCtx();
    const bm = createBookmark('1', 'test query');
    setupBookmarks(ctx, [bm]);

    const result1 = SearchOperations.semanticSearch(ctx, 'test');
    const result2 = SearchOperations.semanticSearch(ctx, 'test');
    assert.deepEqual(result1, result2);
  });

  it('20. 无匹配时返回空', () => {
    const ctx = createMockCtx();
    setupBookmarks(ctx, [createBookmark('1', 'xyz abc')]);
    // Query with completely different terms
    const result = SearchOperations.semanticSearch(ctx, 'zzzzz');
    assert.equal(result.length, 0);
  });

  it('21. limit 参数生效', () => {
    const ctx = createMockCtx();
    const bookmarks = [];
    for (let i = 0; i < 20; i++) {
      bookmarks.push(createBookmark(String(i), `test document ${i}`));
    }
    setupBookmarks(ctx, bookmarks);

    const result = SearchOperations.semanticSearch(ctx, 'test', { limit: 3 });
    assert.ok(result.length <= 3);
  });
});

// ==================== findSimilar 测试 ====================

describe('SearchOperations.findSimilar — 边界条件', () => {
  it('22. 不存在的 ID 返回空', () => {
    const ctx = createMockCtx();
    assert.deepEqual(SearchOperations.findSimilar(ctx, 'nonexistent'), []);
  });

  it('23. 向量为空时返回空', () => {
    const ctx = createMockCtx();
    ctx._documentVectors.set('1', new Map()); // empty vector
    assert.deepEqual(SearchOperations.findSimilar(ctx, '1'), []);
  });

  it('24. 排除查询书签自身', () => {
    const ctx = createMockCtx();
    setupBookmarks(ctx, [
      createBookmark('1', 'JavaScript programming'),
      createBookmark('2', 'JavaScript tutorial'),
    ]);
    const result = SearchOperations.findSimilar(ctx, '1');
    for (const r of result) {
      assert.notEqual(r.id, '1');
    }
  });

  it('25. limit 参数生效', () => {
    const ctx = createMockCtx();
    const bookmarks = [];
    for (let i = 0; i < 10; i++) {
      bookmarks.push(createBookmark(String(i), `similar document ${i} about code`));
    }
    setupBookmarks(ctx, bookmarks);

    const result = SearchOperations.findSimilar(ctx, '0', 3);
    assert.ok(result.length <= 3);
  });

  it('26. 结果按相似度降序', () => {
    const ctx = createMockCtx();
    setupBookmarks(ctx, [
      createBookmark('1', 'machine learning python'),
      createBookmark('2', 'machine learning tutorial'),
      createBookmark('3', 'cooking recipes italian'),
    ]);
    const result = SearchOperations.findSimilar(ctx, '1');
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].score >= result[i].score);
    }
  });
});

// ==================== hybridSearch 测试 ====================

describe('SearchOperations.hybridSearch — 融合策略', () => {
  it('27. 空查询返回空数组', () => {
    const ctx = createMockCtx();
    assert.deepEqual(SearchOperations.hybridSearch(ctx, ''), []);
    assert.deepEqual(SearchOperations.hybridSearch(ctx, null), []);
  });

  it('28. weighted 融合策略生效', () => {
    const ctx = createMockCtx({
      bookmarkSearch: {
        search(query, opts) {
          return [
            { id: '1', score: 0.9, bookmark: createBookmark('1') },
          ];
        },
      },
    });
    setupBookmarks(ctx, [
      createBookmark('1', 'test document'),
      createBookmark('2', 'test document two'),
    ]);

    const result = SearchOperations.hybridSearch(ctx, 'test', {
      mergeStrategy: 'weighted',
      limit: 10,
    });
    assert.ok(result.length > 0);
    // Should have results from weighted merge
    const r1 = result.find(r => r.id === '1');
    assert.ok(r1, 'Should find bookmark 1 from keyword search');
  });

  it('29. 默认使用 rrf 融合策略', () => {
    const ctx = createMockCtx({
      bookmarkSearch: {
        search() {
          return [{ id: '1', score: 0.9, bookmark: createBookmark('1') }];
        },
      },
    });
    setupBookmarks(ctx, [createBookmark('1', 'test')]);

    const result = SearchOperations.hybridSearch(ctx, 'test', { limit: 10 });
    assert.ok(result.length > 0);
  });

  it('30. semantic-only 排序策略过滤纯关键词结果', () => {
    const ctx = createMockCtx({
      bookmarkSearch: {
        search() {
          return [
            { id: '1', score: 0.9, bookmark: createBookmark('1') },
            { id: '2', score: 0.8, bookmark: createBookmark('2') },
          ];
        },
      },
    });
    // Only bookmark 1 has a document vector → semantic can find it
    setupBookmarks(ctx, [createBookmark('1', 'test document')]);
    // bookmark 2 has no vector → only in keyword results

    const result = SearchOperations.hybridSearch(ctx, 'test', {
      sortBy: 'semantic-only',
      limit: 10,
    });
    // bookmark 2 should be filtered out (keyword-only match)
    for (const r of result) {
      assert.ok(r.matchType !== 'keyword', `ID ${r.id} should not be keyword-only in semantic-only mode`);
    }
  });

  it('31. 结果被缓存', () => {
    const ctx = createMockCtx();
    setupBookmarks(ctx, [createBookmark('1', 'test')]);

    SearchOperations.hybridSearch(ctx, 'test', { limit: 10 });
    // Check cache has an entry with hybrid: prefix
    let found = false;
    for (const [key] of ctx._searchCache._store) {
      if (key.startsWith('hybrid:test:')) {
        found = true;
        break;
      }
    }
    assert.ok(found, 'Hybrid search result should be cached');
  });

  it('32. 无 bookmarkSearch 时只返回语义结果', () => {
    const ctx = createMockCtx({ bookmarkSearch: null });
    setupBookmarks(ctx, [
      createBookmark('1', 'test document'),
      createBookmark('2', 'another test'),
    ]);

    const result = SearchOperations.hybridSearch(ctx, 'test', { limit: 10 });
    for (const r of result) {
      assert.equal(r.matchType, 'semantic');
    }
  });
});

// ==================== IVF 搜索路径测试 ====================

describe('SearchOperations._ivfSearch', () => {
  it('33. IVF 搜索返回结果', () => {
    // Create a large enough document set to trigger IVF
    const docs = new Map();
    const store = new Map();
    for (let i = 0; i < 1100; i++) {
      const vec = createVector({ [`term${i}`]: 1.0, common: 0.5 });
      docs.set(String(i), vec);
      store.set(String(i), createBookmark(String(i), `Document ${i}`));
    }

    // Create IVF index with 3 clusters
    const ivfIndex = {
      nprobe: 2,
      centroids: [
        createVector({ term0: 1.0, common: 0.5 }),
        createVector({ term500: 1.0, common: 0.5 }),
        createVector({ term1000: 1.0, common: 0.5 }),
      ],
      clusters: [
        Array.from({ length: 400 }, (_, i) => String(i)),
        Array.from({ length: 400 }, (_, i) => String(i + 400)),
        Array.from({ length: 300 }, (_, i) => String(i + 800)),
      ],
    };

    const ctx = createMockCtx({
      documentVectors: docs,
      bookmarkStore: store,
      ivfIndex: ivfIndex,
      ivfThreshold: 1000,
    });

    const queryVec = createVector({ term0: 1.0, common: 0.5 });
    const result = SearchOperations._ivfSearch(ctx, queryVec, 10);

    assert.ok(result.length > 0, 'IVF search should return results');
    // perClusterLimit = limit * 2, nprobe clusters → max = limit * 2 * nprobe
    assert.ok(result.length <= 10 * 2 * 2, 'IVF search should respect per-cluster limits');
    // Results should have score > 0
    for (const r of result) {
      assert.ok(r.score > 0);
      assert.equal(r.matchType, 'semantic');
    }
  });

  it('34. IVF 质心范数缓存', () => {
    const ivfIndex = {
      nprobe: 1,
      centroids: [createVector({ a: 3.0, b: 4.0 })], // norm = 5.0
      clusters: [['1']],
    };
    const docs = new Map([['1', createVector({ a: 3.0, b: 4.0 })]]);
    const store = new Map([['1', createBookmark('1')]]);

    const ctx = createMockCtx({
      documentVectors: docs,
      bookmarkStore: store,
      ivfIndex: ivfIndex,
      ivfThreshold: 0,
    });

    // First call should compute centroid norms
    const queryVec = createVector({ a: 1.0 });
    SearchOperations._ivfSearch(ctx, queryVec, 5);

    assert.ok(ivfIndex._centroidNorms, 'Centroid norms should be cached');
    assert.ok(Math.abs(ivfIndex._centroidNorms[0] - 5.0) < 0.01);
  });
});
