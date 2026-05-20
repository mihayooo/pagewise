/**
 * ChatModePanel — Chat 模式浮窗面板 DOM 操作
 *
 * 从 chat-mode.js (R226) 拆分:
 *   - createFloatingPanel(options) — 创建浮窗 Chat 面板
 *   - destroyFloatingPanel(el) — 销毁浮窗面板
 *
 * @module lib/chat-mode-panel
 */

// ==================== 浮窗面板创建 ====================

/**
 * 创建浮窗 Chat 面板 DOM 元素
 *
 * @param {Object} options
 * @param {Object|null} options.pageContext — 页面上下文 { title, url }
 * @param {Function} options.onSwitchMode — 切换显示方式回调
 * @param {Function} options.onClose — 关闭回调
 * @param {Function} options.onSend — 发送回调 (text) => void
 * @returns {HTMLElement} 创建的浮窗面板 DOM 元素
 */
export function createFloatingPanel(options) {
  const { pageContext, onSwitchMode, onClose, onSend } = options

  const el = document.createElement('div')
  el.className = 'pw-chat-floating-panel'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', 'Chat 模式')

  // 标题栏
  const header = document.createElement('div')
  header.className = 'pw-chat-header'
  header.textContent = '💬 Chat'

  // 切换按钮
  const switchBtn = document.createElement('button')
  switchBtn.className = 'pw-chat-switch-btn'
  switchBtn.textContent = '📋 侧边栏'
  switchBtn.addEventListener('click', () => onSwitchMode())
  header.appendChild(switchBtn)

  // 关闭按钮
  const closeBtn = document.createElement('button')
  closeBtn.className = 'pw-chat-close-btn'
  closeBtn.textContent = '✕'
  closeBtn.setAttribute('aria-label', '关闭')
  closeBtn.addEventListener('click', () => onClose())
  header.appendChild(closeBtn)

  el.appendChild(header)

  // 页面上下文预览
  const ctx = pageContext
  if (ctx && (ctx.title || ctx.url)) {
    const ctxPreview = document.createElement('div')
    ctxPreview.className = 'pw-chat-context-preview'
    ctxPreview.textContent = `📄 ${ctx.title || ctx.url}`
    el.appendChild(ctxPreview)
  }

  // 输入区域
  const inputArea = document.createElement('textarea')
  inputArea.className = 'pw-chat-input'
  inputArea.placeholder = '输入你的问题…'
  inputArea.rows = 3
  el.appendChild(inputArea)

  // 发送按钮
  const sendBtn = document.createElement('button')
  sendBtn.className = 'pw-chat-send-btn'
  sendBtn.textContent = '发送'
  sendBtn.addEventListener('click', () => {
    onSend(inputArea.value)
  })
  el.appendChild(sendBtn)

  document.body.appendChild(el)

  // 动画
  requestAnimationFrame(() => {
    if (el.parentNode) {
      el.classList.add('pw-chat-floating-panel--visible')
    }
  })

  // 聚焦输入框
  setTimeout(() => inputArea.focus(), 100)

  return el
}

// ==================== 浮窗面板销毁 ====================

/**
 * 销毁浮窗面板 DOM 元素（带动画）
 *
 * @param {HTMLElement|null} el — 浮窗面板 DOM 元素
 */
export function destroyFloatingPanel(el) {
  if (!el) return

  el.classList.remove('pw-chat-floating-panel--visible')
  el.classList.add('pw-chat-floating-panel--hiding')

  const cleanup = () => {
    if (el.parentNode) {
      el.parentNode.removeChild(el)
    }
  }

  el.addEventListener('transitionend', cleanup, { once: true })
  setTimeout(cleanup, 200)
}
