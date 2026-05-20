/**
 * 测试 lib/bookmark-visualizer-renderer.js — Canvas 渲染子模块
 * R222: CoverageBreak50
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderFrame,
  isEdgeVisible,
  clearCanvas,
} from '../lib/bookmark-visualizer-renderer.js';

// ==================== isEdgeVisible ====================

describe('isEdgeVisible', () => {
  it('边在视口内', () => {
    const a = { x: 50, y: 50 };
    const b = { x: 150, y: 150 };
    assert.equal(isEdgeVisible(a, b, 0, 0, 200, 200), true);
  });

  it('边完全在视口左侧外', () => {
    const a = { x: -100, y: 50 };
    const b = { x: -50, y: 50 };
    assert.equal(isEdgeVisible(a, b, 0, 0, 200, 200), false);
  });

  it('边完全在视口右侧外', () => {
    const a = { x: 300, y: 50 };
    const b = { x: 350, y: 50 };
    assert.equal(isEdgeVisible(a, b, 0, 0, 200, 200), false);
  });

  it('边完全在视口上方外', () => {
    const a = { x: 50, y: -100 };
    const b = { x: 50, y: -50 };
    assert.equal(isEdgeVisible(a, b, 0, 0, 200, 200), false);
  });

  it('边部分穿过视口', () => {
    const a = { x: -50, y: 100 };
    const b = { x: 250, y: 100 };
    assert.equal(isEdgeVisible(a, b, 0, 0, 200, 200), true);
  });
});

// ==================== clearCanvas ====================

describe('clearCanvas', () => {
  it('调用 ctx.clearRect', () => {
    let called = false;
    let args;
    const ctx = {
      clearRect: (...a) => { called = true; args = a; },
    };
    clearCanvas(ctx, 800, 600);
    assert.ok(called);
    assert.deepEqual(args, [0, 0, 800, 600]);
  });

  it('null ctx 安全处理', () => {
    assert.doesNotThrow(() => clearCanvas(null, 800, 600));
  });
});

// ==================== renderFrame ====================

describe('renderFrame', () => {
  function createMockCtx() {
    return {
      clearRect: () => {},
      fillRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {},
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    };
  }

  it('null ctx 安全返回', () => {
    assert.doesNotThrow(() => renderFrame(null, {}, 800, 600));
  });

  it('渲染带节点和边的状态', () => {
    const ctx = createMockCtx();
    const simNodes = new Map([
      ['A', { x: 100, y: 100 }],
      ['B', { x: 200, y: 200 }],
    ]);
    const nodeData = new Map([
      ['A', { id: 'A', label: 'Alpha', group: 'G1', _degree: 5 }],
      ['B', { id: 'B', label: 'Beta', group: 'G2', _degree: 2 }],
    ]);
    const groupColorMap = new Map([
      ['G1', '#4285F4'],
      ['G2', '#EA4335'],
    ]);
    const state = {
      simNodes,
      edges: [{ source: 'A', target: 'B', weight: 0.5 }],
      nodeData,
      groupColorMap,
      highlighted: new Set(),
      hasHighlight: false,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    assert.doesNotThrow(() => renderFrame(ctx, state, 800, 600));
  });

  it('高亮模式下渲染', () => {
    const ctx = createMockCtx();
    const simNodes = new Map([
      ['A', { x: 100, y: 100 }],
      ['B', { x: 200, y: 200 }],
    ]);
    const nodeData = new Map([
      ['A', { id: 'A', label: 'Alpha', group: 'G1', _degree: 5 }],
      ['B', { id: 'B', label: 'Beta', group: 'G2', _degree: 2 }],
    ]);
    const groupColorMap = new Map([
      ['G1', '#4285F4'],
      ['G2', '#EA4335'],
    ]);
    const state = {
      simNodes,
      edges: [{ source: 'A', target: 'B', weight: 0.5 }],
      nodeData,
      groupColorMap,
      highlighted: new Set(['A']),
      hasHighlight: true,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    assert.doesNotThrow(() => renderFrame(ctx, state, 800, 600));
  });

  it('节点超出视口时裁剪', () => {
    const ctx = createMockCtx();
    const simNodes = new Map([
      ['A', { x: -1000, y: -1000 }],
    ]);
    const nodeData = new Map([
      ['A', { id: 'A', label: 'Far', group: 'G1', _degree: 0 }],
    ]);
    const groupColorMap = new Map([['G1', '#4285F4']]);
    const state = {
      simNodes,
      edges: [],
      nodeData,
      groupColorMap,
      highlighted: new Set(),
      hasHighlight: false,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    assert.doesNotThrow(() => renderFrame(ctx, state, 800, 600));
  });

  it('边的节点不存在时跳过', () => {
    const ctx = createMockCtx();
    const simNodes = new Map([['A', { x: 100, y: 100 }]]);
    const nodeData = new Map([['A', { id: 'A', label: 'A', group: 'G', _degree: 0 }]]);
    const groupColorMap = new Map([['G', '#4285F4']]);
    const state = {
      simNodes,
      edges: [{ source: 'A', target: 'MISSING', weight: 0.5 }],
      nodeData,
      groupColorMap,
      highlighted: new Set(),
      hasHighlight: false,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    };
    assert.doesNotThrow(() => renderFrame(ctx, state, 800, 600));
  });

  it('缩放和平移变换', () => {
    const ctx = createMockCtx();
    let translateArgs = [];
    let scaleArgs = [];
    ctx.translate = (...a) => { translateArgs = a; };
    ctx.scale = (...a) => { scaleArgs = a; };
    const simNodes = new Map();
    const nodeData = new Map();
    const groupColorMap = new Map();
    const state = {
      simNodes,
      edges: [],
      nodeData,
      groupColorMap,
      highlighted: new Set(),
      hasHighlight: false,
      offsetX: 50,
      offsetY: 30,
      scale: 2,
    };
    renderFrame(ctx, state, 800, 600);
    assert.deepEqual(translateArgs, [50, 30]);
    assert.deepEqual(scaleArgs, [2, 2]);
  });
});
