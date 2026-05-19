/**
 * AI Client — Token 估算子模块
 *
 * 从 ai-client.js 拆分，负责:
 *   - 文本 token 数估算
 *   - 消息数组 token 数估算
 *
 * @module lib/ai-client-tokens
 */

/**
 * 粗略估算文本的 token 数
 * 启发式：字符数 / 3（兼顾英文 ~4字符/token 和中文 ~1.5字符/token）
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0
  return Math.ceil(text.length / 3)
}

/**
 * 估算消息数组的总 token 数（含 role 开销）
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0
  let total = 0
  for (const msg of messages) {
    total += 4
    const content = typeof msg.content === 'string' ? msg.content : ''
    total += estimateTokens(content)
  }
  return total
}
