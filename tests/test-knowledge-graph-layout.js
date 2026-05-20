/**
 * 测试 lib/knowledge-graph-layout.js — 图谱布局与工具函数
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NODES,
  DEFAULT_ITERATIONS,
  TAG_COLORS,
  buildGraphData,
  forceDirectedLayout,
  applyZoomTransform,
  screenToWorld,
  computeMinimapViewport,
  filterGraphByTags,
  buildTooltipText,
} from '../lib/knowledge-graph-layout.js';

// ==================== 常量 ====================

describe('knowledge-graph-layout constants', () => {
  it('MAX_NODES 应为 100', () => {
    assert.equal(MAX_NODES, 100);
  });

  it('DEFAULT_ITERATIONS 应为 50', () => {
    assert.equal(DEFAULT_ITERATIONS, 50);
  });

  it('TAG_COLORS 应为 15 色', () => {
    assert.equal(TAG_COLORS.length, 15);
    assert.ok(TAG_COLORS.every(c => c.startsWith('#')));
  });
});

// ==================== buildGraphData ====================

describe('buildGraphData', () => {
  it('null entries 返回空图', () => {
    const r = buildGraphData(null);
    assert.deepEqual(r.nodes, []);
    assert.deepEqual(r.edges, []);
  });

  it('构建节点和边', () => {
    const entries = [
      { id: '1', title: 'A', tags: ['js'] },
      { id: '2', title: 'B', tags: ['python'] },
    ];
    const relations = [{ source: '1', target: '2', weight: 0.7 }];
    const r = buildGraphData(entries, relations);
    assert.equal(r.nodes.length, 2);
    assert.equal(r.edges.length, 1);
    assert.ok(r.tagColorMap.js);
    assert.ok(r.tagColorMap.python);
  });

  it('无 tags 的条目归为 "未分类"', () => {
    const entries = [{ id: '1', title: 'A' }];
    const r = buildGraphData(entries);
    assert.equal(r.nodes[0].group, '未分类');
  });

  it('无 title 的条目标签为 "未命名"', () => {
    const entries = [{ id: '1', tags: ['x'] }];
    const r = buildGraphData(entries);
    assert.equal(r.nodes[0].label, '未命名');
  });

  it('超出 maxNodes 时截断', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      id: `${i}`, title: `N${i}`, tags: [],
    }));
    const r = buildGraphData(entries, [], 10);
    assert.equal(r.nodes.length, 10);
  });

  it('优先保留有关系的节点', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`, title: `N${i}`, tags: [],
    }));
    const relations = [{ source: '0', target: '1' }];
    const r = buildGraphData(entries, relations, 3);
    assert.ok(r.nodes.some(n => n.id === '0'));
    assert.ok(r.nodes.some(n => n.id === '1'));
  });

  it('节点大小根据连接数缩放', () => {
    const entries = [
      { id: '1', title: 'Hub', tags: [] },
      { id: '2', title: 'A', tags: [] },
      { id: '3', title: 'B', tags: [] },
    ];
    const relations = [
      { source: '1', target: '2' },
      { source: '1', target: '3' },
    ];
    const r = buildGraphData(entries, relations);
    const hub = r.nodes.find(n => n.id === '1');
    const leaf = r.nodes.find(n => n.id === '2');
    assert.ok(hub.size > leaf.size);
  });

  it('边的 weight 裁剪到 [0, 1]', () => {
    const entries = [{ id: '1' }, { id: '2' }];
    const relations = [{ source: '1', target: '2', weight: 5 }];
    const r = buildGraphData(entries, relations);
    assert.ok(r.edges[0].weight <= 1);
  });

  it('不包含不存在节点的边', () => {
    const entries = [{ id: '1' }];
    const relations = [{ source: '1', target: '999' }];
    const r = buildGraphData(entries, relations);
    assert.equal(r.edges.length, 0);
  });
});

// ==================== forceDirectedLayout ====================

describe('forceDirectedLayout', () => {
  it('空节点返回空', () => {
    assert.deepEqual(forceDirectedLayout([], []), []);
    assert.deepEqual(forceDirectedLayout(null, []), null);
  });

  it('单节点居中', () => {
    const nodes = [{ id: 'A' }];
    const result = forceDirectedLayout(nodes, [], 5);
    assert.ok(typeof result[0].x === 'number');
    assert.ok(typeof result[0].y === 'number');
  });

  it('多节点不重叠', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    forceDirectedLayout(nodes, [], 20);
    const positions = nodes.map(n => `${n.x},${n.y}`);
    const unique = new Set(positions);
    assert.equal(unique.size, 3);
  });

  it('边产生引力效果', () => {
    const nodesA = [{ id: 'A' }, { id: 'B' }];
    const nodesB = [{ id: 'A' }, { id: 'B' }];
    forceDirectedLayout(nodesA, [], 30);
    forceDirectedLayout(nodesB, [{ source: 'A', target: 'B', weight: 1 }], 30);
    // 有边的节点距离应该更近
    const distA = Math.hypot(nodesA[0].x - nodesA[1].x, nodesA[0].y - nodesA[1].y);
    const distB = Math.hypot(nodesB[0].x - nodesB[1].x, nodesB[0].y - nodesB[1].y);
    assert.ok(distB < distA);
  });

  it('已初始化位置的节点不重新初始化', () => {
    const nodes = [{ id: 'A', x: 10, y: 10, vx: 0, vy: 0 }];
    forceDirectedLayout(nodes, [], 1);
    assert.notEqual(nodes[0].x, 0);
  });

  it('清理临时属性 (vx, vy, fx, fy)', () => {
    const nodes = [{ id: 'A' }];
    forceDirectedLayout(nodes, [], 5);
    assert.equal(nodes[0].vx, undefined);
    assert.equal(nodes[0].vy, undefined);
    assert.equal(nodes[0].fx, undefined);
    assert.equal(nodes[0].fy, undefined);
  });

  it('自定义 options', () => {
    const nodes = [{ id: 'A' }];
    forceDirectedLayout(nodes, [], 1, { width: 1200, height: 800 });
    assert.ok(typeof nodes[0].x === 'number');
  });
});

// ==================== applyZoomTransform ====================

describe('applyZoomTransform', () => {
  it('空数组返回空', () => {
    assert.deepEqual(applyZoomTransform([]), []);
    assert.deepEqual(applyZoomTransform(null), []);
  });

  it('缩放和平移', () => {
    const nodes = [{ id: 'A', x: 10, y: 20 }];
    const result = applyZoomTransform(nodes, { scale: 2, offsetX: 5, offsetY: 10 });
    assert.equal(result[0].x, 25);
    assert.equal(result[0].y, 50);
  });

  it('默认 transform', () => {
    const nodes = [{ id: 'A', x: 10, y: 20 }];
    const result = applyZoomTransform(nodes, null);
    assert.equal(result[0].x, 10);
    assert.equal(result[0].y, 20);
  });

  it('不修改原始节点', () => {
    const nodes = [{ id: 'A', x: 10, y: 20 }];
    const result = applyZoomTransform(nodes, { scale: 2 });
    assert.notEqual(result[0], nodes[0]);
    assert.equal(nodes[0].x, 10);
  });
});

// ==================== screenToWorld ====================

describe('screenToWorld', () => {
  it('默认 transform', () => {
    const r = screenToWorld(100, 200, null);
    assert.equal(r.x, 100);
    assert.equal(r.y, 200);
  });

  it('带缩放和平移', () => {
    const r = screenToWorld(110, 220, { scale: 2, offsetX: 10, offsetY: 20 });
    assert.equal(r.x, 50);
    assert.equal(r.y, 100);
  });

  it('scale 为 0 时直接返回原坐标', () => {
    const r = screenToWorld(100, 200, { scale: 0 });
    assert.equal(r.x, 100);
    assert.equal(r.y, 200);
  });
});

// ==================== computeMinimapViewport ====================

describe('computeMinimapViewport', () => {
  it('计算视口矩形', () => {
    const r = computeMinimapViewport(800, 600, { scale: 1, offsetX: 0, offsetY: 0 }, 2000, 1500, 200, 150);
    assert.ok(typeof r.x === 'number');
    assert.ok(typeof r.y === 'number');
    assert.ok(r.w >= 4);
    assert.ok(r.h >= 4);
  });

  it('默认 transform', () => {
    const r = computeMinimapViewport(800, 600, null, 2000, 1500, 200, 150);
    assert.ok(typeof r.x === 'number');
  });

  it('尺寸不小于 4', () => {
    const r = computeMinimapViewport(10, 10, { scale: 100 }, 2000, 1500, 200, 150);
    assert.ok(r.w >= 4);
    assert.ok(r.h >= 4);
  });
});

// ==================== filterGraphByTags ====================

describe('filterGraphByTags', () => {
  const nodes = [
    { id: '1', group: 'A' },
    { id: '2', group: 'B' },
    { id: '3', group: 'A' },
  ];
  const edges = [{ source: '1', target: '3' }];

  it('空节点返回空', () => {
    const r = filterGraphByTags([], []);
    assert.equal(r.visibleNodes.length, 0);
  });

  it('null activeTags 返回全部', () => {
    const r = filterGraphByTags(nodes, edges, null);
    assert.equal(r.visibleNodes.length, 3);
    assert.equal(r.hiddenCount, 0);
  });

  it('undefined activeTags 返回全部', () => {
    const r = filterGraphByTags(nodes, edges, undefined);
    assert.equal(r.visibleNodes.length, 3);
  });

  it('空 Set 隐藏全部', () => {
    const r = filterGraphByTags(nodes, edges, new Set());
    assert.equal(r.visibleNodes.length, 0);
    assert.equal(r.hiddenCount, 3);
  });

  it('按标签过滤', () => {
    const r = filterGraphByTags(nodes, edges, new Set(['A']));
    assert.equal(r.visibleNodes.length, 2);
    assert.equal(r.hiddenCount, 1);
  });

  it('过滤后的边只包含可见节点', () => {
    const r = filterGraphByTags(nodes, edges, new Set(['A']));
    assert.equal(r.visibleEdges.length, 1);
  });
});

// ==================== buildTooltipText ====================

describe('buildTooltipText', () => {
  it('基础信息', () => {
    const text = buildTooltipText({ id: '1', label: 'Test', group: 'JS' }, [], null);
    assert.ok(text.includes('Test'));
    assert.ok(text.includes('JS'));
    assert.ok(text.includes('0 个关联'));
  });

  it('无 label 显示未命名', () => {
    const text = buildTooltipText({ id: '1' }, [], null);
    assert.ok(text.includes('未命名'));
  });

  it('计算关联数', () => {
    const edges = [{ source: '1', target: '2' }, { source: '1', target: '3' }];
    const text = buildTooltipText({ id: '1', label: 'Hub' }, edges, null);
    assert.ok(text.includes('2 个关联'));
  });

  it('content 预览', () => {
    const node = { id: '1', label: 'A', entry: { content: 'Hello World' } };
    const text = buildTooltipText(node, [], null);
    assert.ok(text.includes('Hello World'));
  });

  it('长内容截断', () => {
    const node = { id: '1', label: 'A', entry: { content: 'x'.repeat(200) } };
    const text = buildTooltipText(node, [], null);
    assert.ok(text.includes('...'));
  });

  it('无 group 不显示标签行', () => {
    const text = buildTooltipText({ id: '1', label: 'A' }, [], null);
    assert.ok(!text.includes('🏷️'));
  });
});
