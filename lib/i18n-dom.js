/**
 * i18n — DOM 自动翻译与内置语言包
 *
 * 从 i18n.js 拆分:
 *   - BUILTIN_ZH / BUILTIN_EN — 默认内置语言包
 *   - translateDOM(root) — 自动翻译 data-i18n 属性元素
 *   - applyDirection(root) — RTL 方向设置
 *
 * @module lib/i18n-dom
 */

// ==================== 默认语言包 ====================

export const BUILTIN_ZH = {
  'app.name': '智阅',
  'tab.chat': '问答',
  'tab.skills': '技能',
  'tab.knowledge': '知识',
  'tab.wiki': 'Wiki',
  'tab.page': '页面',
  'tab.settings': '设置',
  'tab.bookmarks': '书签',
  'tab.logs': '日志',
}

export const BUILTIN_EN = {
  'app.name': 'PageWise',
  'tab.chat': 'Chat',
  'tab.skills': 'Skills',
  'tab.knowledge': 'Knowledge',
  'tab.wiki': 'Wiki',
  'tab.page': 'Page',
  'tab.settings': 'Settings',
  'tab.bookmarks': 'Bookmarks',
  'tab.logs': 'Logs',
}

// ==================== DOM 自动翻译 ====================

/**
 * 自动翻译页面中带 data-i18n 属性的元素
 *
 * @param {Function} tFn — 翻译函数 (key) => string
 * @param {string} currentLocale — 当前语言
 * @param {HTMLElement|Document} [root=document] — 根元素
 */
export function translateDOM(tFn, currentLocale, root) {
  const doc = root || (typeof document !== 'undefined' ? document : null)
  if (!doc) return

  const elements = doc.querySelectorAll('[data-i18n]')
  for (const el of elements) {
    const key = el.getAttribute('data-i18n')
    if (key) {
      el.textContent = tFn(key)
    }
  }

  const placeholders = doc.querySelectorAll('[data-i18n-placeholder]')
  for (const el of placeholders) {
    const key = el.getAttribute('data-i18n-placeholder')
    if (key) {
      el.placeholder = tFn(key)
    }
  }

  const titles = doc.querySelectorAll('[data-i18n-title]')
  for (const el of titles) {
    const key = el.getAttribute('data-i18n-title')
    if (key) {
      el.title = tFn(key)
    }
  }

  const ariaLabels = doc.querySelectorAll('[data-i18n-aria-label]')
  for (const el of ariaLabels) {
    const key = el.getAttribute('data-i18n-aria-label')
    if (key) {
      el.setAttribute('aria-label', tFn(key))
    }
  }

  const htmlEl = doc.documentElement || doc.querySelector('html')
  if (htmlEl) {
    htmlEl.setAttribute('lang', currentLocale)
  }
}

/**
 * 更新 CSS 逻辑属性以支持 RTL 语言
 * @param {string} currentLocale — 当前语言
 * @param {HTMLElement|Document} [root=document]
 */
export function applyDirection(currentLocale, root) {
  const doc = root || (typeof document !== 'undefined' ? document : null)
  if (!doc) return

  const htmlEl = doc.documentElement || doc.querySelector('html')
  if (!htmlEl) return

  const rtlLocales = ['ar', 'he', 'fa', 'ur']
  const baseLocale = currentLocale.split('-')[0]
  const isRTL = rtlLocales.includes(baseLocale)

  htmlEl.setAttribute('dir', isRTL ? 'rtl' : 'ltr')
}
