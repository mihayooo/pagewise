/**
 * 测试 lib/knowledge-graph-wiki.js — Wiki 图谱数据构建
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { NODE_SHAPES, EDGE_TYPES, classifyEdgeType, buildWikiGraphData } = await import('../lib/knowledge-graph-wiki.js');

// ==================== 常量 ====================

describe('常量', () => {
  it('NODE_SHAPES 正确', () => {
    assert.equal(NODE_SHAPES.CIRCLE, 'circle');
    assert.equal(NODE_SHAPES.SQUARE, 'square');
    assert.equal(NODE_SHAPES.DIAMOND, 'diamond');
  });

  it('EDGE_TYPES 正确', () => {
    assert.equal(EDGE_TYPES.REFERENCE, 'reference');
    assert.equal(EDGE_TYPES.RELATION, 'relation');
    assert.equal(EDGE_TYPES.CONTRADICTION, 'contradiction');
  });
});

// ==================== classifyEdgeType ====================

describe('classifyEdgeType()', () => {
  it('矛盾边', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    const contradictions = [{ entryId1: 1, entryId2: 2 }];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.CONTRADICTION);
  });

  it('矛盾边 - 反向匹配', () => {
    const src = { id: 'qa:2', nodeType: 'qa' };
    const tgt = { id: 'qa:1', nodeType: 'qa' };
    const contradictions = [{ entryId1: 1, entryId2: 2 }];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.CONTRADICTION);
  });

  it('entity 和 qa → reference', () => {
    const src = { id: 'e:1', nodeType: 'entity' };
    const tgt = { id: 'q:1', nodeType: 'qa' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.REFERENCE);
  });

  it('concept 和 qa → reference', () => {
    const src = { id: 'c:1', nodeType: 'concept' };
    const tgt = { id: 'q:1', nodeType: 'qa' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.REFERENCE);
  });

  it('默认 relation', () => {
    const src = { id: 'a', nodeType: 'entity' };
    const tgt = { id: 'b', nodeType: 'entity' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.RELATION);
  });

  it('无 contradictions 数组时默认 relation', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    assert.equal(classifyEdgeType(src, tgt, null), EDGE_TYPES.RELATION);
  });

  it('纯数字 id 提取 entryId', () => {
    const src = { id: '1', nodeType: 'qa' };
    const tgt = { id: '2', nodeType: 'qa' };
    const contradictions = [{ entryId1: 1, entryId2: 2 }];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.CONTRADICTION);
  });

  it('数字类型 id', () => {
    const src = { id: 10, nodeType: 'qa' };
    const tgt = { id: 20, nodeType: 'qa' };
    const contradictions = [{ entryId1: 10, entryId2: 20 }];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.CONTRADICTION);
  });

  it('不可解析的 id 不匹配矛盾', () => {
    const src = { id: 'abc-xyz', nodeType: 'qa' };
    const tgt = { id: 'def-uvw', nodeType: 'qa' };
    const contradictions = [{ entryId1: 1, entryId2: 2 }];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.RELATION);
  });
});

// ==================== buildWikiGraphData ====================

describe('buildWikiGraphData()', () => {
  it('空数据返回空图', () => {
    const result = buildWikiGraphData({});
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it('无有效数据返回空图', () => {
    const result = buildWikiGraphData({ entries: [], entities: [], concepts: [] });
    assert.equal(result.nodes.length, 0);
  });

  it('只有 entities 时创建圆形节点', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'React', type: 'framework', displayName: 'React' }],
    });
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].shape, NODE_SHAPES.CIRCLE);
    assert.equal(result.nodes[0].nodeType, 'entity');
  });

  it('只有 concepts 时创建方形节点', () => {
    const result = buildWikiGraphData({
      concepts: [{ name: 'MVC', displayName: 'MVC Pattern' }],
    });
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].shape, NODE_SHAPES.SQUARE);
    assert.equal(result.nodes[0].nodeType, 'concept');
  });

  it('只有 entries 时创建菱形节点', () => {
    const result = buildWikiGraphData({
      entries: [{ id: 'qa:1', title: 'How to code?', category: '编程' }],
    });
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].shape, NODE_SHAPES.DIAMOND);
    assert.equal(result.nodes[0].nodeType, 'qa');
  });

  it('edges 使用 classifyEdgeType', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'JS', type: 'language' }],
      entries: [{ id: 'qa:1', title: 'Q' }],
      relations: [{ source: 'entity:JS', target: 'qa:1', weight: 0.7 }],
    });
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].edgeType, EDGE_TYPES.REFERENCE);
  });

  it('tagColorMap 构建', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'A', tags: ['web'] }],
      entries: [{ id: 'e1', title: 'T', tags: ['backend'] }],
    });
    assert.ok(result.tagColorMap);
    assert.ok(result.tagColorMap['web']);
    assert.ok(result.tagColorMap['backend']);
  });

  it('maxNodes 限制节点数', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      id: `qa:${i}`, title: `Entry ${i}`,
    }));
    const result = buildWikiGraphData({ entries, maxNodes: 50 });
    assert.ok(result.nodes.length <= 50);
  });

  it('优先保留有关联关系的节点', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `qa:${i}`, title: `Entry ${i}`,
    }));
    const relations = [{ source: 'qa:0', target: 'qa:1', weight: 0.5 }];
    const result = buildWikiGraphData({ entries, relations, maxNodes: 3 });
    const ids = result.nodes.map(n => n.id);
    // qa:0 and qa:1 should be prioritized
    assert.ok(ids.includes('qa:0') || ids.includes('qa:1'));
  });

  it('边权重限制在 0-1 范围', () => {
    const result = buildWikiGraphData({
      entities: [
        { name: 'A', type: 'tool' },
        { name: 'B', type: 'tool' },
      ],
      relations: [{ source: 'entity:A', target: 'entity:B', weight: 5.0 }],
    });
    for (const edge of result.edges) {
      assert.ok(edge.weight >= 0 && edge.weight <= 1);
    }
  });

  it('节点大小基于连接数', () => {
    const result = buildWikiGraphData({
      entities: [
        { name: 'Hub', type: 'tool' },
        { name: 'A', type: 'tool' },
        { name: 'B', type: 'tool' },
      ],
      relations: [
        { source: 'entity:Hub', target: 'entity:A' },
        { source: 'entity:Hub', target: 'entity:B' },
      ],
    });
    const hubNode = result.nodes.find(n => n.id === 'entity:Hub');
    const aNode = result.nodes.find(n => n.id === 'entity:A');
    if (hubNode && aNode) {
      assert.ok(hubNode.size >= aNode.size);
    }
  });

  it('边两端节点不存在时跳过', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'A', type: 'tool' }],
      relations: [{ source: 'entity:A', target: 'entity:Missing' }],
    });
    assert.equal(result.edges.length, 0);
  });
});
