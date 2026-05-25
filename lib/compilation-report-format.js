/**
 * Compilation Report — 报告格式化与数据结构子模块
 *
 * 从 compilation-report.js 拆分，负责:
 *   - IngestStats / buildIngestStats / computeIngestDiff
 *   - generateReportMarkdown / generateReportHtml
 *   - mergeIngestStats / summarizeReport / formatReportSummary
 */

const SEVERITY_ICONS = { high: '🔴', medium: '🟡', low: '🔵' }
const SEVERITY_LABELS = { high: '严重', medium: '中等', low: '轻微' }
const ENTITY_TYPE_LABELS = {
  person: '人物', tool: '工具', framework: '框架', api: 'API',
  language: '编程语言', platform: '平台', library: '库', service: '服务', other: '其他',
}

// ==================== IngestStats ====================

/**
 * @param {object} [data={}] - 初始化数据
 * * @property {number} newPageCount - 新页面数
 * * @property {number} updatedPageCount - 更新页面数
 */
export class IngestStats {
  constructor(data = {}) {
    this.newPageCount = data.newPageCount || 0
    this.updatedPageCount = data.updatedPageCount || 0
    this.newEntities = data.newEntities ? [...data.newEntities] : []
    this.newConcepts = data.newConcepts ? [...data.newConcepts] : []
    this.newCrossRefs = data.newCrossRefs ? [...data.newCrossRefs] : []
    this.contradictions = data.contradictions ? [...data.contradictions] : []
    this.generatedAt = data.generatedAt !== undefined ? data.generatedAt : new Date().toISOString()
  }
}

// ==================== buildIngestStats ====================

/**
 * @param {object} params - 参数对象
 * * @returns {IngestStats} 汇入统计
 */
export function buildIngestStats(params) {
  const newEntries = params.newEntries || []
  const oldEntries = params.oldEntries || []
  const newEntities = params.newEntities || []
  const oldEntities = params.oldEntities || []
  const newConcepts = params.newConcepts || []
  const oldConcepts = params.oldConcepts || []
  const crossRefs = params.crossRefs || []
  const contradictions = params.contradictions || []

  const diff = computeIngestDiff(newEntries, oldEntries)
  const oldEntityNames = new Set(oldEntities.map(e => (e.name || '').toLowerCase().trim()))
  const addedEntities = newEntities.filter(e => !oldEntityNames.has((e.name || '').toLowerCase().trim()))
  const oldConceptNames = new Set(oldConcepts.map(c => (c.name || '').toLowerCase().trim()))
  const addedConcepts = newConcepts.filter(c => !oldConceptNames.has((c.name || '').toLowerCase().trim()))

  return new IngestStats({
    newPageCount: diff.added.length, updatedPageCount: diff.updated.length,
    newEntities: addedEntities, newConcepts: addedConcepts,
    newCrossRefs: crossRefs, contradictions,
  })
}

// ==================== computeIngestDiff ====================

/**
 * @param {Array} newEntries - 新条目列表
 * * @param {Array} oldEntries - 旧条目列表
 * * @returns {{added: Array, updated: Array, removed: Array}} 差异
 */
export function computeIngestDiff(newEntries, oldEntries) {
  const newE = newEntries || []
  const oldE = oldEntries || []
  const oldById = new Map()
  for (const entry of oldE) { if (entry.id !== null) oldById.set(entry.id, entry) }
  const newIds = new Set()
  for (const entry of newE) { if (entry.id !== null) newIds.add(entry.id) }
  const added = [], updated = []
  for (const entry of newE) {
    if (entry.id !== null && oldById.has(entry.id)) updated.push(entry)
    else added.push(entry)
  }
  const removed = []
  for (const entry of oldE) {
    if (entry.id === null || !newIds.has(entry.id)) removed.push(entry)
  }
  return { added, updated, removed }
}

// ==================== generateReportMarkdown ====================

/**
 * @param {object} stats - 汇入统计
 * * @returns {string} Markdown 报告
 */
export function generateReportMarkdown(stats) {
  const lines = []
  const ts = stats.generatedAt || new Date().toISOString()
  const dateStr = ts.split('T')[0] || ts

  lines.push('# 📊 知识编译报告', '', `> 生成时间: ${dateStr}`, '')
  lines.push('## 📄 页面变化', '', '| 指标 | 数量 |', '|------|------|')
  lines.push(`| ➕ 新增页面 | **${stats.newPageCount}** |`)
  lines.push(`| 🔄 更新页面 | **${stats.updatedPageCount}** |`, '')

  if (stats.newEntities?.length > 0) {
    lines.push('## 🏷️ 新发现的实体', '')
    for (const e of stats.newEntities) {
      const typeLabel = ENTITY_TYPE_LABELS[e.type] || e.type || '其他'
      lines.push(`- **${e.name}** (${typeLabel}) — ${e.description || '无描述'}`)
    }
    lines.push('')
  }
  if (stats.newConcepts?.length > 0) {
    lines.push('## 💡 新发现的概念', '')
    for (const c of stats.newConcepts) lines.push(`- **${c.name}** — ${c.description || '无描述'}`)
    lines.push('')
  }
  if (stats.newCrossRefs?.length > 0) {
    lines.push('## 🔗 新建交叉引用', '', `共建立 **${stats.newCrossRefs.length}** 条交叉引用。`, '')
    for (const ref of stats.newCrossRefs.slice(0, 10)) {
      lines.push(`- 条目 #${ref.fromId} ↔ 条目 #${ref.toId} (${ref.relation || '关联'})`)
    }
    if (stats.newCrossRefs.length > 10) lines.push(`- ... 等共 ${stats.newCrossRefs.length} 条`)
    lines.push('')
  }
  if (stats.contradictions?.length > 0) {
    lines.push('## ⚠️ 检测到的矛盾', '')
    for (const c of stats.contradictions) {
      const icon = SEVERITY_ICONS[c.severity] || '🔵'
      const severityLabel = SEVERITY_LABELS[c.severity] || '未知'
      lines.push(`- ${icon} **[${severityLabel}]** ${c.description || '未描述'}`)
    }
    lines.push('')
  }
  lines.push('---', '*由 PageWise 知识编译引擎自动生成*')
  return lines.join('\n')
}

// ==================== generateReportHtml ====================

/**
 * @param {object} stats - 汇入统计
 * * @returns {string} HTML 报告
 */
export function generateReportHtml(stats) {
  const ts = stats.generatedAt || new Date().toISOString()
  const dateStr = ts.split('T')[0] || ts
  let html = '<div class="pw-compilation-report">'

  html += `<div class="pw-report-header"><span class="pw-report-icon">📊</span>`
  html += `<span class="pw-report-title">知识编译报告</span>`
  html += `<span class="pw-report-date">${escapeHtml(dateStr)}</span></div>`

  html += '<div class="pw-report-stats">'
  html += buildStatCard('📄', '新增页面', stats.newPageCount, 'new')
  html += buildStatCard('🔄', '更新页面', stats.updatedPageCount, 'updated')
  html += buildStatCard('🏷️', '新实体', (stats.newEntities || []).length, 'entity')
  html += buildStatCard('💡', '新概念', (stats.newConcepts || []).length, 'concept')
  html += buildStatCard('🔗', '交叉引用', (stats.newCrossRefs || []).length, 'xref')
  html += '</div>'

  if (stats.newEntities?.length > 0) {
    html += '<div class="pw-report-section"><div class="pw-report-section-title">🏷️ 新发现的实体</div><div class="pw-report-entity-list">'
    for (const entity of stats.newEntities) {
      const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他'
      html += `<div class="pw-report-entity-item"><span class="pw-report-entity-name">${escapeHtml(entity.name)}</span>`
      html += `<span class="pw-report-entity-type">${escapeHtml(typeLabel)}</span>`
      if (entity.description) html += `<span class="pw-report-entity-desc">${escapeHtml(entity.description)}</span>`
      html += '</div>'
    }
    html += '</div></div>'
  }

  if (stats.newConcepts?.length > 0) {
    html += '<div class="pw-report-section"><div class="pw-report-section-title">💡 新发现的概念</div><div class="pw-report-concept-list">'
    for (const concept of stats.newConcepts) {
      html += `<div class="pw-report-concept-item"><span class="pw-report-concept-name">${escapeHtml(concept.name)}</span>`
      if (concept.description) html += `<span class="pw-report-concept-desc">${escapeHtml(concept.description)}</span>`
      html += '</div>'
    }
    html += '</div></div>'
  }

  if (stats.newCrossRefs?.length > 0) {
    html += `<div class="pw-report-section"><div class="pw-report-section-title">🔗 新建交叉引用 (${stats.newCrossRefs.length})</div><div class="pw-report-xref-list">`
    for (const ref of stats.newCrossRefs.slice(0, 10)) {
      html += `<div class="pw-report-xref-item"><span>条目 #${ref.fromId} ↔ #${ref.toId}</span>`
      html += `<span class="pw-report-xref-relation">${escapeHtml(ref.relation || '关联')}</span></div>`
    }
    if (stats.newCrossRefs.length > 10) html += `<div class="pw-report-xref-more">... 等共 ${stats.newCrossRefs.length} 条</div>`
    html += '</div></div>'
  }

  if (stats.contradictions?.length > 0) {
    html += `<div class="pw-report-section pw-report-contradictions"><div class="pw-report-section-title">⚠️ 检测到 ${stats.contradictions.length} 条矛盾</div><div class="pw-report-contradiction-list">`
    for (const c of stats.contradictions) {
      const icon = SEVERITY_ICONS[c.severity] || '🔵'
      const severityLabel = SEVERITY_LABELS[c.severity] || '未知'
      html += `<div class="pw-report-contradiction-item"><span class="pw-report-contradiction-severity">${icon} ${severityLabel}</span>`
      html += `<span class="pw-report-contradiction-desc">${escapeHtml(c.description || '未描述')}</span></div>`
    }
    html += '</div></div>'
  }

  html += '</div>'
  return html
}

// ==================== mergeIngestStats ====================

/**
 * @param {object} a - 统计 A
 * * @param {object} b - 统计 B
 * * @returns {object} 合并后的统计
 */
export function mergeIngestStats(...statsList) {
  const result = new IngestStats()
  result.generatedAt = ''
  for (const stats of statsList) {
    result.newPageCount += stats.newPageCount || 0
    result.updatedPageCount += stats.updatedPageCount || 0
    result.newCrossRefs.push(...(stats.newCrossRefs || []))
    result.contradictions.push(...(stats.contradictions || []))
    if (stats.generatedAt && stats.generatedAt > result.generatedAt) result.generatedAt = stats.generatedAt
  }
  result.newEntities = deduplicateByName(statsList.flatMap(s => s.newEntities || []))
  result.newConcepts = deduplicateByName(statsList.flatMap(s => s.newConcepts || []))
  return result
}

function deduplicateByName(items) {
  const map = new Map()
  for (const item of items) {
    const key = (item.name || '').toLowerCase().trim()
    if (key) map.set(key, { ...item })
  }
  return [...map.values()]
}

// ==================== summarizeReport / formatReportSummary ====================

/**
 * @param {object} stats - 汇入统计
 * * @returns {object} 摘要
 */
export function summarizeReport(stats) {
  const parts = [`新增 ${stats.newPageCount} 页`]
  if (stats.updatedPageCount > 0) parts.push(`更新 ${stats.updatedPageCount} 页`)
  if (stats.newEntities.length > 0) parts.push(`${stats.newEntities.length} 新实体`)
  if (stats.newConcepts.length > 0) parts.push(`${stats.newConcepts.length} 新概念`)
  if (stats.newCrossRefs.length > 0) parts.push(`${stats.newCrossRefs.length} 引用`)
  if (stats.contradictions.length > 0) parts.push(`${stats.contradictions.length} 矛盾`)
  return parts.join('，')
}

/**
 * @param {object} summary - 摘要对象
 * * @returns {string} 格式化的文本
 */
export function formatReportSummary(stats) {
  const lines = ['📊 编译报告']
  const pageParts = [`📄 新增 ${stats.newPageCount}`]
  if (stats.updatedPageCount > 0) pageParts.push(`🔄 更新 ${stats.updatedPageCount}`)
  lines.push(pageParts.join(' | '))
  if (stats.newEntities.length > 0 || stats.newConcepts.length > 0) {
    const kcParts = []
    if (stats.newEntities.length > 0) kcParts.push(`🏷️ ${stats.newEntities.length} 新实体`)
    if (stats.newConcepts.length > 0) kcParts.push(`💡 ${stats.newConcepts.length} 新概念`)
    lines.push(kcParts.join(' | '))
  }
  if (stats.newCrossRefs.length > 0) lines.push(`🔗 ${stats.newCrossRefs.length} 新交叉引用`)
  if (stats.contradictions.length > 0) lines.push(`⚠️ ${stats.contradictions.length} 条矛盾待处理`)
  return lines.join('\n')
}

// ==================== helpers ====================

function buildStatCard(icon, label, value, type) {
  return `<div class="pw-report-stat-card pw-report-stat-${type}">` +
    `<span class="pw-report-stat-icon">${icon}</span>` +
    `<span class="pw-report-stat-value">${value}</span>` +
    `<span class="pw-report-stat-label">${escapeHtml(label)}</span></div>`
}

export function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
