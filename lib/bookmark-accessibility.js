/**
 * BookmarkAccessibility — 书签面板无障碍支持 (R79)
 *
 * 焦点管理与公告已拆分至 bookmark-accessibility-navigator.js
 * 颜色对比度工具已拆分至 bookmark-accessibility-contrast.js
 */

import {
  getContrastRatio,
  meetsWCAG_AA,
  hexToRgb,
  auditContrast as _auditContrast,
  setContrastPairs as _setContrastPairs,
  getFailingPairs as _getFailingPairs,
  auditContrastSummary as _auditContrastSummary,
  attrsToString as _attrsToString,
} from './bookmark-accessibility-contrast.js'
import { FocusTrapFactory, AnnouncerFactory } from './bookmark-accessibility-navigator.js'

// ==================== 常量 ====================

/** ARIA 角色定义 */
export const ARIA_ROLES = {
  bookmarksList: 'list',
  bookmarkItem: 'listitem',
  folderNav: 'toolbar',
  liveRegion: 'status',
  detailPanel: 'dialog',
  searchBox: 'search',
}

/** 焦点陷阱可聚焦元素选择器 */
export const FOCUS_TRAP_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
]

/** 键盘导航按键常量 */
export const KEYBOARD_NAV_KEYS = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  HOME: 'Home',
  END: 'End',
  TAB: 'Tab',
}

/** 书签状态中文映射 */
const STATUS_LABELS = {
  unread: '待读',
  reading: '阅读中',
  read: '已读',
}

// ==================== BookmarkAccessibility ====================

/** BookmarkAccessibility 类 */
export class BookmarkAccessibility {
  constructor(options = {}) {
    this._enabled = options.enabled === true
    this._traps = []
    this._announcers = []
    this._handlers = []
  }

  isEnabled() { return this._enabled }
  enable() { this._enabled = true }
  disable() { this._enabled = false }
  toggle() { this._enabled = !this._enabled }

  // ==================== 键盘导航 ====================

  createKeyHandler(config) {
    const {
      items = [],
      getActiveIndex = () => -1,
      setActiveIndex = () => {},
      onSelect = () => {},
      onEscape = () => {},
      onNavigate = () => {},
    } = config

    return (event) => {
      if (!this._enabled) return

      const { key } = event
      const currentIndex = getActiveIndex()
      const itemCount = items.length

      if (itemCount === 0) return

      switch (key) {
        case KEYBOARD_NAV_KEYS.DOWN:
        case KEYBOARD_NAV_KEYS.RIGHT: {
          event.preventDefault()
          const next = Math.min(currentIndex + 1, itemCount - 1)
          if (next !== currentIndex) {
            setActiveIndex(next)
            items[next]?.focus?.()
            onNavigate(next, 'down')
          }
          break
        }

        case KEYBOARD_NAV_KEYS.UP:
        case KEYBOARD_NAV_KEYS.LEFT: {
          event.preventDefault()
          const prev = Math.max(currentIndex - 1, 0)
          if (prev !== currentIndex) {
            setActiveIndex(prev)
            items[prev]?.focus?.()
            onNavigate(prev, 'up')
          }
          break
        }

        case KEYBOARD_NAV_KEYS.HOME: {
          event.preventDefault()
          setActiveIndex(0)
          items[0]?.focus?.()
          onNavigate(0, 'home')
          break
        }

        case KEYBOARD_NAV_KEYS.END: {
          event.preventDefault()
          const last = itemCount - 1
          setActiveIndex(last)
          items[last]?.focus?.()
          onNavigate(last, 'end')
          break
        }

        case KEYBOARD_NAV_KEYS.ENTER: {
          event.preventDefault()
          onSelect(currentIndex)
          break
        }

        case KEYBOARD_NAV_KEYS.ESCAPE: {
          event.preventDefault()
          onEscape()
          break
        }
      }
    }
  }

  // ==================== 焦点陷阱（委托）====================

  createFocusTrap(container) {
    return FocusTrapFactory(container)
  }

  // ==================== ARIA 属性生成 ====================

  getBookmarkListAriaAttrs(opts = {}) {
    const count = opts.count || 0
    return {
      role: ARIA_ROLES.bookmarksList,
      'aria-label': `书签列表，共 ${count} 个书签`,
    }
  }

  getBookmarkItemAriaAttrs(opts = {}) {
    const {
      title = '',
      url = '',
      status = 'unread',
      index = 0,
      total = 0,
    } = opts

    const statusLabel = STATUS_LABELS[status] || status
    const label = [
      title || url,
      statusLabel,
      `${index + 1} / ${total}`,
    ].join(', ')

    return {
      role: ARIA_ROLES.bookmarkItem,
      tabindex: '0',
      'aria-label': label,
    }
  }

  getLiveRegionAttrs() {
    return {
      'aria-live': 'polite',
      'aria-atomic': 'true',
      role: ARIA_ROLES.liveRegion,
    }
  }

  getFolderNavAriaAttrs() {
    return {
      role: ARIA_ROLES.folderNav,
      'aria-label': '书签文件夹导航',
    }
  }

  getStatusAriaAttrs(status) {
    return {
      role: 'status',
      'aria-label': STATUS_LABELS[status] || status,
    }
  }

  getDetailPanelAriaAttrs(opts = {}) {
    return {
      role: ARIA_ROLES.detailPanel,
      'aria-label': `书签详情: ${opts.title || ''}`,
      'aria-modal': 'true',
    }
  }

  getSearchBoxAriaAttrs() {
    return {
      role: ARIA_ROLES.searchBox,
      'aria-label': '搜索书签',
    }
  }

  /**
   * 生成书签选中状态的 ARIA 属性
   * @param {boolean} selected — 是否选中
   * @returns {Object}
   */
  getBookmarkSelectedAriaAttrs(selected = false) {
    return {
      'aria-selected': selected ? 'true' : 'false',
    }
  }

  /**
   * 生成书签展开状态的 ARIA 属性
   * @param {boolean} expanded — 是否展开
   * @returns {Object}
   */
  getBookmarkExpandedAriaAttrs(expanded = false) {
    return {
      'aria-expanded': expanded ? 'true' : 'false',
    }
  }

  /**
   * 生成完整的书签项 ARIA 属性（含选中/展开状态）
   * @param {Object} opts
   * @param {boolean} [opts.selected=false]
   * @param {boolean} [opts.expanded=false]
   * @returns {Object}
   */
  getBookmarkItemFullAriaAttrs(opts = {}) {
    const base = this.getBookmarkItemAriaAttrs(opts)
    const selected = this.getBookmarkSelectedAriaAttrs(opts.selected)
    const expanded = this.getBookmarkExpandedAriaAttrs(opts.expanded)
    return { ...base, ...selected, ...expanded }
  }

  // ==================== Live Region 公告（委托）====================

  createAnnouncer(container) {
    return AnnouncerFactory(container, this)
  }

  // ==================== 对比度审计 (委托) ====================

  static auditContrast() { return _auditContrast() }
  static setContrastPairs(pairs, replace) { return _setContrastPairs(pairs, replace) }
  static getFailingPairs() { return _getFailingPairs() }
  static auditContrastSummary() { return _auditContrastSummary() }
  static attrsToString(attrs) { return _attrsToString(attrs) }

  getBookmarkItemAttrString(opts) {
    return BookmarkAccessibility.attrsToString(this.getBookmarkItemAriaAttrs(opts))
  }

  getBookmarkListAttrString(opts) {
    return BookmarkAccessibility.attrsToString(this.getBookmarkListAriaAttrs(opts))
  }

  // ==================== 清理 ====================

  destroy() {
    this._enabled = false
    this._traps.forEach(t => {
      if (t.deactivate) t.deactivate()
    })
    this._traps = []
    this._announcers.forEach(a => {
      if (a.destroy) a.destroy()
    })
    this._announcers = []
    this._handlers = []
  }
}

// ==================== 向后兼容 re-export ====================
export { getContrastRatio, meetsWCAG_AA, hexToRgb }
