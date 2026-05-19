/**
 * BookmarkAccessibility — 颜色对比度工具子模块
 *
 * 从 bookmark-accessibility.js 拆分，负责:
 *   - HEX 颜色解析与对比度计算
 *   - WCAG AA 标准检查
 *   - 预定义色彩对审计
 *   - HTML 属性字符串生成
 *
 * @module lib/bookmark-accessibility-contrast
 */

// ==================== 常量 ====================

/** 已知 CSS 变量色彩对比度检查对 */
const CONTRAST_PAIRS = [
  { selector: '--text-primary on --bg-primary', fg: '#18181b', bg: '#fafafa' },
  { selector: '--text-secondary on --bg-primary', fg: '#71717a', bg: '#fafafa' },
  { selector: '--text-muted on --bg-primary', fg: '#70707b', bg: '#fafafa' },
  { selector: '--text-primary on --bg-elevated', fg: '#18181b', bg: '#ffffff' },
  { selector: '--text-secondary on --bg-elevated', fg: '#71717a', bg: '#ffffff' },
  { selector: '--text-muted on --bg-elevated', fg: '#70707b', bg: '#ffffff' },
  { selector: '--accent on --bg-primary', fg: '#6366f1', bg: '#fafafa' },
  { selector: '--info on --info-light', fg: '#3b82f6', bg: '#eff6ff' },
  { selector: '--danger on --danger-light', fg: '#ef4444', bg: '#fef2f2' },
  { selector: '--warning on --warning-light', fg: '#f59e0b', bg: '#fffbeb' },
  { selector: '--text-inverse on --accent', fg: '#ffffff', bg: '#6366f1' },
  { selector: 'bk-status-unread on --info-light', fg: '#2563eb', bg: '#eff6ff' },
  { selector: 'bk-status-reading on --warning-light', fg: '#b45309', bg: '#fffbeb' },
  { selector: 'bk-status-read on --success-light', fg: '#15803d', bg: '#f0fdf4' },
]

// ==================== 颜色工具函数 ====================

/**
 * 将 HEX 颜色解析为 RGB
 * @param {string} hex — #RRGGBB 或 RRGGBB
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '')
  const num = parseInt(clean, 16)
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

/**
 * 计算相对亮度 (WCAG 2.1)
 * @param {string} hex
 * @returns {number} 0-1
 */
export function getRelativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const toLinear = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * 计算两个 HEX 颜色的对比度
 * @param {string} fg — 前景色
 * @param {string} bg — 背景色
 * @returns {number} 对比度 (1-21)
 */
export function getContrastRatio(fg, bg) {
  const l1 = getRelativeLuminance(fg)
  const l2 = getRelativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 检查是否满足 WCAG AA 对比度要求
 * @param {string} fg
 * @param {string} bg
 * @param {boolean} [isLargeText=false] — 大文本阈值 3:1
 * @returns {boolean}
 */
export function meetsWCAG_AA(fg, bg, isLargeText = false) {
  const ratio = getContrastRatio(fg, bg)
  return isLargeText ? ratio >= 3 : ratio >= 4.5
}

// ==================== 对比度审计 ====================

/**
 * 审计预定义色彩组合的 WCAG AA 对比度
 * @returns {Array<{ selector: string, foreground: string, background: string, ratio: number, passes: boolean }>}
 */
export function auditContrast() {
  return CONTRAST_PAIRS.map((pair) => {
    const ratio = getContrastRatio(pair.fg, pair.bg)
    return {
      selector: pair.selector,
      foreground: pair.fg,
      background: pair.bg,
      ratio: Math.round(ratio * 100) / 100,
      passes: ratio >= 4.5,
    }
  })
}

/**
 * 动态设置对比度审计色彩对
 * @param {Array<{ selector: string, fg: string, bg: string }>} pairs
 * @param {boolean} [replace=false]
 */
export function setContrastPairs(pairs, replace = false) {
  if (replace) {
    CONTRAST_PAIRS.length = 0
  }
  for (const p of pairs) {
    CONTRAST_PAIRS.push({ selector: p.selector, fg: p.fg, bg: p.bg })
  }
}

/**
 * 获取所有未通过 WCAG AA 的色彩对
 * @returns {Array}
 */
export function getFailingPairs() {
  return auditContrast().filter(item => !item.passes)
}

/**
 * 对比度审计摘要
 * @returns {{ results: Array, total: number, passing: number, failing: number }}
 */
export function auditContrastSummary() {
  const results = auditContrast()
  const passing = results.filter(r => r.passes).length
  return {
    results,
    total: results.length,
    passing,
    failing: results.length - passing,
  }
}

/**
 * 将属性对象转为 HTML 属性字符串
 * @param {Object} attrs
 * @returns {string}
 */
export function attrsToString(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ')
}
