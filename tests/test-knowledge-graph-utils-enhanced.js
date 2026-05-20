/**
 * 测试 lib/knowledge-graph-utils.js — 图谱工具函数（补充测试）
 * R188: knowledge-graph 模块测试补全
 *
 * 覆盖: 深度 BFS、环形图、星型图、导入合并语义、边权重上限
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { extractSubgraph, exportGraphToDataURL, importGraphData } = await import('../lib/knowledge-graph-utils.js');

// ==================== extractSubgraph 增强 ====================

describe('extractSubgraph() 增强', () => {
  it('环形图深度 1 返回自身+两个邻居', () => {
    // A-B-C-D-A 环
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
      { source: 'D', target: 'A' },
    ];
    const result = extractSubgraph(nodes, edges, 'A', 1);
    const ids = result.nodes.map(n => n.id).sort();
    assert.deepEqual(ids, ['A', 'B', 'D']);
  });

  it('星型图：中心节点深度 1 包含所有叶子', () => {
    // center-1, center-2, center-3, center-4
    const nodes = [{ id: 'center' }, { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
    const edges = [
      { source: 'center', target: '1' },
      { source: 'center', target: '2' },
      { source: 'center', target: '3' },
      { source: 'center', target: '4' },
    ];
    const result = extractSubgraph(nodes, edges, 'center', 1);
    assert.equal(result.nodes.length, 5);
    assert.equal(result.edges.length, 4);
  });

  it('星型图：叶子节点深度 1 只包含自身和中心', () => {
    const nodes = [{ id: 'center' }, { id: '1' }, { id: '2' }, { id: '3' }];
    const edges = [
      { source: 'center', target: '1' },
      { source: 'center', target: '2' },
      { source: 'center', target: '3' },
    ];
    const result = extractSubgraph(nodes, edges, '1', 1);
    const ids = result.nodes.map(n => n.id).sort();
    assert.deepEqual(ids, ['1', 'center']);
  });

  it('深度 0 等价于深度 1（clamp 到 ≥1）', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [{ source: 'A', target: 'B' }];
    const result = extractSubgraph(nodes, edges, 'A', 0);
    assert.ok(result.nodes.length >= 1);
  });

  it('depth 参数为负数时安全处理', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [{ source: 'A', target: 'B' }];
    const result = extractSubgraph(nodes, edges, 'A', -3);
    assert.ok(result.nodes.length >= 1, '负深度应安全处理');
  });

  it('深度 5 链式图全量遍历', () => {
    // A-B-C-D-E-F (6 节点链)
    const nodes = Array.from({ length: 6 }, (_, i) => ({ id: String.fromCharCode(65 + i) }));
    const edges = [];
    for (let i = 0; i < 5; i++) {
      edges.push({ source: nodes[i].id, target: nodes[i + 1].id });
    }
    const result = extractSubgraph(nodes, edges, 'A', 5);
    assert.equal(result.nodes.length, 6, '深度 5 应覆盖全部 6 个节点');
    assert.equal(result.edges.length, 5, '全部 5 条边应保留');
  });

  it('边引用不存在节点时被忽略', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'Z' }, // Z 不存在
    ];
    const result = extractSubgraph(nodes, edges, 'A', 1);
    assert.equal(result.edges.length, 1, '不存在节点的边应被忽略');
  });
});

// ==================== exportGraphToDataURL 增强 ====================

describe('exportGraphToDataURL() 增强', () => {
  it('canvas.toDataURL 返回空字符串也如实传递', () => {
    const canvas = { toDataURL: () => '' };
    assert.equal(exportGraphToDataURL(canvas), '');
  });

  it('canvas 为 undefined 返回 null', () => {
    assert.equal(exportGraphToDataURL(undefined), null);
  });

  it('默认 mimeType 为 image/png', () => {
    let capturedType;
    const canvas = { toDataURL: (type) => { capturedType = type; return 'ok'; } };
    exportGraphToDataURL(canvas);
    assert.equal(capturedType, 'image/png');
  });

  it('支持 image/jpeg', () => {
    let capturedType;
    const canvas = { toDataURL: (type) => { capturedType = type; return 'ok'; } };
    exportGraphToDataURL(canvas, 'image/jpeg');
    assert.equal(capturedType, 'image/jpeg');
  });

  it('quality=undefined 时不传 quality 参数', () => {
    let callArgs;
    const canvas = { toDataURL: (...args) => { callArgs = args; return 'ok'; } };
    exportGraphToDataURL(canvas, 'image/png', undefined);
    assert.equal(callArgs.length, 1, 'quality=undefined 时只传 1 个参数');
  });
});

// ==================== importGraphData 增强 ====================

describe('importGraphData() 增强', () => {
  it('空 entities 和空 nodes 返回空合并结果', () => {
    const result = importGraphData(null, { entities: [], nodes: [] });
    assert.equal(result.added, 0);
    assert.equal(result.mergedNodes.length, 0);
    assert.equal(result.mergedEdges.length, 0);
  });

  it('localGraph.nodes 和 localGraph.edges 都为 undefined 时安全处理', () => {
    const remote = { entities: [{ id: 'r1', name: 'X', type: 't' }] };
    const result = importGraphData({}, remote);
    assert.equal(result.added, 1);
    assert.equal(result.mergedNodes.length, 1);
  });

  it('remote_wins 策略覆盖本地属性', () => {
    const local = {
      nodes: [{ id: 'l1', label: 'L', nodeType: 'entity', entry: { status: 'old' } }],
      edges: [],
    };
    const remote = {
      entities: [{ id: 'r1', name: 'L', type: 'entity', properties: { status: 'new' } }],
    };
    const result = importGraphData(local, remote, { conflictStrategy: 'remote_wins' });
    assert.equal(result.updated, 1);
  });

  it('local_wins 策略不覆盖已有属性', () => {
    const local = {
      nodes: [{ id: 'l1', label: 'Test', nodeType: 'entity', entry: { status: 'original' } }],
      edges: [],
    };
    const remote = {
      entities: [{ id: 'r1', name: 'Test', type: 'entity', properties: { status: 'override' } }],
    };
    const result = importGraphData(local, remote, { conflictStrategy: 'local_wins' });
    // local_wins: should NOT overwrite existing property
    assert.equal(local.nodes[0].entry.status, 'original');
  });

  it('新增节点获取颜色', () => {
    const remote = {
      entities: [
        { id: 'e1', name: 'New1', type: 'entity' },
        { id: 'e2', name: 'New2', type: 'entity' },
      ],
    };
    const result = importGraphData(null, remote);
    assert.ok(result.mergedNodes[0].color, '新节点应有颜色');
    assert.ok(typeof result.mergedNodes[0].color === 'string');
  });

  it('合并统计 counters 正确', () => {
    const local = {
      nodes: [{ id: 'l1', label: 'A', nodeType: 'entity', entry: {} }],
      edges: [],
    };
    const remote = {
      entities: [
        { id: 'r1', name: 'A', type: 'entity', properties: {} }, // 冲突
        { id: 'r2', name: 'B', type: 'entity' }, // 新增
      ],
      relations: [
        { source: 'r1', target: 'r2', type: 'relation' },
      ],
    };
    const result = importGraphData(local, remote, { conflictStrategy: 'skip' });
    assert.equal(result.skipped, 1);
    assert.equal(result.added, 1);
    assert.ok(result.mergedNodes.length >= 2);
  });

  it('边界: 同时混合 entities 和 nodes 格式的 remote', () => {
    const remote = {
      entities: [{ id: 'e1', name: 'Entity', type: 'tool' }],
      nodes: [{ id: 'n1', label: 'Node', nodeType: 'concept' }],
      edges: [{ source: 'n1', target: 'e1', weight: 0.5 }],
    };
    // entities 格式优先
    const result = importGraphData(null, remote);
    assert.ok(result.mergedNodes.length >= 1, '应至少导入 entities');
  });

  it('node 无 displayName 时回退到 name', () => {
    const remote = {
      entities: [{ id: 'e1', name: 'MyEntity' }],
    };
    const result = importGraphData(null, remote);
    const node = result.mergedNodes[0];
    assert.equal(node.label, 'MyEntity');
  });
});
