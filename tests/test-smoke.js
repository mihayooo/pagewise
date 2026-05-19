/**
 * Smoke Test Suite (R121)
 *
 * 核心流程快速门禁测试子集。
 * 目标: ~50 用例, <5s 执行时间, 零外部依赖 (纯逻辑函数)。
 *
 * 覆盖模块:
 *   - bookmark-indexer (搜索索引核心)
 *   - bookmark-graph (图谱引擎核心)
 *   - bookmark-search (综合搜索核心)
 *   - bookmark-clusterer (聚类核心)
 *   - bookmark-recommender (推荐核心)
 *   - utils (基础工具)
 *   - spaced-repetition (间隔重复)
 *   - cost-estimator (费用估算)
 *   - knowledge-graph (知识图谱)
 *   - bookmark-collector (采集器)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Lazy imports for fast startup ---
const { BookmarkIndexer } = await import('../lib/bookmark-indexer.js');
const { BookmarkGraphEngine } = await import('../lib/bookmark-graph.js');
const { BookmarkSearch } = await import('../lib/bookmark-search.js');
const { BookmarkClusterer } = await import('../lib/bookmark-clusterer.js');
const { BookmarkRecommender } = await import('../lib/bookmark-recommender.js');

// ==================== 辅助函数 ====================

function bm(id, title, url, folderPath = [], tags = []) {
  return {
    id: String(id), title, url, folderPath, tags,
    dateAdded: 1700000000000 + Number(id) * 86400000,
    dateAddedISO: new Date(1700000000000 + Number(id) * 86400000).toISOString(),
  };
}

const CORE_BOOKMARKS = [
  bm('1', 'React 官方文档', 'https://react.dev', ['技术', '前端']),
  bm('2', 'Vue.js 入门教程', 'https://vuejs.org', ['技术', '前端']),
  bm('3', 'Node.js API 文档', 'https://nodejs.org/api', ['技术', '后端']),
  bm('4', 'Python 数据科学手册', 'https://jakevdp.github.io', ['技术', '数据']),
  bm('5', 'Docker 容器化教程', 'https://docker.com/docs', ['技术', 'DevOps']),
  bm('6', 'React Hooks 深入', 'https://react.dev/reference/hooks', ['技术', '前端'], ['react', 'hooks']),
  bm('7', 'Kubernetes 入门', 'https://k8s.io/docs', ['技术', 'DevOps']),
  bm('8', 'TypeScript 手册', 'https://typescriptlang.org', ['技术', '前端'], ['typescript']),
  bm('9', 'GraphQL 教程', 'https://graphql.org/learn', ['技术', 'API']),
  bm('10', 'Redis 缓存策略', 'https://redis.io/docs', ['技术', '数据库'], ['redis', 'cache']),
];

// ==================== BookmarkIndexer 核心 (8 tests) ====================

describe('Smoke: BookmarkIndexer 核心功能', () => {
  it('构建索引后 bookmarks 数正确', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    assert.equal(indexer.getSize().bookmarks, 10);
  });

  it('中文关键词搜索', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    const results = indexer.search('React');
    assert.ok(results.length >= 1);
    assert.ok(results.some(r => r.bookmark && r.bookmark.title.includes('React')));
  });

  it('英文关键词搜索', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    const results = indexer.search('Docker');
    assert.equal(results.length, 1);
    assert.ok(results[0].bookmark.title.includes('Docker'));
  });

  it('多关键词 AND 搜索', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    const results = indexer.search('React Hooks');
    assert.ok(results.length >= 1);
  });

  it('搜索无结果返回空数组', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    const results = indexer.search('不存在的关键词xyz');
    assert.deepEqual(results, []);
  });

  it('添加书签后索引更新', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    indexer.addBookmark(bm('11', 'Rust 编程语言', 'https://rust-lang.org', ['技术', '系统']));
    assert.equal(indexer.getSize().bookmarks, 11);
    const results = indexer.search('Rust');
    assert.equal(results.length, 1);
  });

  it('删除书签后索引更新', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    indexer.removeBookmark('1');
    assert.equal(indexer.getSize().bookmarks, 9);
  });

  it('文件夹过滤搜索', () => {
    const indexer = new BookmarkIndexer();
    indexer.buildIndex(CORE_BOOKMARKS);
    const results = indexer.search('', { folder: '前端' });
    // 注意: 空 query 返回空数组，用 'React' + folder 过滤
    const results2 = indexer.search('React', { folder: '前端' });
    assert.ok(results2.length >= 1);
  });
});

// ==================== BookmarkGraphEngine 核心 (7 tests) ====================

describe('Smoke: BookmarkGraphEngine 核心功能', () => {
  it('构建图谱生成节点和边', () => {
    const engine = new BookmarkGraphEngine();
    const { nodes, edges } = engine.buildGraph(CORE_BOOKMARKS);
    assert.equal(nodes.length, 10);
    assert.ok(edges.length >= 1);
  });

  it('节点包含必要字段', () => {
    const engine = new BookmarkGraphEngine();
    const { nodes } = engine.buildGraph(CORE_BOOKMARKS);
    const node = nodes[0];
    assert.ok(node.id);
    assert.ok(node.label || node.title);
  });

  it('边包含 source 和 target', () => {
    const engine = new BookmarkGraphEngine();
    const { edges } = engine.buildGraph(CORE_BOOKMARKS);
    for (const edge of edges) {
      assert.ok(edge.source !== undefined);
      assert.ok(edge.target !== undefined);
    }
  });

  it('相似书签产生连接', () => {
    const bookmarks = [
      bm('1', 'React 教程', 'https://react.dev', ['前端']),
      bm('2', 'React Hooks 指南', 'https://react.dev/hooks', ['前端']),
    ];
    const engine = new BookmarkGraphEngine();
    const { edges } = engine.buildGraph(bookmarks);
    assert.ok(edges.length >= 1);
  });

  it('完全不相关书签无边', () => {
    const bookmarks = [
      bm('1', '独有标题 ABC', 'https://unique-domain-abc.com', ['分类A']),
      bm('2', '完全不同 XYZ', 'https://another-domain-xyz.org', ['分类B']),
    ];
    const engine = new BookmarkGraphEngine();
    const { edges } = engine.buildGraph(bookmarks);
    assert.equal(edges.length, 0);
  });

  it('空书签列表返回空图谱', () => {
    const engine = new BookmarkGraphEngine();
    const { nodes, edges } = engine.buildGraph([]);
    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
  });

  it('单书签返回节点无边', () => {
    const engine = new BookmarkGraphEngine();
    const { nodes, edges } = engine.buildGraph([bm('1', 'Solo', 'https://solo.com')]);
    assert.equal(nodes.length, 1);
    assert.equal(edges.length, 0);
  });
});

// ==================== BookmarkSearch 核心 (6 tests) ====================

describe('Smoke: BookmarkSearch 核心功能', () => {
  function createSearch() {
    const indexer = new BookmarkIndexer();
    const engine = new BookmarkGraphEngine();
    indexer.buildIndex(CORE_BOOKMARKS);
    engine.buildGraph(CORE_BOOKMARKS);
    return new BookmarkSearch(indexer, engine);
  }

  it('综合搜索返回结果', () => {
    const search = createSearch();
    const results = search.search('React');
    assert.ok(results.length >= 1);
  });

  it('空查询返回空数组', () => {
    const search = createSearch();
    const results = search.search('');
    assert.deepEqual(results, []);
  });

  it('过滤搜索 - 文件夹', () => {
    const search = createSearch();
    const results = search.search('React', { folder: '前端' });
    assert.ok(results.length >= 1);
  });

  it('搜索建议', () => {
    const search = createSearch();
    const suggestions = search.getSuggestions('Re');
    assert.ok(Array.isArray(suggestions));
  });

  it('排序 - relevance', () => {
    const search = createSearch();
    const results = search.search('React', { sortBy: 'relevance' });
    assert.ok(results.length >= 1);
  });

  it('无匹配返回空数组', () => {
    const search = createSearch();
    const results = search.search('不存在xyz999');
    assert.equal(results.length, 0);
  });
});

// ==================== BookmarkClusterer 核心 (5 tests) ====================

describe('Smoke: BookmarkClusterer 核心功能', () => {
  it('聚类返回分类结果', () => {
    const clusterer = new BookmarkClusterer(CORE_BOOKMARKS);
    const categories = clusterer.getCategories();
    assert.ok(Array.isArray(categories));
    assert.ok(categories.length >= 1);
  });

  it('每个分类有名称和计数', () => {
    const clusterer = new BookmarkClusterer(CORE_BOOKMARKS);
    const categories = clusterer.getCategories();
    for (const c of categories) {
      assert.ok(c.name);
      assert.ok(typeof c.count === 'number');
    }
  });

  it('空书签返回空分类', () => {
    const clusterer = new BookmarkClusterer([]);
    const categories = clusterer.getCategories();
    assert.equal(categories.length, 0);
  });

  it('cluster() 返回 Map', () => {
    const clusterer = new BookmarkClusterer(CORE_BOOKMARKS);
    const result = clusterer.cluster();
    assert.ok(result instanceof Map);
  });

  it('聚类不丢失书签', () => {
    const clusterer = new BookmarkClusterer(CORE_BOOKMARKS);
    const result = clusterer.cluster();
    let total = 0;
    for (const [, bookmarks] of result) {
      total += bookmarks.length;
    }
    assert.equal(total, CORE_BOOKMARKS.length);
  });
});

// ==================== BookmarkRecommender 核心 (5 tests) ====================

describe('Smoke: BookmarkRecommender 核心功能', () => {
  function createRecommender() {
    const engine = new BookmarkGraphEngine();
    engine.buildGraph(CORE_BOOKMARKS);
    return new BookmarkRecommender(engine);
  }

  it('推荐返回结果', () => {
    const recommender = createRecommender();
    const results = recommender.recommend('1', 3);
    assert.ok(Array.isArray(results));
  });

  it('推荐结果不超过请求限制', () => {
    const recommender = createRecommender();
    const results = recommender.recommend('1', 2);
    assert.ok(results.length <= 2);
  });

  it('推荐不包含自身', () => {
    const recommender = createRecommender();
    const results = recommender.recommend('1', 10);
    for (const r of results) {
      assert.notEqual(r.bookmark.id, '1');
    }
  });

  it('基于内容推荐', () => {
    const recommender = createRecommender();
    const results = recommender.recommendByContent(
      { id: '99', title: 'Angular 教程', url: 'https://angular.io', folderPath: ['技术', '前端'], tags: ['angular'] },
      CORE_BOOKMARKS,
      3
    );
    assert.ok(Array.isArray(results));
  });

  it('推荐结果有理由', () => {
    const recommender = createRecommender();
    const results = recommender.recommend('1', 3);
    if (results.length > 0) {
      assert.ok(results[0].reason !== undefined);
      assert.ok(results[0].score !== undefined);
    }
  });
});

// ==================== Utils 核心 (8 tests) ====================

describe('Smoke: Utils 核心功能', () => {
  it('formatTime 格式化', async () => {
    const { formatTime } = await import('../lib/utils.js');
    const result = formatTime(120);
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  it('debounce 防抖执行', async () => {
    const { debounce } = await import('../lib/utils.js');
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn(); fn(); fn();
    assert.equal(called, 0);
  });

  it('throttle 节流执行', async () => {
    const { throttle } = await import('../lib/utils.js');
    let called = 0;
    const fn = throttle(() => { called++; }, 100);
    fn(); fn(); fn();
    assert.equal(called, 1);
  });

  it('renderMarkdown 处理纯文本', async () => {
    const { renderMarkdown } = await import('../lib/utils.js');
    const result = renderMarkdown('Hello World');
    assert.ok(typeof result === 'string');
    assert.ok(result.includes('Hello'));
  });

  it('getSettings 返回对象', async () => {
    const { getSettings } = await import('../lib/utils.js');
    if (typeof globalThis.chrome === 'undefined') return;
    const settings = await getSettings();
    assert.ok(typeof settings === 'object');
  });

  it('formatTime 零值', async () => {
    const { formatTime } = await import('../lib/utils.js');
    const result = formatTime(0);
    assert.ok(typeof result === 'string');
  });

  it('formatTime 大数值', async () => {
    const { formatTime } = await import('../lib/utils.js');
    const result = formatTime(3661);
    assert.ok(typeof result === 'string');
  });

  it('debounce 最终执行', async () => {
    const { debounce } = await import('../lib/utils.js');
    return new Promise((resolve) => {
      let called = 0;
      const fn = debounce(() => { called++; assert.equal(called, 1); resolve(); }, 20);
      fn();
    });
  });
});

// ==================== SpacedRepetition 核心 (6 tests) ====================

describe('Smoke: SpacedRepetition 核心功能', () => {
  it('calculateNextReview 返回日期', async () => {
    const { calculateNextReview } = await import('../lib/spaced-repetition.js');
    const result = calculateNextReview({ interval: 1, easeFactor: 2.5, repetitions: 0 }, 3);
    assert.ok(result);
    assert.ok(result.interval !== undefined);
  });

  it('DIFFICULTY_MAP 包含标准级别', async () => {
    const { DIFFICULTY_MAP } = await import('../lib/spaced-repetition.js');
    assert.ok(DIFFICULTY_MAP);
    assert.ok(DIFFICULTY_MAP.again);
    assert.ok(DIFFICULTY_MAP.hard);
    assert.ok(DIFFICULTY_MAP.good);
    assert.ok(DIFFICULTY_MAP.easy);
  });

  it('formatReviewDate 返回字符串', async () => {
    const { formatReviewDate } = await import('../lib/spaced-repetition.js');
    const result = formatReviewDate(Date.now() + 86400000);
    assert.ok(typeof result === 'string');
  });

  it('getReviewStreak 返回对象', async () => {
    const { getReviewStreak } = await import('../lib/spaced-repetition.js');
    const streak = getReviewStreak();
    assert.ok(typeof streak === 'object');
    assert.ok(typeof streak.currentStreak === 'number');
  });

  it('initializeReviewData 返回对象', async () => {
    const { initializeReviewData } = await import('../lib/spaced-repetition.js');
    const data = initializeReviewData();
    assert.ok(typeof data === 'object');
    assert.ok(data.interval !== undefined);
  });

  it('calculateNextReview 重复递增间隔', async () => {
    const { calculateNextReview } = await import('../lib/spaced-repetition.js');
    const data1 = calculateNextReview({ interval: 1, easeFactor: 2.5, repetitions: 0 }, 3);
    const data2 = calculateNextReview({ interval: data1.interval, easeFactor: data1.easeFactor, repetitions: data1.repetitions }, 3);
    assert.ok(data2.interval >= data1.interval);
  });
});

// ==================== CostEstimator 核心 (5 tests) ====================

describe('Smoke: CostEstimator 核心功能', () => {
  it('estimateTokens 返回数字', async () => {
    const mod = await import('../lib/cost-estimator.js');
    if (mod.estimateTokens) {
      const result = mod.estimateTokens('Hello World');
      assert.ok(typeof result === 'number');
      assert.ok(result > 0);
    }
  });

  it('模块可正常导入', async () => {
    const mod = await import('../lib/cost-estimator.js');
    assert.ok(mod);
    assert.ok(Object.keys(mod).length > 0);
  });

  it('至少导出一个函数', async () => {
    const mod = await import('../lib/cost-estimator.js');
    const hasFn = Object.values(mod).some(v => typeof v === 'function');
    assert.ok(hasFn, '模块应至少导出一个函数');
  });

  it('空输入不抛异常', async () => {
    const mod = await import('../lib/cost-estimator.js');
    if (mod.estimateTokens) {
      const result = mod.estimateTokens('');
      assert.ok(typeof result === 'number');
    }
  });

  it('长文本不抛异常', async () => {
    const mod = await import('../lib/cost-estimator.js');
    if (mod.estimateTokens) {
      const longText = 'test '.repeat(1000);
      const result = mod.estimateTokens(longText);
      assert.ok(typeof result === 'number');
      assert.ok(result > 0);
    }
  });
});

// ==================== KnowledgeGraph 核心 (3 tests) ====================

describe('Smoke: KnowledgeGraph 核心功能', () => {
  it('buildGraphData 返回节点和边', async () => {
    const { buildGraphData } = await import('../lib/knowledge-graph.js');
    const entries = [
      { id: '1', title: 'JavaScript 基础', content: 'JS 入门', tags: ['前端'] },
      { id: '2', title: 'JavaScript 高级', content: 'JS 进阶', tags: ['前端'] },
    ];
    const result = buildGraphData(entries);
    assert.ok(result.nodes);
    assert.ok(result.edges);
    assert.ok(result.nodes.length >= 2);
  });

  it('TAG_COLORS 定义存在', async () => {
    const { TAG_COLORS } = await import('../lib/knowledge-graph.js');
    assert.ok(TAG_COLORS);
    assert.ok(Object.keys(TAG_COLORS).length > 0);
  });

  it('空输入返回空图谱', async () => {
    const { buildGraphData } = await import('../lib/knowledge-graph.js');
    const result = buildGraphData([]);
    assert.equal(result.nodes.length, 0);
  });
});

// ==================== BookmarkCollector 核心 (2 tests) ====================

describe('Smoke: BookmarkCollector 核心功能', () => {
  it('模块可正常导入', async () => {
    const mod = await import('../lib/bookmark-collector.js');
    assert.ok(mod);
    assert.ok(Object.keys(mod).length > 0);
  });

  it('至少导出一个函数', async () => {
    const mod = await import('../lib/bookmark-collector.js');
    const hasFn = Object.values(mod).some(v => typeof v === 'function');
    assert.ok(hasFn, '模块应至少导出一个函数');
  });
});
