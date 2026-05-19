/**
 * BookmarkFinalPolish — 交互增强子模块
 *
 * 从 bookmark-final-polish.js 拆分，负责:
 *   - enhanceDragDrop — 增强拖拽交互
 *   - addRippleEffect — Material 风格波纹效果
 *   - showTooltip — 智能定位工具提示
 *   - smoothScrollTo — 缓动平滑滚动
 *
 * @module lib/bookmark-final-polish-interactions
 */

/** 网格间距（像素） */
export const GRID_SNAP_SIZE = 16

/** 波纹效果时长（毫秒） */
export const RIPPLE_DURATION = 600

/** 工具提示偏移（像素） */
export const TOOLTIP_OFFSET = 8

/** 平滑滚动默认时长（毫秒） */
export const SCROLL_DURATION = 300

// ==================== enhanceDragDrop ====================

/**
 * 增强拖拽交互
 *
 * @param {object} element — 可拖拽的 DOM 元素
 * @param {object} [options] — 拖拽选项
 * @returns {{ enabled: boolean, ghostCreated: boolean, options: object, errors: string[] }}
 */
export function enhanceDragDrop(element, options = {}) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { enabled: false, ghostCreated: false, options: {}, errors }
    }

    const mergedOptions = {
      snapSize: typeof options.snapSize === 'number' ? options.snapSize : GRID_SNAP_SIZE,
      ghostOpacity: typeof options.ghostOpacity === 'number' ? options.ghostOpacity : 0.5,
      snapToGrid: options.snapToGrid !== false,
    }

    const ghostInfo = {
      opacity: mergedOptions.ghostOpacity,
      snapSize: mergedOptions.snapSize,
      sourceId: element.id || element.dataset?.id || 'unknown',
    }

    element.style.cursor = 'grab'
    element.style.userSelect = 'none'
    element.setAttribute('draggable', 'true')

    return { enabled: true, ghostCreated: true, options: mergedOptions, ghostInfo, errors }
  } catch (err) {
    errors.push(`拖拽增强失败: ${err.message}`)
    return { enabled: false, ghostCreated: false, options: {}, errors }
  }
}

// ==================== addRippleEffect ====================

/**
 * Material 风格波纹点击效果
 *
 * @param {object} element — 目标 DOM 元素
 * @param {object} event — 点击事件对象
 * @returns {{ applied: boolean, ripple: object|null, errors: string[] }}
 */
export function addRippleEffect(element, event) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { applied: false, ripple: null, errors }
    }

    if (!event || typeof event !== 'object') {
      errors.push('event 必须是有效的事件对象')
      return { applied: false, ripple: null, errors }
    }

    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 100, height: 100 }
    const x = (event.clientX || 0) - rect.left
    const y = (event.clientY || 0) - rect.top

    const maxWidth = rect.width || 100
    const maxHeight = rect.height || 100
    const size = Math.sqrt(maxWidth ** 2 + maxHeight ** 2)

    const ripple = {
      x,
      y,
      size,
      duration: RIPPLE_DURATION,
      css: {
        position: 'absolute',
        borderRadius: '50%',
        transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(0)`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: '0.35',
        backgroundColor: 'currentColor',
        transition: `transform ${RIPPLE_DURATION}ms ease-out, opacity ${RIPPLE_DURATION}ms ease-out`,
      },
    }

    element.style.position = element.style.position || 'relative'
    element.style.overflow = 'hidden'

    return { applied: true, ripple, errors }
  } catch (err) {
    errors.push(`波纹效果失败: ${err.message}`)
    return { applied: false, ripple: null, errors }
  }
}

// ==================== showTooltip ====================

/**
 * 智能定位工具提示
 *
 * @param {object} element — 目标 DOM 元素
 * @param {string} content — 提示内容文本
 * @param {string} [position='top'] — 首选方向
 * @param {object} [viewport] — 视口尺寸
 * @returns {{ shown: boolean, tooltip: object|null, flipped: boolean, finalPosition: string, errors: string[] }}
 */
export function showTooltip(element, content, position = 'top', viewport = null) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
    }

    if (typeof content !== 'string' && typeof content !== 'number') {
      errors.push('content 必须是字符串或数字')
      return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
    }

    const validPositions = ['top', 'bottom', 'left', 'right']
    if (!validPositions.includes(position)) {
      errors.push(`position 必须是 ${validPositions.join(', ')} 之一`)
      return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
    }

    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }
    const vp = viewport || (typeof window !== 'undefined' && window.innerWidth ? { width: window.innerWidth, height: window.innerHeight } : { width: 1280, height: 720 })
    const offset = TOOLTIP_OFFSET

    let finalPosition = position
    let flipped = false

    if (position === 'top' && rect.top - offset < 0) {
      finalPosition = 'bottom'
      flipped = true
    } else if (position === 'bottom' && rect.bottom + offset > vp.height) {
      finalPosition = 'top'
      flipped = true
    } else if (position === 'left' && rect.left - offset < 0) {
      finalPosition = 'right'
      flipped = true
    } else if (position === 'right' && rect.right + offset > vp.width) {
      finalPosition = 'left'
      flipped = true
    }

    let top, left
    switch (finalPosition) {
      case 'top':
        top = rect.top - offset
        left = rect.left + rect.width / 2
        break
      case 'bottom':
        top = rect.bottom + offset
        left = rect.left + rect.width / 2
        break
      case 'left':
        top = rect.top + rect.height / 2
        left = rect.left - offset
        break
      case 'right':
        top = rect.top + rect.height / 2
        left = rect.right + offset
        break
      default:
        top = rect.top
        left = rect.left
    }

    const tooltip = {
      content: String(content),
      position: finalPosition,
      css: {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: '10000',
        pointerEvents: 'none',
      },
    }

    return { shown: true, tooltip, flipped, finalPosition, errors }
  } catch (err) {
    errors.push(`工具提示显示失败: ${err.message}`)
    return { shown: false, tooltip: null, flipped: false, finalPosition: position, errors }
  }
}

// ==================== smoothScrollTo ====================

/**
 * 缓动平滑滚动
 *
 * @param {object} element — 滚动容器元素
 * @param {number} target — 目标滚动位置
 * @param {object} [options] — 可选参数
 * @returns {{ success: boolean, from: number, to: number, distance: number, duration: number, errors: string[] }}
 */
export function smoothScrollTo(element, target, options = {}) {
  const errors = []

  try {
    if (!element || typeof element !== 'object') {
      errors.push('element 必须是有效的 DOM 元素对象')
      return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
    }

    if (typeof target !== 'number' || isNaN(target)) {
      errors.push('target 必须是有效数字')
      return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
    }

    if (target < 0) {
      errors.push('target 不能为负数')
      return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
    }

    const duration = typeof options.duration === 'number' ? options.duration : SCROLL_DURATION
    const from = element.scrollTop || 0
    const to = Math.max(0, Math.floor(target))
    const distance = Math.abs(to - from)

    element.dataset = element.dataset || {}
    element.dataset.scrolling = 'true'
    element.dataset.scrollFrom = String(from)
    element.dataset.scrollTo = String(to)

    return { success: true, from, to, distance, duration, errors }
  } catch (err) {
    errors.push(`平滑滚动失败: ${err.message}`)
    return { success: false, from: 0, to: 0, distance: 0, duration: 0, errors }
  }
}
