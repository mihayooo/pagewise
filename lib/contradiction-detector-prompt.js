/**
 * Contradiction Detector — Prompt 构建子模块
 *
 * 从 contradiction-detector.js 拆分，负责:
 *   - 矛盾检测 AI 提示词构建
 *   - 文本截断工具
 *
 * @module lib/contradiction-detector-prompt
 */

/** 默认截断长度 */
const DEFAULT_TRUNCATE = 600

/**
 * 截断文本到指定长度
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateText(text, maxLen) {
  if (!text || text.length <= maxLen) return text || ''
  return text.slice(0, maxLen) + '…'
}

/**
 * 构建矛盾检测的 AI 提示词
 *
 * @param {Object} newEntry - 新的 Q&A 条目
 * @param {Array<Object>} existingEntries - 已有的同主题 Q&A 条目
 * @returns {string} AI 提示词
 */
export function buildContradictionPrompt(newEntry, existingEntries) {
  const newParts = []
  if (newEntry.title) newParts.push(`标题: ${newEntry.title}`)
  if (newEntry.question) newParts.push(`问题: ${newEntry.question}`)
  if (newEntry.answer) newParts.push(`回答: ${truncateText(newEntry.answer, DEFAULT_TRUNCATE)}`)
  if (newEntry.tags && newEntry.tags.length > 0) newParts.push(`标签: ${newEntry.tags.join(', ')}`)
  const newText = newParts.join('\n')

  let existingText = '（无已有知识条目）'
  if (existingEntries && existingEntries.length > 0) {
    existingText = existingEntries.map((entry, idx) => {
      const parts = []
      parts.push(`[ID: ${entry.id || idx + 1}]`)
      if (entry.title) parts.push(`标题: ${entry.title}`)
      if (entry.question) parts.push(`问题: ${entry.question}`)
      if (entry.answer) parts.push(`回答: ${truncateText(entry.answer, DEFAULT_TRUNCATE)}`)
      if (entry.tags && entry.tags.length > 0) parts.push(`标签: ${entry.tags.join(', ')}`)
      return parts.join('\n')
    }).join('\n---\n')
  }

  return `你是一个知识一致性分析专家。请对比以下**新 Q&A 条目**与**已有知识条目**，检测是否存在矛盾或冲突。

## 矛盾类型

- **fact_change**: 事实变更 — 同一技术的特性描述在新旧条目中不一致（如"功能 A 在版本 X 中引入" vs "功能 A 在版本 Y 中引入"）
- **version_conflict**: 版本号冲突 — 关于同一技术的版本号信息不一致
- **outdated**: 信息过时 — 已有条目的信息可能已被新条目取代
- **definitional**: 定义性矛盾 — 同一概念/技术在新旧条目中的定义或描述不一致

## 严重性级别

- **high**: 直接矛盾，可能导致用户做出错误决策
- **medium**: 存在潜在冲突，需要用户关注确认
- **low**: 轻微差异，可能只是信息更新

## 输出要求

请严格以 JSON 格式输出，不要添加其他文字：

\`\`\`json
{
  "contradictions": [
    {
      "existingEntryId": 1,
      "description": "矛盾的详细描述（1-3 句话）",
      "severity": "high",
      "type": "fact_change",
      "conflictingFacts": {
        "new": "新条目中的关键事实陈述",
        "existing": "已有条目中的关键事实陈述"
      }
    }
  ]
}
\`\`\`

如果没有发现矛盾，请返回：
\`\`\`json
{"contradictions": []}
\`\`\`

## 新 Q&A 条目

${newText}

## 已有知识条目

${existingText}`
}
