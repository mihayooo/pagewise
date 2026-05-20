/**
 * 测试 lib/knowledge-graph-utils.js — 图谱工具函数
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSubgraph,
  exportGraphToDataURL,
  importGraphData,
} from '../lib/knowledge-graph-utils.js';

// ==================== extractSubgraph ====================

describe('extractSubgraph', () => {
  const nodes = [
    { id: 'A', label: 'Alpha' },
    { id: 'B', label: 'Beta' },
    { id: 'C', label: 'Gamma' },
    { id: 'D', label: 'Delta' },
  ];
  const edges = [
    { source: 'A', target: 'B' },
    { source: 'B', target: 'C' },
  ];

  it('提取单层子图', () => {
    const sub = extractSubgraph(nodes, edges, 'A', 1);
    assert.ok(sub.nodes.length >= 2);
    assert.ok(sub.nodes.some(n => n.id === 'A'));
    assert.ok(sub.nodes.some(n => n.id === 'B'));
  });

  it('提取两层子图', () => {
    const sub = extractSubgraph(nodes, edges, 'A', 2);
    assert.ok(sub.nodes.length >= 3);
  });

  it('空节点返回空', () => {
    assert.deepEqual(extractSubgraph([], edges, 'A'), { nodes: [], edges: [] });
  });

  it('null 节点返回空', () => {
    assert.deepEqual(extractSubgraph(null, edges, 'A'), { nodes: [], edges: [] });
  });

  it('null 边返回空', () => {
    assert.deepEqual(extractSubgraph(nodes, null, 'A'), { nodes: [], edges: [] });
  });

  it('不存在的 nodeId 返回空', () => {
    assert.deepEqual(extractSubgraph(nodes, edges, 'Z'), { nodes: [], edges: [] });
  });

  it('depth 超限自动截断到 5', () => {
    const sub = extractSubgraph(nodes, edges, 'A', 100);
    assert.ok(sub.nodes.length <= nodes.length);
  });

  it('depth 为 0 时修正为 1', () => {
    const sub = extractSubgraph(nodes, edges, 'A', 0);
    assert.ok(sub.nodes.length >= 1);
  });
});

// ==================== exportGraphToDataURL ====================

describe('exportGraphToDataURL', () => {
  it('有效 canvas 返回 dataURL', () => {
    const mockCanvas = {
      toDataURL: (type, quality) => `data:${type};base64,${quality || ''}`,
    };
    const result = exportGraphToDataURL(mockCanvas, 'image/png');
    assert.ok(result.startsWith('data:image/png'));
  });

  it('null canvas 返回 null', () => {
    assert.equal(exportGraphToDataURL(null), null);
  });

  it('无 toDataURL 方法返回 null', () => {
    assert.equal(exportGraphToDataURL({}), null);
  });

  it('默认 type 为 image/png', () => {
    const mockCanvas = { toDataURL: (type) => type };
    assert.equal(exportGraphToDataURL(mockCanvas), 'image/png');
  });

  it('传递 quality 参数', () => {
    let receivedQuality;
    const mockCanvas = { toDataURL: (type, q) => { receivedQuality = q; return 'ok'; } };
    exportGraphToDataURL(mockCanvas, 'image/jpeg', 0.8);
    assert.equal(receivedQuality, 0.8);
  });
});

// ==================== importGraphData ====================

describe('importGraphData', () => {
  it('空远程数据不改变本地', () => {
    const local = { nodes: [{ id: '1', label: 'A' }], edges: [] };
    const result = importGraphData(local, null);
    assert.equal(result.mergedNodes.length, 1);
    assert.equal(result.added, 0);
  });

  it('导入新实体 (entities 格式)', () => {
    const local = { nodes: [], edges: [] };
    const remote = { entities: [{ name: 'X', type: 'concept' }], relations: [] };
    const result = importGraphData(local, remote);
    assert.equal(result.added, 1);
    assert.ok(result.mergedNodes.some(n => n.label === 'X'));
  });

  it('导入新实体 (nodes 格式)', () => {
    const local = { nodes: [], edges: [] };
    const remote = { nodes: [{ id: 'n1', label: 'Y', nodeType: 'topic' }], edges: [] };
    const result = importGraphData(local, remote);
    assert.equal(result.added, 1);
  });

  it('local_wins 策略: 已存在属性保留', () => {
    const local = { nodes: [{ id: '1', label: 'A', entry: { x: 1 } }], edges: [] };
    const remote = { entities: [{ name: 'A', type: 'other', properties: { y: 2 } }] };
    const result = importGraphData(local, remote, { conflictStrategy: 'local_wins' });
    assert.equal(result.updated, 1);
    assert.equal(result.mergedNodes[0].entry.x, 1);
    assert.equal(result.mergedNodes[0].entry.y, 2);
  });

  it('skip 策略: 跳过已存在的', () => {
    const local = { nodes: [{ id: '1', label: 'A', entry: {} }], edges: [] };
    const remote = { entities: [{ name: 'A', type: 'other' }] };
    const result = importGraphData(local, remote, { conflictStrategy: 'skip' });
    assert.equal(result.skipped, 1);
  });

  it('remote_wins 策略: 远程属性填充', () => {
    const local = { nodes: [{ id: '1', label: 'A', entry: {} }], edges: [] };
    const remote = { entities: [{ name: 'A', type: 'other', properties: { key: 'val' } }] };
    const result = importGraphData(local, remote, { conflictStrategy: 'remote_wins' });
    assert.equal(result.updated, 1);
    assert.equal(result.mergedNodes[0].entry.key, 'val');
  });

  it('导入关系边', () => {
    const local = { nodes: [{ id: '1' }, { id: '2' }], edges: [] };
    const remote = { entities: [], relations: [{ source: '1', target: '2', type: 'rel' }] };
    const result = importGraphData(local, remote);
    assert.equal(result.mergedEdges.length, 1);
  });

  it('重复边不导入', () => {
    const local = { nodes: [{ id: '1' }, { id: '2' }], edges: [{ source: '1', target: '2', edgeType: 'rel' }] };
    const remote = { entities: [], relations: [{ source: '1', target: '2', type: 'rel' }] };
    const result = importGraphData(local, remote);
    assert.equal(result.mergedEdges.length, 1);
  });

  it('null localGraph', () => {
    const remote = { entities: [{ name: 'X', type: 't' }], relations: [] };
    const result = importGraphData(null, remote);
    assert.equal(result.added, 1);
  });

  it('null remoteGraphData', () => {
    const result = importGraphData({ nodes: [], edges: [] }, null);
    assert.equal(result.added, 0);
    assert.equal(result.mergedNodes.length, 0);
  });

  it('边的权重重比较更新', () => {
    const local = { nodes: [{ id: '1' }, { id: '2' }], edges: [{ source: '1', target: '2', weight: 0.3 }] };
    const remote = { entities: [], relations: [{ source: '1', target: '2', weight: 0.8 }] };
    const result = importGraphData(local, remote);
    assert.equal(result.mergedEdges[0].weight, 0.8);
  });

  it('边的低权重不更新', () => {
    const local = { nodes: [{ id: '1' }, { id: '2' }], edges: [{ source: '1', target: '2', weight: 0.9 }] };
    const remote = { entities: [], relations: [{ source: '1', target: '2', weight: 0.3 }] };
    const result = importGraphData(local, remote);
    assert.equal(result.mergedEdges[0].weight, 0.9);
  });

  it('remoteGraphData.entities 为 undefined 时安全处理', () => {
    const result = importGraphData({ nodes: [], edges: [] }, {});
    assert.equal(result.added, 0);
  });

  it('remote entity 无 id 时自动生成', () => {
    const remote = { entities: [{ name: 'NewOne', type: 'concept' }] };
    const result = importGraphData({ nodes: [], edges: [] }, remote);
    assert.ok(result.mergedNodes[0].id.startsWith('imported:'));
  });
});
