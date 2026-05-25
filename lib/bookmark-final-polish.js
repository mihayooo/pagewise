/**
 * BookmarkFinalPolish — UI/UX 最终打磨模块
 *
 * 提供动画、布局优化和交互增强的纯 DOM 工具函数。
 *
 * 交互增强已拆分至 bookmark-final-polish-interactions.js
 *   (enhanceDragDrop, addRippleEffect, showTooltip, smoothScrollTo)
 *
 * 设计约束:
 * - 纯 ES Module，无 Chrome API 依赖
 * - 纯 DOM 工具函数，使用 try-catch 保护
 * - 无分号风格，const/let 优先，禁止 var
 *
 * @module lib/bookmark-final-polish
 */

import {
  GRID_SNAP_SIZE as _GRID_SNAP_SIZE,
  RIPPLE_DURATION as _RIPPLE_DURATION,
  TOOLTIP_OFFSET as _TOOLTIP_OFFSET,
  SCROLL_DURATION as _SCROLL_DURATION,
  enhanceDragDrop as _enhanceDragDrop,
  addRippleEffect as _addRippleEffect,
  showTooltip as _showTooltip,
  smoothScrollTo as _smoothScrollTo,
} from './bookmark-final-polish-interactions.js'

// ==================== Constants ====================

/** 节点入场动画时长（毫秒） */
export const NODE_ENTRY_DURATION = 200

/** 节点入场动画缓动函数 */
export const NODE_ENTRY_EASING = 'ease-out'

/** 边绘制动画时长（毫秒） */
export const EDGE_DRAW_DURATION = 400

/** 虚线段长度（像素） */
export const DASH_SEGMENT_LENGTH = 8

/** 响应式断点定义（像素） */
export const BREAKPOINTS = Object.freeze({
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
})

/** 网格列数映射 */
export const GRID_COLUMNS = Object.freeze({
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
})

// ==================== 向后兼容 re-export ====================

/**
 * 网格吸附大小（像素）
 */
export const GRID_SNAP_SIZE = _GRID_SNAP_SIZE
/**
 * 涟漪动画持续时间（毫秒）
 */
export const RIPPLE_DURATION = _RIPPLE_DURATION
/**
 * 工具提示偏移量（像素）
 */
export const TOOLTIP_OFFSET = _TOOLTIP_OFFSET
/**
 * 平滑滚动持续时间（毫秒）
 */
export const SCROLL_DURATION = _SCROLL_DURATION
/**
 * 增强拖拽交互体验
 */
export const enhanceDragDrop = _enhanceDragDrop
/**
 * @param {HTMLElement} element - 目标元素
 * * @param {Event} event - 触发事件
 */
export const addRippleEffect = _addRippleEffect
/**
 * @param {HTMLElement} element - 目标元素
 * * @param {string} text - 提示文本
 */
export const showTooltip = _showTooltip
/**
 * @param {HTMLElement} container - 滚动容器
 * * @param {number} targetY - 目标 Y 坐标
 */
export const smoothScrollTo = _smoothScrollTo

// ==================== animateNodeEntry ====================

/**
 * 图节点入场动画：淡入 + 缩放
 *
 * @param {object} node — 节点数据对象
 * @param {object} element — DOM 元素
 * @returns {{ applied: boolean, node: object, errors: string[] }}
 */
export function animateNodeEntry(node, element) {
  const errors = []

  try {
    if (!node || typeof node !== 'object') {
      errors.push('node 必须是非空对象')
      return { applied: false, node, errors }
    }

    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { applied: false, node, errors }
    }

    element.style.opacity = '0'
    element.style.transform = 'scale(0.8)'
    element.style.transition = `opacity ${NODE_ENTRY_DURATION}ms ${NODE_ENTRY_EASING}, transform ${NODE_ENTRY_DURATION}ms ${NODE_ENTRY_EASING}`

    const startAnimation = () => {
      element.style.opacity = '1'
      element.style.transform = 'scale(1)'
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startAnimation)
    } else {
      startAnimation()
    }

    return { applied: true, node, errors }
  } catch (err) {
    errors.push(`动画应用失败: ${err.message}`)
    return { applied: false, node, errors }
  }
}

// ==================== animateEdgeDraw ====================

/**
 * 边绘制动画：使用虚线偏移实现绘制效果
 *
 * @param {object} edge — 边数据对象
 * @param {object} canvas — canvas/元素对象
 * @param {object} [options] — 可选参数
 * @returns {{ applied: boolean, edge: object, totalLength: number, errors: string[] }}
 */
export function animateEdgeDraw(edge, canvas, options = {}) {
  const errors = []

  try {
    if (!edge || typeof edge !== 'object') {
      errors.push('edge 必须是非空对象')
      return { applied: false, edge, totalLength: 0, errors }
    }

    if (!edge.source || !edge.target) {
      errors.push('edge 必须包含 source 和 target 属性')
      return { applied: false, edge, totalLength: 0, errors }
    }

    if (!canvas || typeof canvas !== 'object') {
      errors.push('canvas 必须是有效的元素对象')
      return { applied: false, edge, totalLength: 0, errors }
    }

    const duration = typeof options.duration === 'number' ? options.duration : EDGE_DRAW_DURATION
    const dashLength = typeof options.dashLength === 'number' ? options.dashLength : DASH_SEGMENT_LENGTH

    const sx = edge.source.x || 0
    const sy = edge.source.y || 0
    const tx = edge.target.x || 0
    const ty = edge.target.y || 0
    const totalLength = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2)

    canvas.style.strokeDasharray = `${dashLength}`
    canvas.style.strokeDashoffset = `${totalLength}`
    canvas.style.transition = `strokeDashoffset ${duration}ms ease-in-out`

    const startAnimation = () => {
      canvas.style.strokeDashoffset = '0'
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(startAnimation)
    } else {
      startAnimation()
    }

    return { applied: true, edge, totalLength, errors }
  } catch (err) {
    errors.push(`边动画应用失败: ${err.message}`)
    return { applied: false, edge, totalLength: 0, errors }
  }
}

// ==================== optimizeLayout ====================

/**
 * 响应式网格布局优化
 *
 * @param {object[]} bookmarks — 书签数据数组
 * @param {object} container — 容器 DOM 元素
 * @returns {{ success: boolean, breakpoint: string, columns: number, itemSize: { width: number, height: number }, errors: string[] }}
 */
export function optimizeLayout(bookmarks, container) {
  const errors = []

  try {
    if (!Array.isArray(bookmarks)) {
      errors.push('bookmarks 必须是数组')
      return { success: false, breakpoint: 'xs', columns: 1, itemSize: { width: 0, height: 0 }, errors }
    }

    if (!container || typeof container !== 'object') {
      errors.push('container 必须是有效的容器元素')
      return { success: false, breakpoint: 'xs', columns: 1, itemSize: { width: 0, height: 0 }, errors }
    }

    const containerWidth = container.clientWidth || 0

    let breakpoint = 'xs'
    const sortedBreakpoints = Object.entries(BREAKPOINTS).sort((a, b) => b[1] - a[1])
    for (const [name, minWidth] of sortedBreakpoints) {
      if (containerWidth >= minWidth) {
        breakpoint = name
        break
      }
    }

    const columns = GRID_COLUMNS[breakpoint] || 1
    const gap = 16
    const totalGapWidth = gap * (columns - 1)
    const itemWidth = columns > 0 ? Math.floor((containerWidth - totalGapWidth) / columns) : containerWidth
    const itemHeight = Math.floor(itemWidth * 0.75)

    const itemSize = { width: itemWidth, height: itemHeight }

    container.style.display = 'flex'
    container.style.flexWrap = 'wrap'
    container.style.gap = `${gap}px`

    if (container.children && Array.isArray(container.children)) {
      for (const child of container.children) {
        if (child && child.style) {
          child.style.width = `${itemWidth}px`
          child.style.height = `${itemHeight}px`
        }
      }
    }

    return { success: true, breakpoint, columns, itemSize, errors }
  } catch (err) {
    errors.push(`布局优化失败: ${err.message}`)
    return { success: false, breakpoint: 'xs', columns: 1, itemSize: { width: 0, height: 0 }, errors }
  }
}

// ==================== Easing Utilities ====================

/**
 * easeInOutCubic 缓动函数
 */
export function easeInOutCubic(t) {
  if (typeof t !== 'number' || isNaN(t)) return 0
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped < 0.5) {
    return 4 * clamped * clamped * clamped
  }
  return 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

/**
 * easeOutQuad 缓动函数
 */
export function easeOutQuad(t) {
  if (typeof t !== 'number' || isNaN(t)) return 0
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - (1 - clamped) * (1 - clamped)
}

/**
 * snapToGrid 工具函数
 */
export function snapToGrid(value, gridSize = GRID_SNAP_SIZE) {
  if (typeof value !== 'number' || isNaN(value)) return 0
  if (typeof gridSize !== 'number' || gridSize <= 0) return value
  return Math.round(value / gridSize) * gridSize
}
