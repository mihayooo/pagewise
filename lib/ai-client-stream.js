/**
 * AI Client — 流式解析子模块
 *
 * 从 ai-client.js 拆分，负责:
 *   - Claude SSE 流式解析
 *   - OpenAI SSE 流式解析
 *
 * @module lib/ai-client-stream
 */

import { classifyAIError } from './error-handler.js'

/**
 * 解析 Claude SSE 流
 * @param {Response} response
 * @yields {string} 文本片段
 */
export async function* parseClaudeStream(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let _chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    _chunkCount++
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta') {
          yield parsed.delta.text
        } else if (parsed.type === 'error') {
          const streamError = new Error(parsed.error?.message || 'Stream error')
          streamError.classified = classifyAIError(streamError)
          throw streamError
        }
      } catch (e) {
        if (e.message !== 'Stream error') {
          // skip non-JSON line
        } else {
          throw e
        }
      }
    }
  }
}

/**
 * 解析 OpenAI SSE 流
 * @param {Response} response
 * @yields {string} 文本片段
 */
export async function* parseOpenAIStream(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let _chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    _chunkCount++
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch (_e) {
        console.warn('[AI-Client-Stream] stream read failed', _e?.message)
      }
    }
  }
}
