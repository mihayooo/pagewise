/**
 * BookmarkVisualizer — 书签图谱 Canvas 可视化
 * 从 bookmark-graph.js 拆分
 */

const GROUP_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01',
  '#46BDC6', '#7B61FF', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF9800', '#9C27B0', '#607D8B', '#795548', '#F44336',
];

const NODE_RADIUS_MIN = 4;
const NODE_RADIUS_MAX = 20;
const REPULSION_K = 5000;
const SPRING_K = 0.005;
const SPRING_LENGTH = 120;
const DAMPING = 0.85;
const MIN_VELOCITY = 0.01;
const _MAX_ITERATIONS = 100;

/** BookmarkVisualizer 类 */
export class BookmarkVisualizer {
  constructor(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._width = canvas.width || 800;
    this._height = canvas.height || 600;
    this._simNodes = new Map();
    this._edges = [];
    this._nodeData = new Map();
    this._groupColorMap = new Map();
    this._highlighted = new Set();
    this._hasHighlight = false;
    this._offsetX = 0; this._offsetY = 0; this._scale = 1;
    this._animId = null; this._running = false;
    this._dragNode = null; this._panning = false;
    this._panStartX = 0; this._panStartY = 0;
    this._panOffsetStartX = 0; this._panOffsetStartY = 0;
    this._onNodeClick = null;
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._canvas.addEventListener('mousedown', this._boundMouseDown);
    this._canvas.addEventListener('mousemove', this._boundMouseMove);
    this._canvas.addEventListener('mouseup', this._boundMouseUp);
    this._canvas.addEventListener('wheel', this._boundWheel);
  }

  render(graphData) {
    this.stop();
    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) { this._clearCanvas(); return; }
    this._assignGroupColors(graphData.nodes);
    this._simNodes.clear(); this._nodeData.clear();
    const cx = this._width / 2, cy = this._height / 2;
    for (const node of graphData.nodes) {
      const id = String(node.id);
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.min(this._width, this._height) * 0.3;
      this._simNodes.set(id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0, fixed: false });
      this._nodeData.set(id, node);
    }
    this._edges = graphData.edges.map(e => ({ source: String(e.source), target: String(e.target), weight: typeof e.weight === 'number' ? e.weight : 0.5 }));
    this._computeDegree();
    this.start();
  }

  highlight(nodeId) {
    this._highlighted.clear();
    const id = String(nodeId);
    if (this._nodeData.has(id)) {
      this._highlighted.add(id);
      for (const edge of this._edges) { if (edge.source === id) this._highlighted.add(edge.target); if (edge.target === id) this._highlighted.add(edge.source); }
      this._hasHighlight = true;
    }
  }

  searchHighlight(query) {
    this._highlighted.clear();
    if (!query || typeof query !== 'string') { this._hasHighlight = false; return; }
    const q = query.toLowerCase();
    for (const [id, node] of this._nodeData) { if ((node.label || '').toLowerCase().includes(q)) this._highlighted.add(id); }
    this._hasHighlight = this._highlighted.size > 0;
  }

  resetHighlight() { this._highlighted.clear(); this._hasHighlight = false; }
  zoomIn() { this._zoom(this._width / 2, this._height / 2, 1.2); }
  zoomOut() { this._zoom(this._width / 2, this._height / 2, 1 / 1.2); }
  resetZoom() { this._scale = 1; this._offsetX = 0; this._offsetY = 0; }
  getScale() { return this._scale; }

  start() { if (this._running) return; this._running = true; this._tick(); }
  stop() { this._running = false; if (this._animId !== null) { cancelAnimationFrame(this._animId); this._animId = null; } }
  onNodeClick(callback) { this._onNodeClick = callback; }

  destroy() {
    this.stop();
    this._canvas.removeEventListener('mousedown', this._boundMouseDown);
    this._canvas.removeEventListener('mousemove', this._boundMouseMove);
    this._canvas.removeEventListener('mouseup', this._boundMouseUp);
    this._canvas.removeEventListener('wheel', this._boundWheel);
    this._simNodes.clear(); this._nodeData.clear(); this._groupColorMap.clear(); this._highlighted.clear();
    this._edges = []; this._dragNode = null; this._onNodeClick = null; this._canvas = null; this._ctx = null;
  }

  _tick() { if (!this._running) return; this._simulate(); this._renderFrame(); this._animId = requestAnimationFrame(() => this._tick()); }

  _simulate() {
    const nodes = this._simNodes; const ids = [...nodes.keys()];
    for (let i = 0; i < ids.length; i++) {
      const a = nodes.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const b = nodes.get(ids[j]);
        let dx = a.x - b.x, dy = a.y - b.y; let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;
        const force = REPULSION_K / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        if (!a.fixed) { a.vx += fx; a.vy += fy; } if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      }
    }
    for (const edge of this._edges) {
      const a = nodes.get(edge.source), b = nodes.get(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y; let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const displacement = dist - SPRING_LENGTH;
      const force = SPRING_K * displacement;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      if (!a.fixed) { a.vx += fx; a.vy += fy; } if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
    }
    for (const id of ids) {
      const node = nodes.get(id);
      if (node.fixed) continue;
      node.vx *= DAMPING; node.vy *= DAMPING;
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed < MIN_VELOCITY) { node.vx = 0; node.vy = 0; }
      node.x += node.vx; node.y += node.vy;
    }
  }

  _renderFrame() {
    const ctx = this._ctx; if (!ctx) return;
    ctx.clearRect(0, 0, this._width, this._height); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, this._width, this._height);
    ctx.save(); ctx.translate(this._offsetX, this._offsetY); ctx.scale(this._scale, this._scale);
    const vpLeft = -this._offsetX / this._scale, vpTop = -this._offsetY / this._scale;
    const vpRight = vpLeft + this._width / this._scale, vpBottom = vpTop + this._height / this._scale;
    const margin = NODE_RADIUS_MAX * 2;
    for (const edge of this._edges) {
      const a = this._simNodes.get(edge.source), b = this._simNodes.get(edge.target);
      if (!a || !b) continue;
      if (!this._isEdgeVisible(a, b, vpLeft - margin, vpTop - margin, vpRight + margin, vpBottom + margin)) continue;
      const isHighlighted = this._hasHighlight && this._highlighted.has(edge.source) && this._highlighted.has(edge.target);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      if (this._hasHighlight && !isHighlighted) { ctx.strokeStyle = 'rgba(200, 200, 200, 0.1)'; }
      else { ctx.strokeStyle = isHighlighted ? 'rgba(66, 133, 244, 0.8)' : `rgba(150, 150, 150, ${0.15 + edge.weight * 0.45})`; }
      ctx.lineWidth = Math.max(0.5, edge.weight * 4); ctx.stroke();
    }
    for (const [id, simNode] of this._simNodes) {
      const node = this._nodeData.get(id); if (!node) continue;
      if (simNode.x < vpLeft - margin || simNode.x > vpRight + margin || simNode.y < vpTop - margin || simNode.y > vpBottom + margin) continue;
      const r = this._nodeRadius(node);
      const color = this._groupColorMap.get(node.group) || GROUP_COLORS[0];
      const isNodeHighlighted = !this._hasHighlight || this._highlighted.has(id);
      ctx.beginPath(); ctx.arc(simNode.x, simNode.y, r, 0, Math.PI * 2);
      if (isNodeHighlighted) { ctx.fillStyle = color; ctx.globalAlpha = 1; } else { ctx.fillStyle = color; ctx.globalAlpha = 0.15; }
      ctx.fill(); ctx.globalAlpha = 1;
      if (this._hasHighlight && isNodeHighlighted) { ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke(); }
      if (r >= 6 && isNodeHighlighted) {
        ctx.fillStyle = '#333'; ctx.font = `${Math.max(9, r)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(node.label || '', simNode.x, simNode.y + r + 2);
      }
    }
    ctx.restore();
  }

  _isEdgeVisible(a, b, left, top, right, bottom) {
    return Math.max(a.x, b.x) >= left && Math.min(a.x, b.x) <= right && Math.max(a.y, b.y) >= top && Math.min(a.y, b.y) <= bottom;
  }

  _nodeRadius(node) { const degree = node._degree || 0; const t = Math.min(degree / 20, 1); return NODE_RADIUS_MIN + t * (NODE_RADIUS_MAX - NODE_RADIUS_MIN); }

  _computeDegree() {
    for (const [, node] of this._nodeData) node._degree = 0;
    for (const edge of this._edges) { const a = this._nodeData.get(edge.source), b = this._nodeData.get(edge.target); if (a) a._degree = (a._degree || 0) + 1; if (b) b._degree = (b._degree || 0) + 1; }
  }

  _assignGroupColors(nodes) {
    this._groupColorMap.clear(); let colorIdx = 0;
    for (const node of nodes) { const group = node.group || 'default'; if (!this._groupColorMap.has(group)) { this._groupColorMap.set(group, GROUP_COLORS[colorIdx % GROUP_COLORS.length]); colorIdx++; } }
  }

  _clearCanvas() { if (this._ctx) this._ctx.clearRect(0, 0, this._width, this._height); }

  _zoom(cx, cy, factor) {
    const newScale = Math.max(0.1, Math.min(10, this._scale * factor));
    const ratio = newScale / this._scale;
    this._offsetX = cx - ratio * (cx - this._offsetX); this._offsetY = cy - ratio * (cy - this._offsetY); this._scale = newScale;
  }

  _getCanvasPos(e) { const rect = this._canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  _screenToWorld(sx, sy) { return { x: (sx - this._offsetX) / this._scale, y: (sy - this._offsetY) / this._scale }; }

  _findNodeAt(wx, wy) {
    for (const [id, simNode] of this._simNodes) {
      const node = this._nodeData.get(id); if (!node) continue;
      const r = this._nodeRadius(node); const dx = wx - simNode.x, dy = wy - simNode.y;
      if (dx * dx + dy * dy <= r * r) return id;
    }
    return null;
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e); const world = this._screenToWorld(pos.x, pos.y);
    const nodeId = this._findNodeAt(world.x, world.y);
    if (nodeId) { this._dragNode = nodeId; this._simNodes.get(nodeId).fixed = true; return; }
    this._panning = true; this._panStartX = pos.x; this._panStartY = pos.y;
    this._panOffsetStartX = this._offsetX; this._panOffsetStartY = this._offsetY;
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);
    if (this._dragNode) {
      const world = this._screenToWorld(pos.x, pos.y);
      const simNode = this._simNodes.get(this._dragNode);
      if (simNode) { simNode.x = world.x; simNode.y = world.y; simNode.vx = 0; simNode.vy = 0; }
      return;
    }
    if (this._panning) { this._offsetX = this._panOffsetStartX + (pos.x - this._panStartX); this._offsetY = this._panOffsetStartY + (pos.y - this._panStartY); }
  }

  _onMouseUp() {
    if (this._dragNode) {
      const simNode = this._simNodes.get(this._dragNode);
      if (simNode && this._onNodeClick) { this._onNodeClick(this._dragNode, this._nodeData.get(this._dragNode)); }
      if (simNode) simNode.fixed = true; this._dragNode = null; return;
    }
    this._panning = false;
  }

  _onWheel(e) { const pos = this._getCanvasPos(e); const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1; this._zoom(pos.x, pos.y, factor); }
}
