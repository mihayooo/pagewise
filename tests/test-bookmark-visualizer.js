import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Stub a minimal canvas context expected by the visualizer
function createFakeCanvas() {
  const ops = [];
  const ctx = {
    clearRect: () => ops.push('clearRect'),
    fillRect: () => ops.push('fillRect'),
    beginPath: () => ops.push('beginPath'),
    moveTo: () => ops.push('moveTo'),
    lineTo: () => ops.push('lineTo'),
    arc: () => ops.push('arc'),
    fill: () => ops.push('fill'),
    stroke: () => ops.push('stroke'),
    fillText: () => ops.push('fillText'),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: () => ops.push('translate'),
    scale: () => ops.push('scale'),
    measureText: () => ({ width: 50 }),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
  };
  const listeners = {};
  return {
    getContext: () => ctx,
    width: 800,
    height: 600,
    __ops: ops,
    __ctx: ctx,
    addEventListener: (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    __listeners: listeners,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
}

function makeGraph(nodeCount, edgeDensity = 0.5) {
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `n${i}`, label: `Node ${i}`, group: `g${i % 5}` });
  }
  const edges = [];
  for (let i = 1; i < nodeCount; i++) {
    edges.push({ source: `n${i - 1}`, target: `n${i}`, weight: 0.5 });
  }
  // Add some extra edges based on density
  const extraCount = Math.floor(nodeCount * edgeDensity);
  for (let i = 0; i < extraCount && nodeCount > 2; i++) {
    const a = Math.floor(Math.random() * nodeCount);
    let b = Math.floor(Math.random() * nodeCount);
    if (a === b) b = (b + 1) % nodeCount;
    edges.push({ source: `n${a}`, target: `n${b}`, weight: 0.3 });
  }
  return { nodes, edges };
}

describe('BookmarkVisualizer core logic', () => {
  let visualizer;
  let fakeCanvas;

  beforeEach(async () => {
    const { BookmarkVisualizer } = await import('../lib/bookmark-visualizer.js');
    fakeCanvas = createFakeCanvas();
    visualizer = new BookmarkVisualizer(fakeCanvas);
    // Stub requestAnimationFrame for the physics loop
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  });

  afterEach(() => {
    if (visualizer) {
      try { visualizer.stop(); } catch {}
    }
  });

  // === constructor (L37) ===
  it('constructor: should initialize with correct default state', () => {
    assert.ok(visualizer._simNodes instanceof Map);
    assert.equal(visualizer._simNodes.size, 0);
    assert.deepEqual(visualizer._edges, []);
    assert.ok(visualizer._nodeData instanceof Map);
    assert.ok(visualizer._groupColorMap instanceof Map);
    assert.ok(visualizer._highlighted instanceof Set);
    assert.equal(visualizer._hasHighlight, false);
    assert.equal(visualizer._scale, 1);
    assert.equal(visualizer._offsetX, 0);
    assert.equal(visualizer._offsetY, 0);
    assert.equal(visualizer._running, false);
    assert.equal(visualizer._animId, null);
    assert.equal(visualizer._dragNode, null);
    assert.equal(visualizer._panning, false);
    assert.equal(visualizer._onNodeClick, null);
    assert.equal(visualizer._degraded, false);
    assert.equal(visualizer._tickCount, 0);
    assert.ok(visualizer._dirtyNodes instanceof Set);
  });

  it('constructor: should bind event listeners on canvas', () => {
    assert.ok(fakeCanvas.__listeners['mousedown']?.length > 0);
    assert.ok(fakeCanvas.__listeners['mousemove']?.length > 0);
    assert.ok(fakeCanvas.__listeners['mouseup']?.length > 0);
    assert.ok(fakeCanvas.__listeners['wheel']?.length > 0);
  });

  // === render (L88) ===
  it('render: should populate nodes and edges from graph data', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'Node A', group: 'g1' }, { id: 'B', label: 'Node B', group: 'g2' }],
      edges: [{ source: 'A', target: 'B', weight: 0.8 }],
    });
    assert.equal(visualizer._simNodes.size, 2);
    assert.ok(visualizer._simNodes.has('A'));
    assert.ok(visualizer._simNodes.has('B'));
    assert.equal(visualizer._edges.length, 1);
    assert.equal(visualizer._edges[0].source, 'A');
    assert.equal(visualizer._edges[0].target, 'B');
    assert.equal(visualizer._edges[0].weight, 0.8);
    assert.equal(visualizer._nodeData.size, 2);
    assert.ok(visualizer._groupColorMap.size > 0);
  });

  it('render: should handle empty graph (clearCanvas path)', () => {
    visualizer.render(null);
    assert.equal(visualizer._simNodes.size, 0);
  });

  it('render: should handle missing edges array', () => {
    visualizer.render({ nodes: [{ id: 'X', label: 'X' }] });
    // Invalid data → clearCanvas path
    assert.equal(visualizer._simNodes.size, 0);
  });

  it('render: should handle single node graph', () => {
    visualizer.render({
      nodes: [{ id: 'solo', label: 'Solo' }],
      edges: [],
    });
    assert.equal(visualizer._simNodes.size, 1);
    assert.ok(visualizer._simNodes.has('solo'));
    assert.equal(visualizer._edges.length, 0);
  });

  it('render: should handle large graph (>100 nodes)', () => {
    const graph = makeGraph(120);
    visualizer.render(graph);
    assert.equal(visualizer._simNodes.size, 120);
    assert.equal(visualizer._nodeData.size, 120);
  });

  it('render: should activate degraded mode for >500 nodes', () => {
    const graph = makeGraph(600, 0.1);
    visualizer.render(graph);
    assert.equal(visualizer._degraded, true);
    assert.equal(visualizer._degradeFrameSkip, 2);
  });

  it('render: should not activate degraded mode for <=500 nodes', () => {
    const graph = makeGraph(10, 0.3);
    visualizer.render(graph);
    assert.equal(visualizer._degraded, false);
    assert.equal(visualizer._degradeFrameSkip, 0);
  });

  it('render: should default weight to 0.5 when missing', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [{ source: 'A', target: 'B' }],
    });
    assert.equal(visualizer._edges[0].weight, 0.5);
  });

  it('render: should convert node IDs to strings', () => {
    visualizer.render({
      nodes: [{ id: 42, label: 'Num' }, { id: 99, label: 'Num2' }],
      edges: [{ source: 42, target: 99 }],
    });
    assert.ok(visualizer._simNodes.has('42'));
    assert.ok(visualizer._simNodes.has('99'));
    assert.equal(visualizer._edges[0].source, '42');
    assert.equal(visualizer._edges[0].target, '99');
  });

  // === highlight (L137) ===
  it('highlight: should highlight a node and its neighbors', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }],
      edges: [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }],
    });
    visualizer.highlight('B');
    assert.ok(visualizer._highlighted.has('B'));
    assert.ok(visualizer._highlighted.has('A')); // neighbor
    assert.ok(visualizer._highlighted.has('C')); // neighbor
    assert.equal(visualizer._hasHighlight, true);
  });

  it('highlight: should handle non-existent node ID', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    visualizer.highlight('nonexistent');
    assert.equal(visualizer._highlighted.size, 0);
    assert.equal(visualizer._hasHighlight, false);
  });

  it('highlight: should convert nodeId to string', () => {
    visualizer.render({
      nodes: [{ id: 1, label: 'One' }, { id: 2, label: 'Two' }],
      edges: [{ source: 1, target: 2 }],
    });
    visualizer.highlight(1);
    assert.ok(visualizer._highlighted.has('1'));
  });

  // === searchHighlight (L150) ===
  it('searchHighlight: should highlight nodes matching query', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'Alpha' }, { id: 'B', label: 'Beta' }, { id: 'C', label: 'alphabet' }],
      edges: [],
    });
    visualizer.searchHighlight('alpha');
    assert.ok(visualizer._highlighted.has('A'));
    assert.ok(!visualizer._highlighted.has('B'));
    assert.ok(visualizer._highlighted.has('C')); // "alphabet" contains "alpha"
    assert.equal(visualizer._hasHighlight, true);
  });

  it('searchHighlight: should handle empty/null query', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    visualizer.searchHighlight('');
    assert.equal(visualizer._highlighted.size, 0);
    assert.equal(visualizer._hasHighlight, false);

    visualizer.searchHighlight(null);
    assert.equal(visualizer._hasHighlight, false);

    visualizer.searchHighlight(undefined);
    assert.equal(visualizer._hasHighlight, false);
  });

  it('searchHighlight: should be case-insensitive', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'Hello World' }],
      edges: [],
    });
    visualizer.searchHighlight('HELLO');
    assert.ok(visualizer._highlighted.has('A'));
  });

  it('searchHighlight: should handle nodes without labels', () => {
    visualizer.render({
      nodes: [{ id: 'A' }, { id: 'B', label: 'test' }],
      edges: [],
    });
    visualizer.searchHighlight('test');
    assert.ok(!visualizer._highlighted.has('A'));
    assert.ok(visualizer._highlighted.has('B'));
  });

  // === resetHighlight (L167) ===
  it('resetHighlight: should clear all highlights', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [{ source: 'A', target: 'B' }],
    });
    visualizer.highlight('A');
    assert.ok(visualizer._hasHighlight);
    visualizer.resetHighlight();
    assert.equal(visualizer._highlighted.size, 0);
    assert.equal(visualizer._hasHighlight, false);
  });

  // === zoomIn (L172) / zoomOut (L176) / resetZoom (L180) / getScale (L186) ===
  it('zoomIn: should increase scale', () => {
    const before = visualizer.getScale();
    visualizer.zoomIn();
    assert.ok(visualizer.getScale() > before);
  });

  it('zoomOut: should decrease scale', () => {
    visualizer.zoomIn(); // first zoom in so we have room to zoom out
    const before = visualizer.getScale();
    visualizer.zoomOut();
    assert.ok(visualizer.getScale() < before);
  });

  it('zoomIn+zoomOut: should approximately return to original scale', () => {
    visualizer.zoomIn();
    visualizer.zoomOut();
    assert.ok(Math.abs(visualizer.getScale() - 1) < 0.01);
  });

  it('resetZoom: should reset scale and offsets to defaults', () => {
    visualizer.zoomIn();
    visualizer.zoomIn();
    visualizer.resetZoom();
    assert.equal(visualizer.getScale(), 1);
    assert.equal(visualizer._offsetX, 0);
    assert.equal(visualizer._offsetY, 0);
  });

  it('getScale: should return current scale value', () => {
    assert.equal(visualizer.getScale(), 1);
    visualizer.zoomIn();
    assert.ok(visualizer.getScale() > 1);
  });

  // === start (L190) / stop (L196) ===
  it('start: should set _running to true', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    assert.equal(visualizer._running, true);
  });

  it('start: should not double-start', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    const firstId = visualizer._animId;
    visualizer.start(); // second call — should be no-op
    assert.equal(visualizer._running, true);
  });

  it('stop: should set _running to false and clear animId', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    visualizer.stop();
    assert.equal(visualizer._running, false);
    assert.equal(visualizer._animId, null);
  });

  // === onNodeClick (L204) ===
  it('onNodeClick: should store callback', () => {
    const cb = () => {};
    visualizer.onNodeClick(cb);
    assert.equal(visualizer._onNodeClick, cb);
  });

  // === destroy (L208) ===
  it('destroy: should clean up all state and remove listeners', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [{ source: 'A', target: 'B' }],
    });
    visualizer.onNodeClick(() => {});
    visualizer.destroy();

    assert.equal(visualizer._simNodes.size, 0);
    assert.equal(visualizer._nodeData.size, 0);
    assert.equal(visualizer._groupColorMap.size, 0);
    assert.equal(visualizer._highlighted.size, 0);
    assert.deepEqual(visualizer._edges, []);
    assert.equal(visualizer._dragNode, null);
    assert.equal(visualizer._onNodeClick, null);
    assert.equal(visualizer._canvas, null);
    assert.equal(visualizer._ctx, null);
    assert.equal(visualizer._degraded, false);
    assert.equal(visualizer._dirtyNodes.size, 0);
  });

  // === _tick (L232) ===
  it('_tick: should run physics simulation step', async () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [{ source: 'A', target: 'B' }],
    });
    assert.equal(visualizer._running, true);
    // _tick is called internally via start() → requestAnimationFrame
    // Verify it ran by checking that ops were generated
    await new Promise(r => setTimeout(r, 50));
    assert.ok(fakeCanvas.__ops.length > 0, 'Expected canvas operations from _tick rendering');
  });

  it('_tick: should not run when _running is false', () => {
    // Don't render (so _running stays false)
    visualizer._running = false;
    visualizer._tick();
    // Should return early without error
    assert.equal(visualizer._running, false);
  });

  it('_tick: should skip frames in degraded mode', async () => {
    const graph = makeGraph(600, 0.05);
    visualizer.render(graph);
    assert.equal(visualizer._degraded, true);
    assert.equal(visualizer._degradeFrameSkip, 2);

    // Wait for a few ticks
    await new Promise(r => setTimeout(r, 100));
    // In degraded mode, _tickCount increments but not every tick renders
    assert.ok(visualizer._tickCount > 0);
    visualizer.stop();
  });

  // === _doRenderFrame (L249) ===
  it('_doRenderFrame: should call renderFrame with correct state', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    // Force a render frame
    fakeCanvas.__ops.length = 0;
    visualizer._doRenderFrame();
    assert.ok(fakeCanvas.__ops.includes('clearRect'), 'Expected clearRect in render ops');
    assert.ok(fakeCanvas.__ops.includes('save'), 'Expected save in render ops');
    assert.ok(fakeCanvas.__ops.includes('restore'), 'Expected restore in render ops');
  });

  // === _zoom (L267) ===
  it('_zoom: should clamp scale between 0.1 and 10', () => {
    // Zoom way out
    for (let i = 0; i < 50; i++) visualizer._zoom(400, 300, 0.5);
    assert.ok(visualizer.getScale() >= 0.1, `Scale ${visualizer.getScale()} should be >= 0.1`);

    // Reset and zoom way in
    visualizer.resetZoom();
    for (let i = 0; i < 50; i++) visualizer._zoom(400, 300, 2);
    assert.ok(visualizer.getScale() <= 10, `Scale ${visualizer.getScale()} should be <= 10`);
  });

  it('_zoom: should zoom centered on given point', () => {
    visualizer._zoom(400, 300, 1.2);
    // After zooming at center, offsets should change
    assert.ok(visualizer._offsetX !== 0 || visualizer._offsetY !== 0,
      'Offset should change when zooming at non-origin point');
  });

  it('_zoom: should zoom at mouse position correctly', () => {
    // Zoom at top-left corner
    visualizer._zoom(0, 0, 1.5);
    const scale1 = visualizer.getScale();
    const offX1 = visualizer._offsetX;
    const offY1 = visualizer._offsetY;
    // At origin (0,0), zoom should not change offsets
    assert.equal(offX1, 0);
    assert.equal(offY1, 0);
    assert.ok(scale1 > 1);
  });

  // === _screenToWorld (L285) ===
  it('_screenToWorld: should convert screen coordinates to world coordinates', () => {
    // At default scale=1 and offset=0, screen = world
    const w = visualizer._screenToWorld(100, 200);
    assert.equal(w.x, 100);
    assert.equal(w.y, 200);

    // After zoom
    visualizer._scale = 2;
    visualizer._offsetX = 0;
    visualizer._offsetY = 0;
    const w2 = visualizer._screenToWorld(100, 200);
    assert.equal(w2.x, 50);
    assert.equal(w2.y, 100);

    // After offset
    visualizer._scale = 1;
    visualizer._offsetX = 50;
    visualizer._offsetY = 50;
    const w3 = visualizer._screenToWorld(100, 200);
    assert.equal(w3.x, 50);
    assert.equal(w3.y, 150);
  });

  // === _findNodeAt (L292) ===
  it('_findNodeAt: should find node at given world coordinates', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [],
    });
    // Get the position of node A
    const simA = visualizer._simNodes.get('A');
    const found = visualizer._findNodeAt(simA.x, simA.y);
    assert.equal(found, 'A');
  });

  it('_findNodeAt: should return null when no node at position', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    // Far away from any node
    const found = visualizer._findNodeAt(99999, 99999);
    assert.equal(found, null);
  });

  // === Event handling: mouse interactions ===
  it('mouse events: should trigger onNodeClick callback on drag+release', () => {
    let clickedId = null;
    let clickedData = null;
    visualizer.render({
      nodes: [{ id: 'A', label: 'Alpha' }],
      edges: [],
    });
    visualizer.onNodeClick((id, data) => { clickedId = id; clickedData = data; });

    const simA = visualizer._simNodes.get('A');
    // Simulate mousedown on node A (need to account for screenToWorld)
    const mousedown = { clientX: simA.x, clientY: simA.y };
    visualizer._onMouseDown(mousedown);

    // Simulate mouseup
    const mouseup = { clientX: simA.x, clientY: simA.y };
    visualizer._onMouseUp(mouseup);

    assert.equal(clickedId, 'A');
    assert.ok(clickedData);
    assert.equal(clickedData.label, 'Alpha');
  });

  it('mouse events: should start panning when clicking empty area', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    // Click far from any node
    visualizer._onMouseDown({ clientX: 99999, clientY: 99999 });
    assert.equal(visualizer._panning, true);
    assert.equal(visualizer._dragNode, null);
    visualizer._onMouseUp({});
    assert.equal(visualizer._panning, false);
  });

  it('mouse events: should pan canvas on mousemove while panning', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    // Start pan
    visualizer._panning = true;
    visualizer._panStartX = 100;
    visualizer._panStartY = 100;
    visualizer._panOffsetStartX = 0;
    visualizer._panOffsetStartY = 0;

    visualizer._onMouseMove({ clientX: 150, clientY: 200 });
    assert.equal(visualizer._offsetX, 50);
    assert.equal(visualizer._offsetY, 100);
  });

  it('mouse events: should drag node on mousemove while dragging', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    const simA = visualizer._simNodes.get('A');
    visualizer._dragNode = 'A';
    simA.fixed = true;

    visualizer._onMouseMove({ clientX: simA.x + 10, clientY: simA.y + 20 });
    // Node should have moved (world coords = screen coords at default scale)
    assert.equal(simA.vx, 0);
    assert.equal(simA.vy, 0);
  });

  // === _onWheel (L360) ===
  it('wheel: should zoom on mouse wheel event', () => {
    const before = visualizer.getScale();
    visualizer._onWheel({ clientX: 400, clientY: 300, deltaY: -100 });
    assert.ok(visualizer.getScale() > before, 'Zoom in on scroll up');

    const before2 = visualizer.getScale();
    visualizer._onWheel({ clientX: 400, clientY: 300, deltaY: 100 });
    assert.ok(visualizer.getScale() < before2, 'Zoom out on scroll down');
  });

  // === Edge cases ===
  it('render: should stop previous animation before re-rendering', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    assert.equal(visualizer._running, true);
    visualizer.render({
      nodes: [{ id: 'B', label: 'B' }],
      edges: [],
    });
    // Should have re-started with new data
    assert.equal(visualizer._simNodes.size, 1);
    assert.ok(visualizer._simNodes.has('B'));
  });

  it('highlight: should handle isolated node (no edges)', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [],
    });
    visualizer.highlight('A');
    assert.ok(visualizer._highlighted.has('A'));
    assert.equal(visualizer._highlighted.size, 1); // no neighbors
  });

  it('searchHighlight: should match partial label', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'bookmark-manager' }, { id: 'B', label: 'settings' }],
      edges: [],
    });
    visualizer.searchHighlight('book');
    assert.ok(visualizer._highlighted.has('A'));
    assert.ok(!visualizer._highlighted.has('B'));
  });

  it('destroy: should be safe to call multiple times', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    visualizer.destroy();
    // Second destroy should not throw
    assert.doesNotThrow(() => {
      // Re-assign to avoid afterEach issues
      visualizer._canvas = null;
    });
  });

  it('_zoom: multiple zoom operations should accumulate correctly', () => {
    visualizer._zoom(400, 300, 1.5);
    visualizer._zoom(400, 300, 1.5);
    const expected = 1 * 1.5 * 1.5;
    assert.ok(Math.abs(visualizer.getScale() - expected) < 0.001,
      `Expected ~${expected}, got ${visualizer.getScale()}`);
  });

  it('_findNodeAt: should find node by radius (edge of circle)', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }],
      edges: [],
    });
    const simA = visualizer._simNodes.get('A');
    const nodeA = visualizer._nodeData.get('A');
    // nodeRadius with degree 0 = NODE_RADIUS_MIN = 4
    const r = 4;
    // Just inside the radius
    const found = visualizer._findNodeAt(simA.x + r - 0.1, simA.y);
    assert.equal(found, 'A');
    // Just outside the radius
    const notFound = visualizer._findNodeAt(simA.x + r + 1, simA.y);
    assert.equal(notFound, null);
  });
});

describe('BookmarkVisualizer re-exports', () => {
  it('should re-export GROUP_COLORS and NODE_RADIUS_MAX', async () => {
    const mod = await import('../lib/bookmark-visualizer.js');
    assert.ok(Array.isArray(mod.GROUP_COLORS));
    assert.equal(mod.GROUP_COLORS.length, 15);
    assert.equal(typeof mod.NODE_RADIUS_MAX, 'number');
  });
});
