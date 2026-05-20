/**
 * BookmarkDocumentation — 用户文档与帮助系统模块
 *
 * Provides structured documentation, FAQ, and API reference
 * for all bookmark-related modules in PageWise.
 *
 * 子模块:
 *   - bookmark-documentation-data.js — 数据常量 (DOC_CATEGORIES/DOC_MODULES/DOC_FAQ/DOC_SECTIONS)
 *
 * @module BookmarkDocumentation
 */

// 向后兼容 re-exports
export {
  DOC_CATEGORIES,
  DOC_MODULES,
  DOC_FAQ,
  DOC_SECTIONS,
} from './bookmark-documentation-data.js'

import { DOC_MODULES, DOC_FAQ, DOC_SECTIONS } from './bookmark-documentation-data.js'

/**
 * Get the documentation index
 * @returns {{sections: Array<{id: string, title: string}>, modules: Array<{name: string, category: string}>, totalModules: number, totalSections: number}}
 */
export function getDocIndex() {
  return {
    sections: DOC_SECTIONS.map(s => ({ id: s.id, title: s.title })),
    modules: DOC_MODULES.map(m => ({ name: m.name, category: m.category })),
    totalModules: DOC_MODULES.length,
    totalSections: DOC_SECTIONS.length,
  }
}

/**
 * Get documentation for a specific module
 * @param {string} name - Module name
 * @returns {object|null} Module documentation or null
 */
export function getModuleDoc(name) {
  if (name === null) return null
  const lowerName = String(name).toLowerCase()
  return DOC_MODULES.find(m => m.name.toLowerCase() === lowerName) || null
}

/**
 * Search documentation by keyword
 * @param {string} query - Search query
 * @returns {Array<{type: string, name: string, relevance: number}>}
 */
export function searchDocs(query) {
  if (!query || typeof query !== 'string') return []
  const q = query.toLowerCase()
  const results = []

  for (const mod of DOC_MODULES) {
    let relevance = 0
    if (mod.name.toLowerCase().includes(q)) relevance += 3
    if (mod.description.toLowerCase().includes(q)) relevance += 2
    if (relevance > 0) {
      results.push({ type: 'module', name: mod.name, relevance })
    }
  }

  for (const faq of DOC_FAQ) {
    let relevance = 0
    if (faq.question.toLowerCase().includes(q)) relevance += 2
    if (faq.answer.toLowerCase().includes(q)) relevance += 1
    if (relevance > 0) {
      results.push({ type: 'faq', name: faq.question, relevance })
    }
  }

  for (const section of DOC_SECTIONS) {
    let relevance = 0
    if (section.title.toLowerCase().includes(q)) relevance += 2
    if (section.content.toLowerCase().includes(q)) relevance += 1
    if (relevance > 0) {
      results.push({ type: 'section', name: section.title, relevance })
    }
  }

  results.sort((a, b) => b.relevance - a.relevance)
  return results
}

/**
 * Get FAQ entries, optionally filtered by category
 * @param {string} [category] - Filter by category
 * @returns {Array<{question: string, answer: string, category: string}>}
 */
export function getFAQ(category) {
  if (!category) return [...DOC_FAQ]
  return DOC_FAQ.filter(f => f.category === category)
}

/**
 * Validate documentation completeness
 * @returns {{complete: boolean, totalModules: number, documentedModules: number, coverageRate: number, covered: string[], missing: string[]}}
 */
export function validateDocCompleteness() {
  const covered = DOC_MODULES.map(m => m.name)
  const missing = []

  return {
    complete: missing.length === 0,
    totalModules: covered.length + missing.length,
    documentedModules: covered.length,
    coverageRate: covered.length / Math.max(covered.length + missing.length, 1),
    covered,
    missing,
  }
}

/**
 * Generate a Markdown API reference table
 * @param {string[]} [moduleNames] - Optional list of module names to include
 * @returns {string} Markdown table string
 */
export function generateAPITable(moduleNames) {
  let modules = DOC_MODULES
  if (Array.isArray(moduleNames)) {
    modules = DOC_MODULES.filter(m => moduleNames.includes(m.name))
  }

  let table = '| 模块 | 分类 | 导出 | 签名 |\n'
  table += '|---|---|---|---|\n'

  for (const mod of modules) {
    if (mod.apiMembers.length === 0) {
      table += `| ${mod.name} | ${mod.category} | — | — |\n`
    } else {
      for (const exp of mod.apiMembers) {
        table += `| ${mod.name} | ${mod.category} | ${exp.name} | \`${exp.signature}\` |\n`
      }
    }
  }

  return table
}
