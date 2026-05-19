/**
 * Contradiction Detector — L2.3 矛盾检测
 *
 * 新回答与已有知识冲突时主动提示用户。
 * 对比新 Q&A 与已有同主题 Q&A，检测事实性矛盾（如版本号不同、API 变化），
 * 在侧边栏显示「⚠️ 知识冲突」提示，让用户确认。
 *
 * Prompt 构建已拆分至 contradiction-detector-prompt.js
 * UI HTML 生成已拆分至 contradiction-detector-ui.js
 *
 * @module contradiction-detector
 */

import { buildContradictionPrompt } from './contradiction-detector-prompt.js'
import { buildContradictionWarningHtml, escapeHtml } from './contradiction-detector-ui.js'

// ==================== 常量 ====================

/** 矛盾严重性枚举 */
export const CONTRADICTION_SEVERITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

/** 严重性排序权重（数值越大越严重） */
const SEVERITY_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
}

/** 矛盾类型枚举 */
export const CONTRADICTION_TYPE = {
  FACT_CHANGE: 'fact_change',
  VERSION_CONFLICT: 'version_conflict',
  OUTDATED: 'outdated',
  DEFINITIONAL: 'definitional',
}

/** 合法 severity 值集合 */
const VALID_SEVERITIES = new Set([
  CONTRADICTION_SEVERITY.HIGH,
  CONTRADICTION_SEVERITY.MEDIUM,
  CONTRADICTION_SEVERITY.LOW,
])

/** 合法 type 值集合 */
const VALID_TYPES = new Set(Object.values(CONTRADICTION_TYPE))

/** 版本号匹配正则 */
const VERSION_REGEX = /\b(?:v?)(\d+(?:\.\d+){0,2}(?:\.\d+)?)\b/g

/** 默认最大候选条目数 */
const MAX_CANDIDATES = 20

// ==================== 向后兼容 re-export ====================

export { buildContradictionPrompt, buildContradictionWarningHtml }

// ==================== AI 响应解析 ====================

/**
 * 解析 AI 返回的矛盾检测结果
 *
 * @param {string} response - AI 返回的文本
 * @returns {{ contradictions: Array }}
 */
export function parseContradictionResponse(response) {
  const empty = { contradictions: [] }

  if (!response || typeof response !== 'string') return empty

  let jsonStr = response.trim()

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    jsonStr = jsonMatch[0]
  }

  try {
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed.contradictions)) return empty

    const contradictions = parsed.contradictions
      .map(normalizeContradiction)
      .filter(Boolean)

    return { contradictions }
  } catch {
    return empty
  }
}

/**
 * 规范化单条矛盾记录
 */
function normalizeContradiction(raw) {
  if (!raw || raw.existingEntryId === null) return null

  return {
    existingEntryId: raw.existingEntryId,
    description: String(raw.description || '').trim(),
    severity: normalizeSeverity(raw.severity),
    type: normalizeType(raw.type),
    conflictingFacts: raw.conflictingFacts || null,
  }
}

/**
 * 规范化 severity 值
 */
function normalizeSeverity(value) {
  if (!value) return CONTRADICTION_SEVERITY.LOW
  const normalized = String(value).toLowerCase().trim()
  return VALID_SEVERITIES.has(normalized) ? normalized : CONTRADICTION_SEVERITY.LOW
}

/**
 * 规范化 type 值
 */
function normalizeType(value) {
  if (!value) return CONTRADICTION_TYPE.FACT_CHANGE
  const normalized = String(value).toLowerCase().trim()
  return VALID_TYPES.has(normalized) ? normalized : CONTRADICTION_TYPE.FACT_CHANGE
}

// ==================== 候选条目筛选 ====================

/**
 * 从已有条目中筛选可能与新条目矛盾的候选条目
 *
 * @param {Object} newEntry - 新条目
 * @param {Array<Object>} existingEntries - 已有条目列表
 * @param {number} [maxCandidates=20]
 * @returns {Array<Object>} 候选条目
 */
export function findCandidateEntries(newEntry, existingEntries, maxCandidates = MAX_CANDIDATES) {
  if (!newEntry || !existingEntries || existingEntries.length === 0) return []

  const newTags = new Set((newEntry.tags || []).map(t => t.toLowerCase().trim()))
  const newEntities = new Set(
    (newEntry.entities || []).map(e => (e.name || '').toLowerCase().trim()).filter(Boolean)
  )

  if (newTags.size === 0 && newEntities.size === 0) return []

  const scored = []
  for (const entry of existingEntries) {
    if (entry.id === newEntry.id) continue

    let score = 0

    const entryTags = (entry.tags || []).map(t => t.toLowerCase().trim())
    for (const tag of entryTags) {
      if (newTags.has(tag)) score++
    }

    const entryEntities = (entry.entities || [])
      .map(e => (e.name || '').toLowerCase().trim())
      .filter(Boolean)
    for (const entity of entryEntities) {
      if (newEntities.has(entity)) score++
    }

    if (score > 0) {
      scored.push({ entry, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxCandidates).map(s => s.entry)
}

// ==================== 版本号提取 ====================

/**
 * 从文本中提取版本号
 *
 * @param {string} text
 * @returns {Array<{ version: string, index: number }>}
 */
export function extractVersionNumbers(text) {
  if (!text || typeof text !== 'string') return []

  const versions = []
  const regex = new RegExp(VERSION_REGEX.source, VERSION_REGEX.flags)
  let match

  while ((match = regex.exec(text)) !== null) {
    const version = match[1]
    const numParts = version.split('.')
    if (numParts.length >= 2 || (numParts.length === 1 && parseInt(version) > 0 && parseInt(version) < 1000)) {
      const numVal = parseInt(version)
      if (numVal >= 2020 && numVal <= 2030 && numParts.length === 1) continue

      versions.push({
        version,
        index: match.index,
        context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
      })
    }
  }

  return versions
}

// ==================== 版本号矛盾快速检测 ====================

/**
 * 基于版本号的快速矛盾检测（启发式，不需要 AI）
 *
 * @param {string} newAnswer
 * @param {string} existingAnswer
 * @param {number} existingEntryId
 * @returns {Array<Object>}
 */
export function detectVersionContradictions(newAnswer, existingAnswer, existingEntryId) {
  if (!newAnswer || !existingAnswer) return []

  const newVersions = extractVersionNumbers(newAnswer)
  const existingVersions = extractVersionNumbers(existingAnswer)

  if (newVersions.length === 0 || existingVersions.length === 0) return []

  const contradictions = []

  const newVersionSet = new Set(newVersions.map(v => v.version))
  const existingVersionSet = new Set(existingVersions.map(v => v.version))

  const newOnly = [...newVersionSet].filter(v => !existingVersionSet.has(v))
  const existingOnly = [...existingVersionSet].filter(v => !newVersionSet.has(v))

  if (newOnly.length > 0 && existingOnly.length > 0) {
    const newContext = newVersions.map(v => v.context).join(' ')
    const existingContext = existingVersions.map(v => v.context).join(' ')

    const newWords = new Set(newContext.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const existingWords = new Set(existingContext.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const overlap = [...newWords].filter(w => existingWords.has(w))

    if (overlap.length > 0) {
      contradictions.push({
        existingEntryId,
        description: `版本号差异: 新条目提到 ${newOnly.join(', ')}，已有条目提到 ${existingOnly.join(', ')}`,
        severity: CONTRADICTION_SEVERITY.LOW,
        type: CONTRADICTION_TYPE.VERSION_CONFLICT,
        conflictingFacts: {
          new: `版本: ${newOnly.join(', ')}`,
          existing: `版本: ${existingOnly.join(', ')}`,
        },
      })
    }
  }

  return contradictions
}

// ==================== 矛盾过滤 ====================

/**
 * 过滤矛盾列表
 *
 * @param {Array<Object>} contradictions
 * @param {Object} options
 * @returns {Array<Object>}
 */
export function filterContradictions(contradictions, options = {}) {
  if (!contradictions || contradictions.length === 0) return []

  let filtered = [...contradictions]

  if (options.minSeverity) {
    const minWeight = SEVERITY_WEIGHT[options.minSeverity] || 0
    filtered = filtered.filter(c => (SEVERITY_WEIGHT[c.severity] || 0) >= minWeight)
  }

  if (options.types && Array.isArray(options.types) && options.types.length > 0) {
    const typeSet = new Set(options.types)
    filtered = filtered.filter(c => typeSet.has(c.type))
  }

  return filtered
}

// ==================== 矛盾检测主流程 ====================

/**
 * 检测新条目与已有条目之间的矛盾
 *
 * @param {Object} newEntry
 * @param {Array<Object>} existingEntries
 * @param {Object} aiClient
 * @param {Object} [options]
 * @returns {Promise<{ contradictions: Array, detectedAt: string }>}
 */
export async function detectContradictions(newEntry, existingEntries, aiClient, options = {}) {
  if (!existingEntries || existingEntries.length === 0) {
    return { contradictions: [], detectedAt: new Date().toISOString() }
  }

  const allContradictions = []

  // Step 1: 版本号快速检测
  if (!options.skipVersionCheck) {
    for (const existing of existingEntries) {
      const versionContradictions = detectVersionContradictions(
        newEntry.answer,
        existing.answer,
        existing.id
      )
      allContradictions.push(...versionContradictions)
    }
  }

  // Step 2: AI 深度语义矛盾检测
  try {
    const prompt = buildContradictionPrompt(newEntry, existingEntries)
    const chatOptions = {}
    if (options.model) chatOptions.model = options.model

    const response = await aiClient.chat(
      [{ role: 'user', content: prompt }],
      chatOptions,
    )

    const aiResult = parseContradictionResponse(response.content || response)

    const seen = new Set(allContradictions.map(c => `${c.existingEntryId}:${c.type}`))
    for (const c of aiResult.contradictions) {
      const key = `${c.existingEntryId}:${c.type}`
      if (!seen.has(key)) {
        seen.add(key)
        allContradictions.push(c)
      }
    }
  } catch {
    // AI 调用失败时安全降级
  }

  allContradictions.sort((a, b) =>
    (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0)
  )

  return {
    contradictions: allContradictions,
    detectedAt: new Date().toISOString(),
  }
}
