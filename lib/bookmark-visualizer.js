/**
 * BookmarkVisualizer — Canvas 力导向图可视化
 *
 * 在 Canvas 上渲染书签图谱的力导向图，支持:
 *   - 库仑斥力 + 弹簧引力 + 阻尼系数的力仿真
 *   - 节点拖拽、画布平移、滚轮缩放
 *   - 按 group 分组着色 (15 色方案)
 *   - 节点大小按连接数缩放, 边粗细按权重缩放
 *   - 高亮、搜索高亮、重置高亮
 *   - 视口裁剪优化性能
 *
 * 子模块:
 *   - bookmark-visualizer-physics.js — 物理仿真引擎
 *   - bookmark-visualizer-renderer.js — Canvas 渲染
 */

import {
  GROUP_COLORS,
  NODE_RADIUS_MAX,
  simulateStep,
  computeDegree,
  assignGroupColors,
  nodeRadius,
} from './bookmark-visualizer-physics.js'
import {
  renderFrame,
  clearCanvas,
} from './bookmark-visualizer-renderer.js'

// ==================== BookmarkVisualizer ====================

export class BookmarkVisualizer {
  /**
   * @param {HTMLCanvasElement|Object} canvas — Canvas 元素 (或 mock)
   */
  constructor(canvas) {
    this._canvas = canvas
    this._ctx = canvas.getContext('2d')
    this._width = canvas.width || 800
    this._height = canvas.height || 600

    this._simNodes = new Map()
    this._edges = []
    this._nodeData = new Map()
    this._groupColorMap = new Map()
    this._highlighted = new Set()
    this._hasHighlight = false

    this._offsetX = 0
    this._offsetY = 0
    this._scale = 1

    this._animId = null
    this._running = false

    this._dragNode = null
    this._panning = false
    this._panStartX = 0
    this._panStartY = 0
    this._panOffsetStartX = 0
    this._panOffsetStartY = 0

    this._onNodeClick = null

    this._boundMouseDown = this._onMouseDown.bind(this)
    this._boundMouseMove = this._onMouseMove.bind(this)
    this._boundMouseUp = this._onMouseUp.bind(this)
    this._boundWheel = this._onWheel.bind(this)

    this._canvas.addEventListener('mousedown', this._boundMouseDown)
    this._canvas.addEventListener('mousemove', this._boundMouseMove)
    this._canvas.addEventListener('mouseup', this._boundMouseUp)
    this._canvas.addEventListener('wheel', this._boundWheel)
  }

  // ==================== 公共 API ====================

  render(graphData) {
    this.stop()

    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
      clearCanvas(this._ctx, this._width, this._height)
      return
    }

    assignGroupColors(graphData.nodes, this._groupColorMap)

    this._simNodes.clear()
    this._nodeData.clear()
    const cx = this._width / 2
    const cy = this._height / 2

    for (const node of graphData.nodes) {
      const id = String(node.id)
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * Math.min(this._width, this._height) * 0.3
      this._simNodes.set(id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        fixed: false,
      })
      this._nodeData.set(id, node)
    }

    this._edges = graphData.edges.map(e => ({
      source: String(e.source),
      target: String(e.target),
      weight: typeof e.weight === 'number' ? e.weight : 0.5,
    }))

    computeDegree(this._nodeData, this._edges)
    this.start()
  }

  highlight(nodeId) {
    this._highlighted.clear()
    const id = String(nodeId)
    if (this._nodeData.has(id)) {
      this._highlighted.add(id)
      for (const edge of this._edges) {
        if (edge.source === id) this._highlighted.add(edge.target)
        if (edge.target === id) this._highlighted.add(edge.source)
      }
      this._hasHighlight = true
    }
  }

  searchHighlight(query) {
    this._highlighted.clear()
    if (!query || typeof query !== 'string') {
      this._hasHighlight = false
      return
    }

    const q = query.toLowerCase()
    for (const [id, node] of this._nodeData) {
      const label = (node.label || '').toLowerCase()
      if (label.includes(q)) {
        this._highlighted.add(id)
      }
    }
    this._hasHighlight = this._highlighted.size > 0
  }

  resetHighlight() {
    this._highlighted.clear()
    this._hasHighlight = false
  }

  zoomIn() {
    this._zoom(this._width / 2, this._height / 2, 1.2)
  }

  zoomOut() {
    this._zoom(this._width / 2, this._height / 2, 1 / 1.2)
  }

  resetZoom() {
    this._scale = 1
    this._offsetX = 0
    this._offsetY = 0
  }

  getScale() {
    return this._scale
  }

  start() {
    if (this._running) return
    this._running = true
    this._tick()
  }

  stop() {
    this._running = false
    if (this._animId !== null) {
      cancelAnimationFrame(this._animId)
      this._animId = null
    }
  }

  onNodeClick(callback) {
    this._onNodeClick = callback
  }

  destroy() {
    this.stop()

    this._canvas.removeEventListener('mousedown', this._boundMouseDown)
    this._canvas.removeEventListener('mousemove', this._boundMouseMove)
    this._canvas.removeEventListener('mouseup', this._boundMouseUp)
    this._canvas.removeEventListener('wheel', this._boundWheel)

    this._simNodes.clear()
    this._nodeData.clear()
    this._groupColorMap.clear()
    this._highlighted.clear()
    this._edges = []
    this._dragNode = null
    this._onNodeClick = null
    this._canvas = null
    this._ctx = null
  }

  // ==================== 力仿真 ====================

  _tick() {
    if (!this._running) return

    simulateStep(this._simNodes, this._edges)
    this._doRenderFrame()

    this._animId = requestAnimationFrame(() => this._tick())
  }

  _doRenderFrame() {
    renderFrame(this._ctx, {
      simNodes: this._simNodes,
      edges: this._edges,
      nodeData: this._nodeData,
      groupColorMap: this._groupColorMap,
      highlighted: this._highlighted,
      hasHighlight: this._hasHighlight,
      offsetX: this._offsetX,
      offsetY: this._offsetY,
      scale: this._scale,
    }, this._width, this._height)
  }

  // ==================== 缩放 ====================

  _zoom(cx, cy, factor) {
    const newScale = Math.max(0.1, Math.min(10, this._scale * factor))
    const ratio = newScale / this._scale
    this._offsetX = cx - ratio * (cx - this._offsetX)
    this._offsetY = cy - ratio * (cy - this._offsetY)
    this._scale = newScale
  }

  // ==================== 事件处理 ====================

  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this._offsetX) / this._scale,
      y: (sy - this._offsetY) / this._scale,
    }
  }

  _findNodeAt(wx, wy) {
    for (const [id, simNode] of this._simNodes) {
      const node = this._nodeData.get(id)
      if (!node) continue
      const r = nodeRadius(node)
      const dx = wx - simNode.x
      const dy = wy - simNode.y
      if (dx * dx + dy * dy <= r * r) {
        return id
      }
    }
    return null
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e)
    const world = this._screenToWorld(pos.x, pos.y)

    const nodeId = this._findNodeAt(world.x, world.y)
    if (nodeId) {
      this._dragNode = nodeId
      this._simNodes.get(nodeId).fixed = true
      return
    }

    this._panning = true
    this._panStartX = pos.x
    this._panStartY = pos.y
    this._panOffsetStartX = this._offsetX
    this._panOffsetStartY = this._offsetY
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e)

    if (this._dragNode) {
      const world = this._screenToWorld(pos.x, pos.y)
      const simNode = this._simNodes.get(this._dragNode)
      if (simNode) {
        simNode.x = world.x
        simNode.y = world.y
        simNode.vx = 0
        simNode.vy = 0
      }
      return
    }

    if (this._panning) {
      this._offsetX = this._panOffsetStartX + (pos.x - this._panStartX)
      this._offsetY = this._panOffsetStartY + (pos.y - this._panStartY)
    }
  }

  _onMouseUp(_e) {
    if (this._dragNode) {
      const simNode = this._simNodes.get(this._dragNode)
      if (simNode && this._onNodeClick) {
        const nodeData = this._nodeData.get(this._dragNode)
        this._onNodeClick(this._dragNode, nodeData)
      }
      if (simNode) simNode.fixed = true
      this._dragNode = null
      return
    }

    this._panning = false
  }

  _onWheel(e) {
    const pos = this._getCanvasPos(e)
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    this._zoom(pos.x, pos.y, factor)
  }
}

// ==================== 向后兼容 re-export ====================
export { GROUP_COLORS, NODE_RADIUS_MAX }
