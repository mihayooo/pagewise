import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Stub a minimal canvas context expected by the visualizer
function createFakeCanvas() {
  const ops = [];
  return {
    getContext: () => ({
      clearRect: () => ops.push('clearRect'),
      beginPath: () => ops.push('beginPath'),
      moveTo: () => ops.push('moveTo'),
      lineTo: () => ops.push('lineTo'),
      arc: () => ops.push('arc'),
      fill: () => ops.push('fill'),
      stroke: () => ops.push('stroke'),
      fillText: () => ops.push('fillText'),
      measureText: () => ({ width: 50 }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    }),
    width: 800,
    height: 600,
    __ops: ops,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
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

  it('should initialize with internal state', () => {
    // BookmarkVisualizer stores nodes in _simNodes Map, edges in _edges
    assert.ok(visualizer._simNodes instanceof Map);
    assert.equal(visualizer._simNodes.size, 0);
    assert.deepEqual(visualizer._edges, []);
    assert.equal(visualizer._scale, 1);
    assert.equal(visualizer._offsetX, 0);
    assert.equal(visualizer._offsetY, 0);
  });

  it('should populate nodes via render', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'Node A' }, { id: 'B', label: 'Node B' }],
      edges: [{ source: 'A', target: 'B' }],
    });
    assert.equal(visualizer._simNodes.size, 2);
    assert.ok(visualizer._simNodes.has('A'));
    assert.ok(visualizer._simNodes.has('B'));
    // Stop the animation loop to prevent leaks
    visualizer.stop();
  });

  it('should create edges from graph data via render', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [{ source: 'A', target: 'B', weight: 0.8 }],
    });
    assert.equal(visualizer._edges.length, 1);
    assert.equal(visualizer._edges[0].source, 'A');
    assert.equal(visualizer._edges[0].target, 'B');
    assert.equal(visualizer._edges[0].weight, 0.8);
    visualizer.stop();
  });

  it('should handle zoom in/out and reset', () => {
    visualizer.zoomIn();
    assert.ok(visualizer.getScale() > 1, `scale should be > 1 after zoomIn, got ${visualizer.getScale()}`);
    visualizer.zoomOut();
    assert.ok(Math.abs(visualizer.getScale() - 1) < 0.01, `scale should be ~1 after zoomIn+zoomOut, got ${visualizer.getScale()}`);
    visualizer.zoomIn();
    visualizer.resetZoom();
    assert.equal(visualizer.getScale(), 1);
  });

  it('should render with graph data without throwing', () => {
    visualizer.render({
      nodes: [{ id: 'X', label: 'X' }],
      edges: [],
    });
    visualizer.render(null); // clearCanvas path
    assert.ok(true, 'render completed without error');
    visualizer.stop();
  });

  it('should support highlight and resetHighlight', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      edges: [{ source: 'A', target: 'B' }],
    });
    visualizer.highlight('A');
    assert.ok(visualizer._highlighted.has('A'));
    visualizer.resetHighlight();
    assert.equal(visualizer._highlighted.size, 0);
    visualizer.stop();
  });

  it('should support searchHighlight', () => {
    visualizer.render({
      nodes: [{ id: 'A', label: 'Alpha' }, { id: 'B', label: 'Beta' }],
      edges: [],
    });
    visualizer.searchHighlight('alpha');
    assert.ok(visualizer._highlighted.has('A'));
    assert.ok(!visualizer._highlighted.has('B'));
    visualizer.stop();
  });
});
