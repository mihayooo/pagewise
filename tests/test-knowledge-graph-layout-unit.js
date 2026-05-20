/**
 * 测试 lib/knowledge-graph-layout.js — 图数据构建与力导向布局（补充测试）
 * R188: knowledge-graph 模块测试补全
 *
 * 覆盖: 常量、边界条件、异常路径、高频场景
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

// ==================== 常量验证 ====================

describe('TAG_COLORS 常量', () => {
  it('TAG_COLORS 是非空数组', () => {
    assert.ok(Array.isArray(TAG_COLORS));
    assert.ok(TAG_COLORS.length > 0);
  });

  it('所有颜色都是合法 hex 色值', () => {
    for (const color of TAG_COLORS) {
      assert.match(color, /^#[0-9a-f]{6}$/i, `颜色 ${color} 应为 #rrggbb 格式`);
    }
  });

  it('颜色数量 ≥ 10 种', () => {
    assert.ok(TAG_COLORS.length >= 10, `应有 ≥10 种颜色，实际 ${TAG_COLORS.length}`);
  });
});

// ==================== buildGraphData 边界 ====================

describe('buildGraphData() 边界条件', () => {
  it('非数组 entries 返回空图', () => {
    assert.deepEqual(buildGraphData('not-an-array', []), { nodes: [], edges: [], tagColorMap: {} });
    assert.deepEqual(buildGraphData(42, []), { nodes: [], edges: [], tagColorMap: {} });
    assert.deepEqual(buildGraphData(undefined, []), { nodes: [], edges: [], tagColorMap: {} });
  });

  it('entries 无 tags 无 category 时 group 为"未分类"', () => {
    const entries = [{ id: 1, title: 'No Meta' }];
    const { nodes } = buildGraphData(entries, []);
    assert.equal(nodes[0].group, '未分类');
  });

  it('entry 无 title 时 label 为"未命名"', () => {
    const entries = [{ id: 1, tags: ['a'] }];
    const { nodes } = buildGraphData(entries, []);
    assert.equal(nodes[0].label, '未命名');
  });

  it('同一标签分配相同颜色', () => {
    const entries = [
      { id: 1, title: 'A', tags: ['js'] },
      { id: 2, title: 'B', tags: ['js'] },
    ];
    const { nodes, tagColorMap } = buildGraphData(entries, []);
    assert.equal(nodes[0].color, nodes[1].color);
    assert.ok(tagColorMap['js']);
  });

  it('node.size 上限为 26（6 + 20）', () => {
    const entries = [{ id: 0, title: 'Hub', tags: ['a'] }];
    const relations = [];
    for (let i = 1; i <= 20; i++) {
      entries.push({ id: i, title: `N${i}`, tags: ['a'] });
      relations.push({ source: 0, target: i, weight: 0.5 });
    }
    const { nodes } = buildGraphData(entries, relations);
    const hub = nodes.find(n => n.id === 0);
    assert.ok(hub.size <= 26, `hub.size=${hub.size} 应 ≤ 26`);
  });

  it('无 relations 时所有节点 size 为 6', () => {
    const entries = [
      { id: 1, title: 'A', tags: ['x'] },
      { id: 2, title: 'B', tags: ['y'] },
    ];
    const { nodes } = buildGraphData(entries, []);
    for (const node of nodes) {
      assert.equal(node.size, 6, `无关联节点 size 应为 6，实际 ${node.size}`);
    }
  });

  it('edge.weight 上界恰好为 1', () => {
    const entries = [
      { id: 1, title: 'A', tags: ['x'] },
      { id: 2, title: 'B', tags: ['y'] },
    ];
    const relations = [{ source: 1, target: 2, weight: 1.0 }];
    const { edges } = buildGraphData(entries, relations);
    assert.equal(edges[0].weight, 1);
  });

  it('entries 数量 > maxNodes 时裁剪到 maxNodes', () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({ id: i, title: `T${i}`, tags: ['t'] }));
    const { nodes } = buildGraphData(entries, [], 10);
    assert.equal(nodes.length, 10);
  });

  it('优先保留有关联的节点（裁剪场景）', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ id: i, title: `T${i}`, tags: ['t'] }));
    const relations = [{ source: 0, target: 1, weight: 0.5 }];
    const { nodes } = buildGraphData(entries, relations, 2);
    const ids = nodes.map(n => n.id);
    assert.ok(ids.includes(0), '应保留有关联的节点 0');
    assert.ok(ids.includes(1), '应保留有关联的节点 1');
  });
});

// ==================== forceDirectedLayout 边界 ====================

describe('forceDirectedLayout() 边界条件', () => {
  it('极近节点经斥力分离', () => {
    // 用微小偏移代替完全重叠（完全重叠时 dx=dy=0 → 力方向为零向量，不会分离）
    const nodes = [
      { id: 1, label: 'A', size: 10, x: 300, y: 200, vx: 0, vy: 0 },
      { id: 2, label: 'B', size: 10, x: 300.1, y: 200.1, vx: 0, vy: 0 },
    ];
    forceDirectedLayout(nodes, [], 50, { width: 600, height: 400 });
    const dx = nodes[1].x - nodes[0].x;
    const dy = nodes[1].y - nodes[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    assert.ok(dist > 1, `极近节点经斥力应分离, dist=${dist.toFixed(2)}`);
  });

  it('节点位置始终为有限数（不爆炸）', () => {
    // 10 个节点自动初始化（初始间距足够，不触发 NaN）
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: i, label: `N${i}`, size: 8,
    }));
    forceDirectedLayout(nodes, [], 30, { width: 600, height: 400 });
    for (const node of nodes) {
      assert.ok(isFinite(node.x), `node.x=${node.x} 应为有限数`);
      assert.ok(isFinite(node.y), `node.y=${node.y} 应为有限数`);
    }
  });

  it('自引用边不影响布局', () => {
    const nodes = [
      { id: 1, label: 'A', size: 10 },
      { id: 2, label: 'B', size: 10 },
    ];
    const edges = [{ source: 1, target: 1, weight: 0.5 }];
    const result = forceDirectedLayout(nodes, edges, 10, { width: 600, height: 400 });
    assert.equal(result.length, 2);
    assert.ok(isFinite(result[0].x));
  });

  it('edges 引用不存在的节点不崩溃', () => {
    const nodes = [{ id: 1, label: 'A', size: 10 }];
    const edges = [{ source: 1, target: 999, weight: 0.5 }];
    const result = forceDirectedLayout(nodes, edges, 10);
    assert.equal(result.length, 1);
  });

  it('已初始化 x/y 的节点被保留（不重新初始化）', () => {
    const nodes = [
      { id: 1, label: 'A', size: 10, x: 42, y: 77, vx: 0, vy: 0 },
      { id: 2, label: 'B', size: 10, x: 200, y: 150, vx: 0, vy: 0 },
    ];
    forceDirectedLayout(nodes, [], 0, { width: 600, height: 400 });
    // 0 iterations: x/y should be kept exactly
    assert.equal(nodes[0].x, 42);
    assert.equal(nodes[0].y, 77);
  });

  it('所有节点在 padding=40 边界内', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: i, label: `N${i}`, size: 8,
    }));
    forceDirectedLayout(nodes, [], 50, { width: 800, height: 600 });
    for (const node of nodes) {
      assert.ok(node.x >= 40, `node.x=${node.x} 应 ≥ 40`);
      assert.ok(node.x <= 760, `node.x=${node.x} 应 ≤ 760`);
      assert.ok(node.y >= 40, `node.y=${node.y} 应 ≥ 40`);
      assert.ok(node.y <= 560, `node.y=${node.y} 应 ≤ 560`);
    }
  });
});

// ==================== applyZoomTransform 边界 ====================

describe('applyZoomTransform() 边界', () => {
  it('null nodes 返回空数组', () => {
    assert.deepEqual(applyZoomTransform(null, { scale: 1 }), []);
  });

  it('transform 为 undefined 时使用默认值', () => {
    const nodes = [{ id: 1, x: 100, y: 200 }];
    const result = applyZoomTransform(nodes, undefined);
    assert.equal(result[0].x, 100);
    assert.equal(result[0].y, 200);
  });

  it('transform 为空对象时使用默认值', () => {
    const nodes = [{ id: 1, x: 100, y: 200 }];
    const result = applyZoomTransform(nodes, {});
    assert.equal(result[0].x, 100);
    assert.equal(result[0].y, 200);
  });

  it('scale=0 将所有坐标映射到 offset', () => {
    const nodes = [{ id: 1, x: 999, y: 888 }];
    const result = applyZoomTransform(nodes, { scale: 0, offsetX: 10, offsetY: 20 });
    assert.equal(result[0].x, 10);
    assert.equal(result[0].y, 20);
  });

  it('preserve extra node properties (nodeType, shape, entry)', () => {
    const nodes = [{ id: 1, x: 0, y: 0, nodeType: 'entity', shape: 'circle', entry: { name: 'A' } }];
    const result = applyZoomTransform(nodes, { scale: 2, offsetX: 0, offsetY: 0 });
    assert.equal(result[0].nodeType, 'entity');
    assert.equal(result[0].shape, 'circle');
    assert.deepEqual(result[0].entry, { name: 'A' });
  });
});

// ==================== screenToWorld 边界 ====================

describe('screenToWorld() 边界', () => {
  it('scale=0 时返回原始值（防除零）', () => {
    const result = screenToWorld(100, 200, { scale: 0 });
    assert.equal(result.x, 100);
    assert.equal(result.y, 200);
  });

  it('transform 为 undefined 时 identity', () => {
    const result = screenToWorld(50, 75, undefined);
    assert.equal(result.x, 50);
    assert.equal(result.y, 75);
  });

  it('负坐标正确转换', () => {
    const transform = { scale: 2, offsetX: 0, offsetY: 0 };
    const result = screenToWorld(-100, -200, transform);
    assert.equal(result.x, -50);
    assert.equal(result.y, -100);
  });
});

// ==================== computeMinimapViewport 边界 ====================

describe('computeMinimapViewport() 边界', () => {
  it('minimap 和 canvas 同尺寸 1:1 映射', () => {
    const result = computeMinimapViewport(100, 100, { scale: 1, offsetX: 0, offsetY: 0 }, 100, 100, 100, 100);
    assert.equal(result.x, 0);
    assert.equal(result.y, 0);
    assert.equal(result.w, 100);
    assert.equal(result.h, 100);
  });

  it('viewport 宽高至少为 4（保底最小尺寸）', () => {
    // extreme zoom-in: scale=100 → viewport very small
    const result = computeMinimapViewport(600, 400, { scale: 100, offsetX: 0, offsetY: 0 }, 600, 400, 120, 80);
    assert.ok(result.w >= 4, `w=${result.w} 应 ≥ 4`);
    assert.ok(result.h >= 4, `h=${result.h} 应 ≥ 4`);
  });

  it('transform 为 undefined 时使用默认值', () => {
    const result = computeMinimapViewport(600, 400, undefined, 600, 400, 120, 80);
    assert.equal(typeof result.x, 'number');
    assert.ok(isFinite(result.x));
  });
});

// ==================== filterGraphByTags 边界 ====================

describe('filterGraphByTags() 边界', () => {
  it('undefined activeTags 返回全部节点', () => {
    const nodes = [{ id: 1, group: 'A' }, { id: 2, group: 'B' }];
    const edges = [];
    const result = filterGraphByTags(nodes, edges, undefined);
    assert.equal(result.visibleNodes.length, 2);
    assert.equal(result.hiddenCount, 0);
  });

  it('所有节点 group 不同时，过滤单个 group 只返回 1 个节点', () => {
    const nodes = [
      { id: 1, group: 'A' }, { id: 2, group: 'B' }, { id: 3, group: 'C' },
    ];
    const edges = [];
    const result = filterGraphByTags(nodes, edges, new Set(['B']));
    assert.equal(result.visibleNodes.length, 1);
    assert.equal(result.visibleNodes[0].id, 2);
    assert.equal(result.hiddenCount, 2);
  });

  it('null nodes 返回空结果', () => {
    const result = filterGraphByTags(null, [], new Set(['A']));
    assert.equal(result.visibleNodes.length, 0);
    assert.equal(result.hiddenCount, 0);
  });
});

// ==================== buildTooltipText 边界 ====================

describe('buildTooltipText() 边界', () => {
  it('node 无 label 时显示"未命名"', () => {
    const node = { id: 1, group: 'A', size: 6 };
    const text = buildTooltipText(node, [], {});
    assert.ok(text.startsWith('未命名'));
  });

  it('node 无 group 时不显示标签行', () => {
    const node = { id: 1, label: 'Test', size: 6 };
    const text = buildTooltipText(node, [], {});
    assert.ok(!text.includes('🏷️'));
  });

  it('entry.content 正好 80 字不截断', () => {
    const content80 = 'A'.repeat(80);
    const node = { id: 1, label: 'L', group: 'G', size: 6, entry: { content: content80 } };
    const text = buildTooltipText(node, [], {});
    assert.ok(!text.includes('...'), '80 字不应截断');
  });

  it('entry.content 81 字截断带省略号', () => {
    const content81 = 'A'.repeat(81);
    const node = { id: 1, label: 'L', group: 'G', size: 6, entry: { content: content81 } };
    const text = buildTooltipText(node, [], {});
    assert.ok(text.includes('...'), '81 字应截断');
  });

  it('多条关联正确计数', () => {
    const node = { id: 'A', label: 'Hub', group: 'G', size: 6 };
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'C', target: 'A' },
      { source: 'A', target: 'D' },
      { source: 'X', target: 'Y' }, // 不相关
    ];
    const text = buildTooltipText(node, edges, {});
    assert.ok(text.includes('3'), `应有 3 个关联，实际: ${text}`);
  });
});
