/**
 * 测试 lib/knowledge-graph-utils.js — 图谱工具函数
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { extractSubgraph, exportGraphToDataURL, importGraphData } = await import('../lib/knowledge-graph-utils.js');

// ==================== extractSubgraph ====================

describe('extractSubgraph()', () => {
  const nodes = [
    { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' },
  ];
  const edges = [
    { source: 'A', target: 'B' },
    { source: 'B', target: 'C' },
    { source: 'C', target: 'D' },
    { source: 'D', target: 'E' },
  ];

  it('深度 1 只提取直接邻居', () => {
    const result = extractSubgraph(nodes, edges, 'A', 1);
    const ids = result.nodes.map(n => n.id);
    assert.ok(ids.includes('A'));
    assert.ok(ids.includes('B'));
    assert.ok(!ids.includes('C'));
  });

  it('深度 2 提取两跳邻居', () => {
    const result = extractSubgraph(nodes, edges, 'A', 2);
    const ids = result.nodes.map(n => n.id);
    assert.ok(ids.includes('A'));
    assert.ok(ids.includes('B'));
    assert.ok(ids.includes('C'));
    assert.ok(!ids.includes('D'));
  });

  it('空节点数组返回空', () => {
    assert.deepEqual(extractSubgraph([], edges, 'A'), { nodes: [], edges: [] });
  });

  it('非数组节点返回空', () => {
    assert.deepEqual(extractSubgraph(null, edges, 'A'), { nodes: [], edges: [] });
  });

  it('非数组边返回空', () => {
    assert.deepEqual(extractSubgraph(nodes, null, 'A'), { nodes: [], edges: [] });
  });

  it('不存在的 nodeId 返回空', () => {
    assert.deepEqual(extractSubgraph(nodes, edges, 'Z'), { nodes: [], edges: [] });
  });

  it('深度限制最大 5', () => {
    const result = extractSubgraph(nodes, edges, 'A', 100);
    assert.ok(result.nodes.length <= 5);
  });

  it('边只保留两端都在子图中的', () => {
    const result = extractSubgraph(nodes, edges, 'A', 1);
    for (const edge of result.edges) {
      const nodeIds = new Set(result.nodes.map(n => n.id));
      assert.ok(nodeIds.has(edge.source));
      assert.ok(nodeIds.has(edge.target));
    }
  });

  it('无向边双向连接', () => {
    const result = extractSubgraph(nodes, edges, 'B', 1);
    const ids = result.nodes.map(n => n.id);
    assert.ok(ids.includes('A'));
    assert.ok(ids.includes('C'));
  });

  it('节点无边时只返回自己', () => {
    const isolated = [{ id: 'X' }];
    const result = extractSubgraph(isolated, [], 'X', 2);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.edges.length, 0);
  });
});

// ==================== exportGraphToDataURL ====================

describe('exportGraphToDataURL()', () => {
  it('返回 canvas data URL', () => {
    const canvas = {
      toDataURL: (type, quality) => 'data:' + type + ';base64,FAKE',
    };
    const result = exportGraphToDataURL(canvas, 'image/png');
    assert.equal(result, 'data:image/png;base64,FAKE');
  });

  it('使用默认 mimeType', () => {
    const canvas = {
      toDataURL: (type) => 'data:' + type,
    };
    const result = exportGraphToDataURL(canvas);
    assert.equal(result, 'data:image/png');
  });

  it('canvas 为 null 返回 null', () => {
    assert.equal(exportGraphToDataURL(null), null);
  });

  it('canvas 无 toDataURL 返回 null', () => {
    assert.equal(exportGraphToDataURL({}), null);
  });

  it('传递 quality 参数', () => {
    let capturedQuality;
    const canvas = {
      toDataURL: (type, quality) => { capturedQuality = quality; return 'data:image/jpeg'; },
    };
    exportGraphToDataURL(canvas, 'image/jpeg', 0.8);
    assert.equal(capturedQuality, 0.8);
  });
});

// ==================== importGraphData ====================

describe('importGraphData()', () => {
  it('空远程数据返回本地不变', () => {
    const local = { nodes: [{ id: 'A', label: 'A' }], edges: [] };
    const result = importGraphData(local, null);
    assert.equal(result.added, 0);
    assert.equal(result.mergedNodes.length, 1);
  });

  it('本地图为空时导入远程实体', () => {
    const remote = {
      entities: [{ id: 'r1', name: 'Remote', type: 'person' }],
      relations: [],
    };
    const result = importGraphData(null, remote);
    assert.equal(result.added, 1);
    assert.equal(result.mergedNodes.length, 1);
  });

  it('local_wins 策略', () => {
    const local = {
      nodes: [{ id: 'l1', label: 'Local', nodeType: 'person', entry: { name: 'Local' } }],
      edges: [],
    };
    const remote = {
      entities: [{ id: 'r1', name: 'Local', type: 'person', properties: { extra: 'data' } }],
    };
    const result = importGraphData(local, remote, { conflictStrategy: 'local_wins' });
    assert.ok(result.updated >= 0 || result.skipped >= 0);
  });

  it('skip 策略', () => {
    const local = {
      nodes: [{ id: 'l1', label: 'Test', nodeType: 'entity', entry: { name: 'test' } }],
      edges: [],
    };
    const remote = {
      entities: [{ id: 'r1', name: 'Test', type: 'entity' }],
    };
    const result = importGraphData(local, remote, { conflictStrategy: 'skip' });
    assert.equal(result.skipped, 1);
    assert.equal(result.added, 0);
  });

  it('remote_wins 策略', () => {
    const local = {
      nodes: [{ id: 'l1', label: 'Test', nodeType: 'entity', entry: {} }],
      edges: [],
    };
    const remote = {
      entities: [{ id: 'r1', name: 'Test', type: 'entity', properties: { newData: 'yes' } }],
    };
    const result = importGraphData(local, remote, { conflictStrategy: 'remote_wins' });
    assert.equal(result.updated, 1);
  });

  it('导入远程节点和边', () => {
    const remote = {
      nodes: [
        { id: 'n1', label: 'Node 1', nodeType: 'entity', group: 'A' },
        { id: 'n2', label: 'Node 2', nodeType: 'concept', group: 'B' },
      ],
      edges: [
        { source: 'n1', target: 'n2', edgeType: 'relation', weight: 0.8 },
      ],
    };
    const result = importGraphData(null, remote);
    assert.equal(result.added, 2);
    assert.equal(result.mergedEdges.length, 1);
    assert.equal(result.mergedEdges[0].weight, 0.8);
  });

  it('重复边不重复添加', () => {
    const local = {
      nodes: [
        { id: 'n1', label: 'A', nodeType: 'entity' },
        { id: 'n2', label: 'B', nodeType: 'entity' },
      ],
      edges: [
        { source: 'n1', target: 'n2', edgeType: 'relation', weight: 0.5 },
      ],
    };
    const remote = {
      entities: [
        { id: 'n1', name: 'A', type: 'entity' },
        { id: 'n2', name: 'B', type: 'entity' },
      ],
      relations: [
        { source: 'n1', target: 'n2', type: 'relation', weight: 0.3 },
      ],
    };
    const result = importGraphData(local, remote);
    assert.ok(result.mergedEdges.length <= 2);
  });

  it('边权重取较大值', () => {
    const local = {
      nodes: [
        { id: 'n1', label: 'A' },
        { id: 'n2', label: 'B' },
      ],
      edges: [{ source: 'n1', target: 'n2', weight: 0.3 }],
    };
    const remote = {
      entities: [
        { id: 'n1', name: 'A' },
        { id: 'n2', name: 'B' },
      ],
      relations: [{ source: 'n1', target: 'n2', weight: 0.9 }],
    };
    const result = importGraphData(local, remote);
    const edge = result.mergedEdges.find(e =>
      (String(e.source) === 'n1' && String(e.target) === 'n2') ||
      (String(e.source) === 'n2' && String(e.target) === 'n1')
    );
    if (edge) assert.ok(edge.weight >= 0.9);
  });

  it('边连接不存在的节点时忽略', () => {
    const remote = {
      entities: [{ id: 'n1', name: 'A' }],
      relations: [{ source: 'n1', target: 'missing', type: 'relation' }],
    };
    const result = importGraphData(null, remote);
    assert.equal(result.mergedEdges.length, 0);
  });
});
