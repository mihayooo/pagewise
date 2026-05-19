/**
 * BookmarkVisualizer — 物理仿真引擎子模块
 *
 * 从 bookmark-visualizer.js 拆分，负责:
 *   - 常量定义 (颜色、半径、力仿真参数)
 *   - 力仿真计算 (库仑斥力 + 弹簧引力 + 阻尼)
 *   - 度计算、颜色分配
 *
 * @module lib/bookmark-visualizer-physics
 */

// ==================== 常量 ====================

/** 15 色分组方案 */
export const GROUP_COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853', '#FF6D01',
  '#46BDC6', '#7B61FF', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF9800', '#9C27B0', '#607D8B', '#795548', '#F44336',
]

/** 节点半径范围 */
export const NODE_RADIUS_MIN = 4
export const NODE_RADIUS_MAX = 20

/** 力仿真参数 */
export const REPULSION_K = 5000       // 斥力系数 (库仑力)
export const SPRING_K = 0.005         // 弹簧刚度
export const SPRING_LENGTH = 120      // 弹簧自然长度
export const DAMPING = 0.85           // 阻尼系数 (防止振荡)
export const MIN_VELOCITY = 0.01      // 最小速度阈值 (低于此停止计算)
export const MAX_ITERATIONS = 100     // 每帧最大力仿真迭代

// ==================== 物理仿真函数 ====================

/**
 * 执行一步力仿真
 *
 * @param {Map<string, Object>} simNodes — 仿真节点 Map
 * @param {Array<Object>}       edges    — 边数组
 */
export function simulateStep(simNodes, edges) {
  const ids = [...simNodes.keys()]

  // 计算斥力 (所有节点对)
  for (let i = 0; i < ids.length; i++) {
    const a = simNodes.get(ids[i])
    for (let j = i + 1; j < ids.length; j++) {
      const b = simNodes.get(ids[j])
      let dx = a.x - b.x
      let dy = a.y - b.y
      let dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 1) dist = 1 // 防止除零

      // 库仑力: F = K / d²
      const force = REPULSION_K / (dist * dist)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      if (!a.fixed) { a.vx += fx; a.vy += fy }
      if (!b.fixed) { b.vx -= fx; b.vy -= fy }
    }
  }

  // 计算边的弹簧引力
  for (const edge of edges) {
    const a = simNodes.get(edge.source)
    const b = simNodes.get(edge.target)
    if (!a || !b) continue

    let dx = b.x - a.x
    let dy = b.y - a.y
    let dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) dist = 1

    // 胡克定律: F = k * (d - L)
    const displacement = dist - SPRING_LENGTH
    const force = SPRING_K * displacement
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force

    if (!a.fixed) { a.vx += fx; a.vy += fy }
    if (!b.fixed) { b.vx -= fx; b.vy -= fy }
  }

  // 应用阻尼和速度，更新位置
  let _totalVelocity = 0
  for (const id of ids) {
    const node = simNodes.get(id)
    if (node.fixed) continue

    node.vx *= DAMPING
    node.vy *= DAMPING

    // 如果速度很小，直接清零
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
    if (speed < MIN_VELOCITY) {
      node.vx = 0
      node.vy = 0
    } else {
      _totalVelocity += speed
    }

    node.x += node.vx
    node.y += node.vy
  }
}

/**
 * 计算每个节点的连接数
 *
 * @param {Map<string, Object>} nodeData — 节点数据 Map
 * @param {Array<Object>}       edges    — 边数组
 */
export function computeDegree(nodeData, edges) {
  for (const [, node] of nodeData) {
    node._degree = 0
  }
  for (const edge of edges) {
    const a = nodeData.get(edge.source)
    const b = nodeData.get(edge.target)
    if (a) a._degree = (a._degree || 0) + 1
    if (b) b._degree = (b._degree || 0) + 1
  }
}

/**
 * 为所有 group 分配颜色
 *
 * @param {Array}              nodes         — 节点数组
 * @param {Map<string, string>} groupColorMap — group → color Map
 */
export function assignGroupColors(nodes, groupColorMap) {
  groupColorMap.clear()
  let colorIdx = 0
  for (const node of nodes) {
    const group = node.group || 'default'
    if (!groupColorMap.has(group)) {
      groupColorMap.set(group, GROUP_COLORS[colorIdx % GROUP_COLORS.length])
      colorIdx++
    }
  }
}

/**
 * 计算节点显示半径 (按连接数缩放)
 *
 * @param {Object} node
 * @returns {number}
 */
export function nodeRadius(node) {
  const degree = node._degree || 0
  const t = Math.min(degree / 20, 1)
  return NODE_RADIUS_MIN + t * (NODE_RADIUS_MAX - NODE_RADIUS_MIN)
}
