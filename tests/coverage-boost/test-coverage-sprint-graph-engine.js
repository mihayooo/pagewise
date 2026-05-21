/**
 * 测试 lib/bookmark-graph-engine.js — BookmarkGraphEngine 书签图谱引擎
 * Coverage Sprint R152
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { BookmarkGraphEngine } = await import('../../lib/bookmark-graph-engine.js');

const sampleBookmarks = [
  { id: 'bm1', title: 'React Tutorial Guide', url: 'https://github.com/react-guide', folderPath: ['Frontend', 'React'] },
  { id: 'bm2', title: 'React Hooks Deep Dive', url: 'https://github.com/react-hooks', folderPath: ['Frontend', 'React'] },
  { id: 'bm3', title: 'Python Flask API', url: 'https://dev.to/flask-api', folderPath: ['Backend', 'Python'] },
  { id: 'bm4', title: 'Docker Deploy', url: 'https://docker.com/guide', folderPath: ['DevOps'] },
  { id: 'bm5', title: 'Vue.js Components', url: 'https://vuejs.org/components', folderPath: ['Frontend', 'Vue'] },
];

// ==================== Constructor ====================

describe('BookmarkGraphEngine constructor', () => {
  it('default state', () => {
    const engine = new BookmarkGraphEngine();
    assert.equal(engine._bookmarkStore.size, 0);
    assert.equal(engine._tokenIndex.size, 0);
    assert.equal(engine._threshold, 0.1);
  });
});

// ==================== buildGraph ====================

describe('BookmarkGraphEngine.buildGraph', () => {
  let engine;
  beforeEach(() => { engine = new BookmarkGraphEngine(); });

  it('空输入返回空图', () => {
    const graph = engine.buildGraph([]);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  });

  it('null 输入返回空图', () => {
    const graph = engine.buildGraph(null);
    assert.deepEqual(graph.nodes, []);
  });

  it('非数组输入返回空图', () => {
    const graph = engine.buildGraph('invalid');
    assert.deepEqual(graph.nodes, []);
  });

  it('单个书签', () => {
    const graph = engine.buildGraph([{ id: '1', title: 'Test', url: 'https://example.com', folderPath: ['Dir'] }]);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, '1');
    assert.equal(graph.nodes[0].label, 'Test');
    assert.equal(graph.edges.length, 0);
  });

  it('多个书签产生节点', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    assert.equal(graph.nodes.length, 5);
    assert.ok(graph.nodes.every(n => n.id && n.label));
  });

  it('相似书签产生边', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    // bm1 and bm2 share "react" token and same domain+folder → should have edge
    const edge12 = graph.edges.find(e =>
      (e.source === 'bm1' && e.target === 'bm2') ||
      (e.source === 'bm2' && e.target === 'bm1')
    );
    assert.ok(edge12, 'bm1-bm2 should have an edge');
    assert.ok(edge12.weight > 0.1);
  });

  it('不相似的书签没有边', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    // bm3 (python flask) and bm4 (docker) — minimal overlap
    const edge34 = graph.edges.find(e =>
      (e.source === 'bm3' && e.target === 'bm4') ||
      (e.source === 'bm4' && e.target === 'bm3')
    );
    if (edge34) {
      assert.ok(edge34.weight < 0.5);
    }
  });

  it('跳过无效书签', () => {
    const graph = engine.buildGraph([
      { id: '1', title: 'Valid' },
      null,
      { noId: true, title: 'No ID' },
      { id: '2', title: 'Valid 2' },
    ]);
    assert.equal(graph.nodes.length, 2);
  });

  it('节点大小与连接数相关', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    for (const node of graph.nodes) {
      assert.ok(node.size >= 1);
    }
  });

  it('节点有 group 字段', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    for (const node of graph.nodes) {
      assert.ok(node.group);
    }
  });

  it('节点 data 包含原始书签', () => {
    const graph = engine.buildGraph(sampleBookmarks);
    const bm1Node = graph.nodes.find(n => n.id === 'bm1');
    assert.equal(bm1Node.data.title, 'React Tutorial Guide');
  });

  it('buildGraph 重复调用清除旧数据', () => {
    engine.buildGraph(sampleBookmarks);
    assert.equal(engine._bookmarkStore.size, 5);
    engine.buildGraph([{ id: 'new1', title: 'New', url: '' }]);
    assert.equal(engine._bookmarkStore.size, 1);
  });
});

// ==================== similarity ====================

describe('BookmarkGraphEngine.similarity', () => {
  let engine;
  beforeEach(() => {
    engine = new BookmarkGraphEngine();
    engine.buildGraph(sampleBookmarks);
  });

  it('相同书签的相似度', () => {
    const sim = engine.similarity('bm1', 'bm2');
    assert.ok(sim > 0, 'bm1 and bm2 should be similar');
    assert.ok(sim <= 1);
  });

  it('不同领域的低相似度', () => {
    const sim = engine.similarity('bm3', 'bm4');
    assert.ok(sim < 0.5);
  });

  it('不存在的书签返回0', () => {
    assert.equal(engine.similarity('nonexistent', 'bm1'), 0);
    assert.equal(engine.similarity('bm1', 'nonexistent'), 0);
  });

  it('支持传入书签对象', () => {
    const sim = engine.similarity(sampleBookmarks[0], sampleBookmarks[1]);
    assert.ok(sim > 0);
  });

  it('空标题书签', () => {
    engine.buildGraph([
      { id: '1', title: '', url: 'https://example.com' },
      { id: '2', title: '', url: 'https://other.com' },
    ]);
    const sim = engine.similarity('1', '2');
    assert.ok(typeof sim === 'number');
  });
});

// ==================== getSimilar ====================

describe('BookmarkGraphEngine.getSimilar', () => {
  let engine;
  beforeEach(() => {
    engine = new BookmarkGraphEngine();
    engine.buildGraph(sampleBookmarks);
  });

  it('获取相似书签', () => {
    const similar = engine.getSimilar('bm1');
    assert.ok(Array.isArray(similar));
    assert.ok(similar.length > 0);
    assert.ok(similar[0].id !== 'bm1');
    assert.ok(similar[0].score > 0);
  });

  it('限制返回数量', () => {
    const similar = engine.getSimilar('bm1', 2);
    assert.ok(similar.length <= 2);
  });

  it('不存在的书签返回空', () => {
    assert.deepEqual(engine.getSimilar('nonexistent'), []);
  });

  it('结果按相似度降序', () => {
    const similar = engine.getSimilar('bm1');
    for (let i = 1; i < similar.length; i++) {
      assert.ok(similar[i - 1].score >= similar[i].score);
    }
  });
});

// ==================== getGraphData ====================

describe('BookmarkGraphEngine.getGraphData', () => {
  it('返回图谱数据的副本', () => {
    const engine = new BookmarkGraphEngine();
    engine.buildGraph(sampleBookmarks);
    const data = engine.getGraphData();
    assert.ok(Array.isArray(data.nodes));
    assert.ok(Array.isArray(data.edges));
    assert.equal(data.nodes.length, 5);
    // Should be a copy
    data.nodes.push('extra');
    assert.equal(engine._graph.nodes.length, 5);
  });
});

// ==================== getClusters ====================

describe('BookmarkGraphEngine.getClusters', () => {
  it('按域名和文件夹聚类', () => {
    const engine = new BookmarkGraphEngine();
    engine.buildGraph(sampleBookmarks);
    const clusters = engine.getClusters();
    assert.ok(clusters.byDomain instanceof Map);
    assert.ok(clusters.byFolder instanceof Map);
    // github.com should have 2 bookmarks
    const githubCluster = clusters.byDomain.get('github.com');
    assert.ok(githubCluster);
    assert.equal(githubCluster.length, 2);
  });

  it('空书签返回空聚类', () => {
    const engine = new BookmarkGraphEngine();
    engine.buildGraph([]);
    const clusters = engine.getClusters();
    assert.equal(clusters.byDomain.size, 0);
    assert.equal(clusters.byFolder.size, 0);
  });
});

// ==================== Internal methods ====================

describe('BookmarkGraphEngine internal methods', () => {
  let engine;
  beforeEach(() => { engine = new BookmarkGraphEngine(); });

  it('_tokenizeTitle 中文逐字分词', () => {
    const tokens = engine._tokenizeTitle('学习编程');
    assert.deepEqual(tokens, ['学', '习', '编', '程']);
  });

  it('_tokenizeTitle 英文小写分词', () => {
    const tokens = engine._tokenizeTitle('React Tutorial');
    assert.deepEqual(tokens, ['react', 'tutorial']);
  });

  it('_tokenizeTitle 混合分词', () => {
    const tokens = engine._tokenizeTitle('React学习');
    assert.ok(tokens.includes('react'));
    assert.ok(tokens.includes('学'));
    assert.ok(tokens.includes('习'));
  });

  it('_tokenizeTitle 空输入', () => {
    assert.deepEqual(engine._tokenizeTitle(''), []);
    assert.deepEqual(engine._tokenizeTitle(null), []);
    assert.deepEqual(engine._tokenizeTitle(undefined), []);
  });

  it('_tokenizeTitle 数字', () => {
    const tokens = engine._tokenizeTitle('ES2024 features');
    assert.ok(tokens.includes('2024'));
    assert.ok(tokens.includes('es'));
  });

  it('_extractDomain 有效URL', () => {
    assert.equal(engine._extractDomain('https://www.github.com/repo'), 'github.com');
    assert.equal(engine._extractDomain('http://example.com'), 'example.com');
  });

  it('_extractDomain 无效URL返回空', () => {
    assert.equal(engine._extractDomain(''), '');
    assert.equal(engine._extractDomain(null), '');
    assert.equal(engine._extractDomain('not-a-url'), '');
  });

  it('_getFolderKey', () => {
    assert.equal(engine._getFolderKey(['A', 'B', 'C']), 'A/B/C');
    assert.equal(engine._getFolderKey([]), '');
    assert.equal(engine._getFolderKey(null), '');
    assert.equal(engine._getFolderKey(undefined), '');
  });

  it('_assignGroup 使用第一级文件夹', () => {
    assert.equal(engine._assignGroup({ folderPath: ['Frontend', 'React'], url: '' }), 'Frontend');
  });

  it('_assignGroup 回退到域名', () => {
    assert.equal(engine._assignGroup({ folderPath: [], url: 'https://github.com' }), 'github.com');
  });

  it('_assignGroup 回退到 default', () => {
    assert.equal(engine._assignGroup({ folderPath: [], url: '' }), 'default');
  });

  it('_jaccard 空集合', () => {
    assert.equal(engine._jaccard([], []), 0);
  });

  it('_jaccard 无交集', () => {
    assert.equal(engine._jaccard(['a', 'b'], ['c', 'd']), 0);
  });

  it('_jaccard 完全重叠', () => {
    assert.equal(engine._jaccard(['a', 'b'], ['a', 'b']), 1);
  });

  it('_jaccard 部分重叠', () => {
    const j = engine._jaccard(['a', 'b', 'c'], ['b', 'c', 'd']);
    assert.equal(j, 2 / 4); // 2 intersection / 4 union
  });

  it('_folderOverlapScore', () => {
    assert.equal(engine._folderOverlapScore(['A', 'B'], ['A', 'B']), 1);
    assert.equal(engine._folderOverlapScore(['A', 'B'], ['C', 'D']), 0);
    assert.equal(engine._folderOverlapScore(['A', 'B', 'C'], ['A', 'B', 'D']), 2 / 3);
    assert.equal(engine._folderOverlapScore([], ['A']), 0);
    assert.equal(engine._folderOverlapScore(null, ['A']), 0);
  });
});
