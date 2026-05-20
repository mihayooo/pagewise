/**
 * 测试 Helper — 流式 Response mock
 *
 * 构造含 `body.getReader()` 的 mock Response 对象，
 * 模拟 ReadableStream 的 chunk 序列，用于测试 SSE 流式解析函数。
 *
 * @module tests/helpers/stream-mock
 */

/**
 * 将字符串 chunk 数组编码为 Uint8Array 数组
 * @param {string[]} chunks
 * @returns {Uint8Array[]}
 */
function encodeChunks(chunks) {
  const encoder = new TextEncoder()
  return chunks.map(chunk => encoder.encode(chunk))
}

/**
 * 创建 mock Response 对象，模拟流式读取
 *
 * @param {string[]} chunks — 模拟 SSE 数据的字符串数组（每个元素为一个 chunk）
 * @returns {Object} mock Response（含 body.getReader()）
 */
export function createMockResponse(chunks) {
  const encoded = encodeChunks(chunks)
  let index = 0

  const reader = {
    async read() {
      if (index < encoded.length) {
        const value = encoded[index]
        index++
        return { done: false, value }
      }
      return { done: true }
    },
    releaseLock() {},
  }

  return {
    body: {
      getReader() {
        return reader
      },
    },
  }
}

/**
 * 创建单个完整 SSE 事件行的 chunk
 *
 * @param {string} eventType — Claude 事件类型 (content_block_delta / error 等)
 * @param {Object} data — 事件数据
 * @returns {string} 格式化的 SSE 行
 */
export function createClaudeEvent(eventType, data) {
  return `data: ${JSON.stringify({ type: eventType, ...data })}\n\n`
}

/**
 * 创建 OpenAI SSE 事件行的 chunk
 *
 * @param {Object} data — OpenAI chunk 数据
 * @returns {string} 格式化的 SSE 行
 */
export function createOpenAIEvent(data) {
  return `data: ${JSON.stringify(data)}\n\n`
}

/**
 * 创建 [DONE] 信号行
 * @returns {string}
 */
export function createDoneSignal() {
  return 'data: [DONE]\n\n'
}
