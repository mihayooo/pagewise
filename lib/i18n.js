/**
 * i18n — PageWise 国际化基础设施
 *
 * 功能：
 * 1. 语言包加载机制（zh-CN, en-US）
 * 2. 翻译函数 t(key, params)
 * 3. 语言切换 API
 * 4. 从 chrome.storage 读取语言偏好
 *
 * 子模块:
 *   - i18n-dom.js — DOM 自动翻译 + 内置语言包
 *
 * 设计约束：
 * - 纯手写，不引入外部 i18n 库
 * - 向后兼容：未翻译的 key 返回原始 key
 * - 支持参数插值 {{name}}
 */

import { storageGet, storageSet } from './storage-adapter.js'
import {
  BUILTIN_ZH,
  BUILTIN_EN,
  translateDOM as _translateDOM,
  applyDirection as _applyDirection,
} from './i18n-dom.js'

// 向后兼容 re-exports
export { BUILTIN_ZH, BUILTIN_EN, translateDOM as translateDOMFn, applyDirection as applyDirectionFn } from './i18n-dom.js'

// ==================== 语言包缓存 ====================

const _loadedLocales = {}
let _currentLocale = 'zh-CN'
let _fallbackLocale = 'en-US'
const _listeners = []

// ==================== 语言包加载 ====================

/**
 * @param {string} locale - 语言代码（如 zh-CN）
 * * @param {object} messages - 翻译键值对
 */
export function registerLocale(locale, messages) {
  _loadedLocales[locale] = { ...messages }
}

/**
 * @param {string} locale - 语言代码
 * * @param {string} url - 语言包 JSON URL
 * * @returns {Promise<object>} 加载的语言包
 */
export async function loadLocaleFromURL(locale, url) {
  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      console.warn(`[i18n] Failed to load locale ${locale} from ${url}: ${resp.status}`)
      return {}
    }
    const messages = await resp.json()
    _loadedLocales[locale] = messages
    return messages
  } catch (err) {
    console.warn(`[i18n] Error loading locale ${locale}:`, err)
    return {}
  }
}

// ==================== 语言偏好管理 ====================

/**
 * @returns {string} 当前首选语言代码
 */
export async function getPreferredLanguage() {
  try {
    const result = await storageGet({ language: 'zh-CN' })
    return result.language || 'zh-CN'
  } catch (_e) {
    return _currentLocale
  }
}

/**
 * @param {string} lang - 语言代码
 */
export async function setPreferredLanguage(locale) {
  _currentLocale = locale
  try {
    await storageSet({ language: locale })
  } catch (_e) {
    // 静默处理
  }
}

// ==================== 语言切换 API ====================

/**
 * @returns {string} 当前活跃语言代码
 */
export function getCurrentLocale() {
  return _currentLocale
}

/** @returns {string} 回退语言代码 */
export function getFallbackLocale() {
  return _fallbackLocale
}

/**
 * @param {string} locale - 切换的目标语言代码
 */
export function setLocale(locale) {
  const old = _currentLocale
  _currentLocale = locale
  if (old !== locale) {
    _notifyListeners(locale, old)
  }
}

/** @param {string} locale - 回退语言代码 */
export function setFallbackLocale(locale) {
  _fallbackLocale = locale
}

/**
 * @param {function} callback - 语言变更回调
 */
export function onLocaleChange(callback) {
  _listeners.push(callback)
  return () => {
    const idx = _listeners.indexOf(callback)
    if (idx !== -1) _listeners.splice(idx, 1)
  }
}

function _notifyListeners(newLocale, oldLocale) {
  for (const fn of _listeners) {
    try {
      fn(newLocale, oldLocale)
    } catch (e) {
      console.error('[i18n] Listener error:', e)
    }
  }
}

// ==================== 翻译函数 ====================

/**
 * @param {string} key - 翻译键
 * * @param {object} [params] - 插值参数
 * * @returns {string} 翻译后的文本
 */
export function t(key, params, locale) {
  if (!key) return ''

  const loc = locale || _currentLocale

  let template = _resolveKey(key, loc)

  if (template !== null && params && typeof params === 'object') {
    template = _interpolate(template, params)
  }

  return template !== null ? template : key
}

/**
 * @param {string} key - 翻译键
 * @param {string} [locale] - 语言代码
 * @returns {boolean} 是否存在翻译
 */
export function hasTranslation(key, locale) {
  const loc = locale || _currentLocale
  return _resolveKey(key, loc) !== null
}

/** @returns {object} 当前语言的所有翻译消息 */
export function getAllMessages() {
  return { ...(_loadedLocales[_currentLocale] || {}) }
}

/** @returns {string[]} 已加载的语言代码列表 */
export function getSupportedLocales() {
  return Object.keys(_loadedLocales)
}

// ==================== DOM 自动翻译（委托给子模块） ====================

/** @param {Element} [root] - DOM 根元素 */
export function translateDOM(root) {
  _translateDOM(t, _currentLocale, root)
}

/** @param {Element} [root] - DOM 根元素 */
export function applyDirection(root) {
  _applyDirection(_currentLocale, root)
}

// ==================== 初始化 ====================

/**
 * @param {object} [options] - 初始化选项
 * @param {object} [options.locales] - 额外语言包
 * @param {string} [options.defaultLocale] - 默认语言
 * @param {string} [options.fallback='en-US'] - 回退语言
 * @param {boolean} [options.translatePage=true] - 是否翻译页面
 * @returns {Promise<string>} 初始化后的当前语言
 */
export async function initI18n(options = {}) {
  const {
    locales = null,
    defaultLocale = null,
    fallback = 'en-US',
    translatePage = true,
  } = options

  _fallbackLocale = fallback

  if (locales) {
    for (const [loc, messages] of Object.entries(locales)) {
      registerLocale(loc, messages)
    }
  }

  if (!_loadedLocales['zh-CN']) {
    registerLocale('zh-CN', BUILTIN_ZH)
  }
  if (!_loadedLocales['en-US']) {
    registerLocale('en-US', BUILTIN_EN)
  }

  let preferred = await getPreferredLanguage()

  if (!preferred && defaultLocale) {
    preferred = defaultLocale
  }

  _currentLocale = preferred || 'zh-CN'

  if (translatePage && typeof document !== 'undefined') {
    translateDOM()
    applyDirection()
  }

  return _currentLocale
}

// ==================== 内部工具函数 ====================

function _resolveKey(key, locale) {
  const current = _loadedLocales[locale]
  if (current) {
    if (current[key] !== undefined && current[key] !== null) return current[key]
    const val = _getNestedValue(current, key)
    if (val !== undefined && val !== null) return val
  }

  if (locale !== _fallbackLocale) {
    const fallback = _loadedLocales[_fallbackLocale]
    if (fallback) {
      if (fallback[key] !== undefined && fallback[key] !== null) return fallback[key]
      const val = _getNestedValue(fallback, key)
      if (val !== undefined && val !== null) return val
    }
  }

  return null
}

function _getNestedValue(obj, path) {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = current[part]
  }
  return current
}

function _interpolate(template, params) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return params[name] !== undefined ? String(params[name]) : match
  })
}
