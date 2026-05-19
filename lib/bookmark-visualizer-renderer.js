/**
 * BookmarkVisualizer — Canvas 渲染子模块
 *
 * 从 bookmark-visualizer.js 拆分，负责:
 *   - 单帧渲染 (边、节点、标签)
 *   - 视口裁剪
 *   - 清除画布
 *
 * @module lib/bookmark-visualizer-renderer
 */

import {
  GROUP_COLORS,
  NODE_RADIUS_MAX,
  nodeRadius as getNodeRadius,
} from './bookmark-visualizer-physics.js'

/**
 * 渲染一帧到 Canvas
 *
 * @param {Object} ctx       — Canvas 2D 上下文
 * @param {Object} state     — 可视化器状态
 * @param {number} width     — 画布宽度
 * @param {number} height    — 画布高度
 */
export function renderFrame(ctx, state, width, height) {
  if (!ctx) return

  const {
    simNodes, edges, nodeData, groupColorMap,
    highlighted, hasHighlight,
    offsetX, offsetY, scale,
  } = state

  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)

  // 计算视口范围 (用于裁剪)
  const vpLeft = -offsetX / scale
  const vpTop = -offsetY / scale
  const vpRight = vpLeft + width / scale
  const vpBottom = vpTop + height / scale
  const margin = NODE_RADIUS_MAX * 2

  // 先绘制边
  for (const edge of edges) {
    const a = simNodes.get(edge.source)
    const b = simNodes.get(edge.target)
    if (!a || !b) continue

    if (!isEdgeVisible(a, b, vpLeft - margin, vpTop - margin, vpRight + margin, vpBottom + margin)) continue

    const isHighlighted = hasHighlight &&
      highlighted.has(edge.source) && highlighted.has(edge.target)

    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)

    if (hasHighlight && !isHighlighted) {
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.1)'
    } else {
      ctx.strokeStyle = isHighlighted
        ? 'rgba(66, 133, 244, 0.8)'
        : `rgba(150, 150, 150, ${0.15 + edge.weight * 0.45})`
    }

    ctx.lineWidth = Math.max(0.5, edge.weight * 4)
    ctx.stroke()
  }

  // 再绘制节点
  for (const [id, simNode] of simNodes) {
    const node = nodeData.get(id)
    if (!node) continue

    if (simNode.x < vpLeft - margin || simNode.x > vpRight + margin ||
        simNode.y < vpTop - margin || simNode.y > vpBottom + margin) continue

    const r = getNodeRadius(node)
    const color = groupColorMap.get(node.group) || GROUP_COLORS[0]

    const isNodeHighlighted = !hasHighlight || highlighted.has(id)

    ctx.beginPath()
    ctx.arc(simNode.x, simNode.y, r, 0, Math.PI * 2)

    if (isNodeHighlighted) {
      ctx.fillStyle = color
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = color
      ctx.globalAlpha = 0.15
    }

    ctx.fill()
    ctx.globalAlpha = 1

    if (hasHighlight && isNodeHighlighted) {
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    if (r >= 6 && isNodeHighlighted) {
      ctx.fillStyle = '#333'
      ctx.font = `${Math.max(9, r)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.label || '', simNode.x, simNode.y + r + 2)
    }
  }

  ctx.restore()
}

/**
 * 判断边是否在视口内 (粗略判断)
 */
export function isEdgeVisible(a, b, left, top, right, bottom) {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return maxX >= left && minX <= right && maxY >= top && minY <= bottom
}

/**
 * 清除画布
 *
 * @param {Object} ctx    — Canvas 2D 上下文
 * @param {number} width  — 画布宽度
 * @param {number} height — 画布高度
 */
export function clearCanvas(ctx, width, height) {
  if (ctx) {
    ctx.clearRect(0, 0, width, height)
  }
}
