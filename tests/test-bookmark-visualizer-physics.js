/**
 * 测试 lib/bookmark-visualizer-physics.js — 物理仿真引擎
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_COLORS,
  NODE_RADIUS_MIN,
  NODE_RADIUS_MAX,
  REPULSION_K,
  SPRING_K,
  SPRING_LENGTH,
  DAMPING,
  MIN_VELOCITY,
  MAX_ITERATIONS,
  simulateStep,
  computeDegree,
  assignGroupColors,
  nodeRadius,
} from '../lib/bookmark-visualizer-physics.js';

// ==================== 常量 ====================

describe('bookmark-visualizer-physics constants', () => {
  it('GROUP_COLORS 应为 15 色', () => {
    assert.equal(GROUP_COLORS.length, 15);
    assert.ok(GROUP_COLORS.every(c => c.startsWith('#')));
  });

  it('半径范围合理', () => {
    assert.ok(NODE_RADIUS_MIN < NODE_RADIUS_MAX);
    assert.equal(NODE_RADIUS_MIN, 4);
    assert.equal(NODE_RADIUS_MAX, 20);
  });

  it('力仿真参数为正数', () => {
    assert.ok(REPULSION_K > 0);
    assert.ok(SPRING_K > 0);
    assert.ok(SPRING_LENGTH > 0);
    assert.ok(DAMPING > 0 && DAMPING < 1);
    assert.ok(MIN_VELOCITY > 0);
    assert.ok(MAX_ITERATIONS > 0);
  });
});

// ==================== simulateStep ====================

describe('simulateStep', () => {
  it('两个节点产生斥力位移', () => {
    const simNodes = new Map([
      ['A', { x: 100, y: 100, vx: 0, vy: 0 }],
      ['B', { x: 110, y: 100, vx: 0, vy: 0 }],
    ]);
    simulateStep(simNodes, []);
    // 经过斥力后两节点应该进一步分离
    const a = simNodes.get('A');
    const b = simNodes.get('B');
    assert.notEqual(a.x, 100);
    assert.notEqual(b.x, 110);
  });

  it('固定节点不受力影响', () => {
    const simNodes = new Map([
      ['A', { x: 100, y: 100, vx: 0, vy: 0, fixed: true }],
      ['B', { x: 110, y: 100, vx: 0, vy: 0 }],
    ]);
    simulateStep(simNodes, []);
    assert.equal(simNodes.get('A').x, 100);
  });

  it('边产生弹簧引力', () => {
    const simNodes = new Map([
      ['A', { x: 0, y: 0, vx: 0, vy: 0 }],
      ['B', { x: 300, y: 0, vx: 0, vy: 0 }],
    ]);
    const edges = [{ source: 'A', target: 'B' }];
    const distBefore = 300;
    simulateStep(simNodes, edges);
    const distAfter = Math.abs(simNodes.get('B').x - simNodes.get('A').x);
    // 弹簧力应该拉近节点（距离 > SPRING_LENGTH=120 时产生引力）
    assert.ok(distAfter < distBefore);
  });

  it('无效边（不存在的节点）安全处理', () => {
    const simNodes = new Map([
      ['A', { x: 0, y: 0, vx: 0, vy: 0 }],
    ]);
    const edges = [{ source: 'A', target: 'MISSING' }];
    assert.doesNotThrow(() => simulateStep(simNodes, edges));
  });

  it('速度低于阈值时清零', () => {
    const simNodes = new Map([
      ['A', { x: 100, y: 100, vx: 0.0001, vy: 0.0001 }],
    ]);
    simulateStep(simNodes, []);
    assert.equal(simNodes.get('A').vx, 0);
    assert.equal(simNodes.get('A').vy, 0);
  });

  it('重叠节点不导致 NaN', () => {
    const simNodes = new Map([
      ['A', { x: 100, y: 100, vx: 0, vy: 0 }],
      ['B', { x: 100, y: 100, vx: 0, vy: 0 }],
    ]);
    simulateStep(simNodes, []);
    assert.ok(!isNaN(simNodes.get('A').x));
    assert.ok(!isNaN(simNodes.get('B').x));
  });
});

// ==================== computeDegree ====================

describe('computeDegree', () => {
  it('计算连接度', () => {
    const nodeData = new Map([
      ['A', {}],
      ['B', {}],
      ['C', {}],
    ]);
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
    ];
    computeDegree(nodeData, edges);
    assert.equal(nodeData.get('A')._degree, 2);
    assert.equal(nodeData.get('B')._degree, 1);
    assert.equal(nodeData.get('C')._degree, 1);
  });

  it('无边时度为 0', () => {
    const nodeData = new Map([['A', {}], ['B', {}]]);
    computeDegree(nodeData, []);
    assert.equal(nodeData.get('A')._degree, 0);
    assert.equal(nodeData.get('B')._degree, 0);
  });

  it('无效边（节点不存在）安全处理', () => {
    const nodeData = new Map([['A', {}]]);
    const edges = [{ source: 'A', target: 'MISSING' }];
    assert.doesNotThrow(() => computeDegree(nodeData, edges));
    assert.equal(nodeData.get('A')._degree, 1);
  });
});

// ==================== assignGroupColors ====================

describe('assignGroupColors', () => {
  it('为不同 group 分配不同颜色', () => {
    const nodes = [
      { group: 'A' },
      { group: 'B' },
      { group: 'C' },
    ];
    const groupColorMap = new Map();
    assignGroupColors(nodes, groupColorMap);
    assert.equal(groupColorMap.size, 3);
    assert.ok(groupColorMap.has('A'));
    assert.ok(groupColorMap.has('B'));
    assert.notEqual(groupColorMap.get('A'), groupColorMap.get('B'));
  });

  it('相同 group 使用相同颜色', () => {
    const nodes = [{ group: 'X' }, { group: 'X' }];
    const groupColorMap = new Map();
    assignGroupColors(nodes, groupColorMap);
    assert.equal(groupColorMap.size, 1);
  });

  it('无 group 使用 default', () => {
    const nodes = [{}];
    const groupColorMap = new Map();
    assignGroupColors(nodes, groupColorMap);
    assert.ok(groupColorMap.has('default'));
  });

  it('颜色循环使用', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ group: `G${i}` }));
    const groupColorMap = new Map();
    assignGroupColors(nodes, groupColorMap);
    assert.equal(groupColorMap.size, 20);
  });

  it('清空已有 map', () => {
    const groupColorMap = new Map([['old', '#000']]);
    assignGroupColors([{ group: 'new' }], groupColorMap);
    assert.ok(!groupColorMap.has('old'));
  });
});

// ==================== nodeRadius ====================

describe('nodeRadius', () => {
  it('无连接度返回最小半径', () => {
    assert.equal(nodeRadius({}), NODE_RADIUS_MIN);
    assert.equal(nodeRadius({ _degree: 0 }), NODE_RADIUS_MIN);
  });

  it('高连接度接近最大半径', () => {
    const r = nodeRadius({ _degree: 20 });
    assert.equal(r, NODE_RADIUS_MAX);
  });

  it('中间连接度返回中间值', () => {
    const r = nodeRadius({ _degree: 10 });
    assert.ok(r > NODE_RADIUS_MIN);
    assert.ok(r < NODE_RADIUS_MAX);
  });

  it('超过 20 的连接度截断', () => {
    const r = nodeRadius({ _degree: 100 });
    assert.equal(r, NODE_RADIUS_MAX);
  });
});
