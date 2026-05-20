/**
 * 测试 lib/knowledge-graph-wiki.js — Wiki 图谱数据构建（补充测试）
 * R188: knowledge-graph 模块测试补全
 *
 * 覆盖: null/undefined 输入、displayName 优先级、混合数据源、
 *       连接计数、标签聚合、maxNodes 裁剪、空 entry
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { NODE_SHAPES, EDGE_TYPES, classifyEdgeType, buildWikiGraphData } = await import('../lib/knowledge-graph-wiki.js');

// ==================== classifyEdgeType 增强 ====================

describe('classifyEdgeType() 增强', () => {
  it('两个 qa 类型但无 contradictions → RELATION', () => {
    const src = { id: 'qa:1', nodeType: 'qa' };
    const tgt = { id: 'qa:2', nodeType: 'qa' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.RELATION);
  });

  it('空 contradictions 数组 → 不匹配矛盾', () => {
    const src = { id: '1', nodeType: 'qa' };
    const tgt = { id: '2', nodeType: 'qa' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.RELATION);
  });

  it('nodeType 为空字符串时走默认 RELATION', () => {
    const src = { id: 'a', nodeType: '' };
    const tgt = { id: 'b', nodeType: '' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.RELATION);
  });

  it('undefined nodeType 走默认 RELATION', () => {
    const src = { id: 'a' };
    const tgt = { id: 'b' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.RELATION);
  });

  it('numeric id=0 因 falsy 导致 id || "" 变为 "" 无法匹配矛盾', () => {
    // classifyEdgeType 内部使用 sourceNode.id || ''，当 id=0 时
    // 0 || '' → ''（JS falsy），extractEntryId('') → null，跳过矛盾检测
    const src = { id: 0, nodeType: 'qa' };
    const tgt = { id: 1, nodeType: 'qa' };
    const contradictions = [{ entryId1: 0, entryId2: 1 }];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.RELATION);
  });

  it('多条 contradictions 只匹配一条', () => {
    const src = { id: 'qa:10', nodeType: 'qa' };
    const tgt = { id: 'qa:20', nodeType: 'qa' };
    const contradictions = [
      { entryId1: 1, entryId2: 2 },
      { entryId1: 10, entryId2: 20 },
      { entryId1: 3, entryId2: 4 },
    ];
    assert.equal(classifyEdgeType(src, tgt, contradictions), EDGE_TYPES.CONTRADICTION);
  });

  it('concept 和 concept → RELATION', () => {
    const src = { id: 'c:1', nodeType: 'concept' };
    const tgt = { id: 'c:2', nodeType: 'concept' };
    assert.equal(classifyEdgeType(src, tgt, null), EDGE_TYPES.RELATION);
  });

  it('entity 和 concept → RELATION（非 REFERENCE）', () => {
    const src = { id: 'e:1', nodeType: 'entity' };
    const tgt = { id: 'c:1', nodeType: 'concept' };
    assert.equal(classifyEdgeType(src, tgt, []), EDGE_TYPES.RELATION);
  });
});

// ==================== buildWikiGraphData 增强 ====================

describe('buildWikiGraphData() 增强', () => {
  it('null options 返回空图', () => {
    const result = buildWikiGraphData(null);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it('undefined options 返回空图', () => {
    const result = buildWikiGraphData(undefined);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.edges, []);
  });

  it('entity 的 displayName 优先于 name', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'short', displayName: 'Long Display Name', type: 'tool' }],
    });
    assert.equal(result.nodes[0].label, 'Long Display Name');
  });

  it('concept 的 displayName 优先于 name', () => {
    const result = buildWikiGraphData({
      concepts: [{ name: 'short', displayName: 'Detailed Concept Name' }],
    });
    assert.equal(result.nodes[0].label, 'Detailed Concept Name');
  });

  it('entity 无 displayName 时回退到 name', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'FallbackName', type: 'tool' }],
    });
    assert.equal(result.nodes[0].label, 'FallbackName');
  });

  it('entry 无 title 时 label 为"未命名"', () => {
    const result = buildWikiGraphData({
      entries: [{ id: 'qa:1' }],
    });
    assert.equal(result.nodes[0].label, '未命名');
  });

  it('entry 无 category 且无 tags 时 group 为"未分类"', () => {
    const result = buildWikiGraphData({
      entries: [{ id: 'qa:1', title: 'Q' }],
    });
    assert.equal(result.nodes[0].group, '未分类');
  });

  it('三类节点混合: entity + concept + entry', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'E', type: 'tool' }],
      concepts: [{ name: 'C' }],
      entries: [{ id: 'qa:1', title: 'Q' }],
    });
    assert.equal(result.nodes.length, 3);
    const types = result.nodes.map(n => n.nodeType).sort();
    assert.deepEqual(types, ['concept', 'entity', 'qa']);
  });

  it('tagColorMap 覆盖所有来源的 tags', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'E', type: 't', tags: ['backend'] }],
      concepts: [{ name: 'C', tags: ['theory'] }],
      entries: [{ id: 'qa:1', title: 'Q', tags: ['frontend'] }],
    });
    assert.ok(result.tagColorMap['backend']);
    assert.ok(result.tagColorMap['theory']);
    assert.ok(result.tagColorMap['frontend']);
  });

  it('连接数多的节点 size 更大', () => {
    const result = buildWikiGraphData({
      entities: [
        { name: 'Hub', type: 'tool' },
        { name: 'A', type: 'tool' },
        { name: 'B', type: 'tool' },
        { name: 'C', type: 'tool' },
      ],
      relations: [
        { source: 'entity:Hub', target: 'entity:A' },
        { source: 'entity:Hub', target: 'entity:B' },
        { source: 'entity:Hub', target: 'entity:C' },
      ],
    });
    const hub = result.nodes.find(n => n.id === 'entity:Hub');
    const a = result.nodes.find(n => n.id === 'entity:A');
    assert.ok(hub.size > a.size, `Hub(${hub.size}) 应 > A(${a.size})`);
  });

  it('矛盾边的 label 为"矛盾"', () => {
    const result = buildWikiGraphData({
      entries: [
        { id: 'qa:1', title: 'Q1' },
        { id: 'qa:2', title: 'Q2' },
      ],
      relations: [{ source: 'qa:1', target: 'qa:2', weight: 0.5 }],
      contradictions: [{ entryId1: 1, entryId2: 2 }],
    });
    assert.equal(result.edges[0].edgeType, EDGE_TYPES.CONTRADICTION);
    assert.equal(result.edges[0].label, '矛盾');
  });

  it('非矛盾边的 label 为空字符串', () => {
    const result = buildWikiGraphData({
      entities: [
        { name: 'A', type: 'tool' },
        { name: 'B', type: 'tool' },
      ],
      relations: [{ source: 'entity:A', target: 'entity:B', weight: 0.5 }],
    });
    assert.equal(result.edges[0].label, '');
  });

  it('maxNodes=1 裁剪到 1 个节点', () => {
    const result = buildWikiGraphData({
      entries: [
        { id: 'qa:1', title: 'Q1' },
        { id: 'qa:2', title: 'Q2' },
      ],
      maxNodes: 1,
    });
    assert.equal(result.nodes.length, 1);
  });

  it('nodeType 标注正确（entity/concept/qa）', () => {
    const result = buildWikiGraphData({
      entities: [{ name: 'E', type: 'tool' }],
      concepts: [{ name: 'C' }],
      entries: [{ id: 'qa:1', title: 'Q' }],
    });
    const entityNode = result.nodes.find(n => n.nodeType === 'entity');
    const conceptNode = result.nodes.find(n => n.nodeType === 'concept');
    const qaNode = result.nodes.find(n => n.nodeType === 'qa');
    assert.ok(entityNode, '应有 entity 节点');
    assert.ok(conceptNode, '应有 concept 节点');
    assert.ok(qaNode, '应有 qa 节点');
  });
});
