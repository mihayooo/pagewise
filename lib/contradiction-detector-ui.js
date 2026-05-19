/**
 * Contradiction Detector — UI HTML 生成子模块
 *
 * 从 contradiction-detector.js 拆分，负责:
 *   - 矛盾告警 HTML 生成
 *   - HTML 转义
 *
 * @module lib/contradiction-detector-ui
 */

/**
 * 转义 HTML 特殊字符
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 生成矛盾告警的 HTML
 *
 * @param {Array<Object>} contradictions - 矛盾列表
 * @param {Object} [options]
 * @returns {string} HTML 字符串
 */
export function buildContradictionWarningHtml(contradictions, _options = {}) {
  if (!contradictions || contradictions.length === 0) return ''

  const severityIcons = {
    high: '🔴',
    medium: '🟡',
    low: '🔵',
  }

  const severityLabels = {
    high: '严重冲突',
    medium: '潜在冲突',
    low: '轻微差异',
  }

  const typeLabels = {
    fact_change: '事实变更',
    version_conflict: '版本冲突',
    outdated: '信息过时',
    definitional: '定义差异',
  }

  let html = '<div class="pw-contradiction-warning">'
  html += '<div class="pw-contradiction-header">'
  html += `<span class="pw-contradiction-icon">⚠️</span>`
  html += `<span class="pw-contradiction-title">检测到 ${contradictions.length} 条知识冲突</span>`
  html += '</div>'

  html += '<div class="pw-contradiction-list">'

  for (const c of contradictions) {
    const icon = severityIcons[c.severity] || severityIcons.low
    const severityLabel = severityLabels[c.severity] || '未知'
    const typeLabel = typeLabels[c.type] || c.type

    html += '<div class="pw-contradiction-item">'
    html += `<div class="pw-contradiction-item-header">`
    html += `<span class="pw-contradiction-severity">${icon} ${severityLabel}</span>`
    html += `<span class="pw-contradiction-type">${typeLabel}</span>`
    html += '</div>'

    html += `<div class="pw-contradiction-desc">${escapeHtml(c.description)}</div>`

    if (c.conflictingFacts) {
      html += '<div class="pw-contradiction-facts">'
      if (c.conflictingFacts.new) {
        html += `<div class="pw-fact-new"><strong>🆕 新说法:</strong> ${escapeHtml(c.conflictingFacts.new)}</div>`
      }
      if (c.conflictingFacts.existing) {
        html += `<div class="pw-fact-existing"><strong>📌 已有:</strong> ${escapeHtml(c.conflictingFacts.existing)}</div>`
      }
      html += '</div>'
    }

    html += '<div class="pw-contradiction-actions">'
    html += `<button class="pw-contradiction-btn pw-contradiction-view" data-entry-id="${c.existingEntryId}">查看</button>`
    html += `<button class="pw-contradiction-btn pw-contradiction-dismiss" data-entry-id="${c.existingEntryId}">忽略</button>`
    html += '</div>'

    html += '</div>'
  }

  html += '</div>'
  html += '</div>'

  return html
}
