/**
 * BookmarkAccessibility — 焦点管理与公告子模块
 *
 * 从 bookmark-accessibility.js 拆分，负责:
 *   - FocusTrapFactory — 焦点陷阱创建
 *   - AnnouncerFactory — 屏幕阅读器公告创建
 *
 * @module lib/bookmark-accessibility-navigator
 */

import { FOCUS_TRAP_SELECTORS, KEYBOARD_NAV_KEYS } from './bookmark-accessibility.js'

/**
 * 创建焦点陷阱工厂函数
 *
 * @param {Object} container — 容器元素
 * @param {Object} [options]
 * @returns {Object} 焦点陷阱实例
 */
export function FocusTrapFactory(container) {
  let active = false
  let previousFocus = null

  const getFocusableElements = () => {
    const selector = FOCUS_TRAP_SELECTORS.join(', ')
    return Array.from(container.querySelectorAll(selector))
  }

  const handleKeydown = (event) => {
    if (!active) return
    if (event.key !== KEYBOARD_NAV_KEYS.TAB) return

    const focusable = getFocusableElements()
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey) {
      if (container.activeElement === first || !container.contains(container.activeElement)) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (container.activeElement === last || !container.contains(container.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  const handleFocusIn = (event) => {
    if (!active) return
    if (!container.contains(event.target)) {
      const focusable = getFocusableElements()
      if (focusable.length > 0) {
        focusable[0].focus()
      }
    }
  }

  return {
    activate() {
      if (active) return
      active = true
      previousFocus = container.activeElement || null
      container.addEventListener('keydown', handleKeydown)
      container.addEventListener('focusin', handleFocusIn)

      const focusable = getFocusableElements()
      if (focusable.length > 0) {
        focusable[0].focus()
      }
    },

    deactivate() {
      if (!active) return
      active = false
      container.removeEventListener('keydown', handleKeydown)
      container.removeEventListener('focusin', handleFocusIn)

      if (previousFocus && previousFocus.focus) {
        previousFocus.focus()
      }
    },

    isActive() {
      return active
    },
  }
}

/**
 * 创建公告器工厂函数
 *
 * @param {Object} container — 容器元素
 * @param {Object} accessibilityInstance — BookmarkAccessibility 实例引用
 * @returns {Object} 公告器实例
 */
export function AnnouncerFactory(container, accessibilityInstance) {
  let liveEl = null

  const ensureElement = () => {
    if (liveEl) return liveEl

    if (container.querySelector) {
      liveEl = container.querySelector('[aria-live]')
    }

    if (!liveEl) {
      liveEl = {
        _textContent: '',
        setAttribute: () => {},
        getAttribute: () => '',
        style: {},
        set textContent(v) { this._textContent = v },
        get textContent() { return this._textContent },
      }
      if (container.appendChild) {
        container.appendChild(liveEl)
      }
    }

    return liveEl
  }

  return {
    announce(message) {
      if (!accessibilityInstance._enabled) return
      const el = ensureElement()
      el.textContent = ''
      setTimeout(() => {
        el.textContent = message
      }, 50)
    },

    destroy() {
      if (liveEl && container.removeChild) {
        try { container.removeChild(liveEl) } catch { /* ignore */ }
      }
      liveEl = null
    },
  }
}
