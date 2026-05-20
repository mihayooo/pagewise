/**
 * 测试 lib/ai-client-stream.js — 流式解析子模块
 *
 * 直接从子模块导入 parseClaudeStream / parseOpenAIStream。
 * 使用 mock Response 对象模拟 SSE 流，纯 Node.js 环境可运行。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseClaudeStream, parseOpenAIStream } from '../lib/ai-client-stream.js'
import {
  createMockResponse,
  createClaudeEvent,
  createOpenAIEvent,
  createDoneSignal,
} from './helpers/stream-mock.js'

/**
 * 辅助: 将异步生成器收集为数组
 */
async function collectChunks(generator) {
  const results = []
  for await (const chunk of generator) {
    results.push(chunk)
  }
  return results
}

// ==================== parseClaudeStream ====================

describe('parseClaudeStream() — 正常事件', () => {
  it('单个 content_block_delta 事件 yield 文本', async () => {
    const response = createMockResponse([
      createClaudeEvent('content_block_delta', { delta: { text: 'Hello' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['Hello'])
  })

  it('多个 delta 事件依次 yield', async () => {
    const response = createMockResponse([
      createClaudeEvent('content_block_delta', { delta: { text: 'Hello ' } }),
      createClaudeEvent('content_block_delta', { delta: { text: 'world' } }),
      createClaudeEvent('content_block_delta', { delta: { text: '!' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['Hello ', 'world', '!'])
  })

  it('[DONE] 信号终止生成器', async () => {
    const response = createMockResponse([
      createClaudeEvent('content_block_delta', { delta: { text: 'A' } }),
      createDoneSignal(),
      createClaudeEvent('content_block_delta', { delta: { text: 'B' } }),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['A'])
  })
})

describe('parseClaudeStream() — 非 delta 事件', () => {
  it('content_block_start 事件被忽略', async () => {
    const response = createMockResponse([
      createClaudeEvent('content_block_start', { index: 0 }),
      createClaudeEvent('content_block_delta', { delta: { text: 'OK' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['OK'])
  })

  it('message_start 事件被忽略', async () => {
    const response = createMockResponse([
      createClaudeEvent('message_start', { message: {} }),
      createClaudeEvent('content_block_delta', { delta: { text: 'data' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['data'])
  })

  it('message_stop 事件被忽略（不冲突 [DONE]）', async () => {
    const response = createMockResponse([
      createClaudeEvent('content_block_delta', { delta: { text: 'X' } }),
      createClaudeEvent('message_stop', {}),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['X'])
  })
})

describe('parseClaudeStream() — 错误事件', () => {
  it('error 事件中 error.message 缺失时使用 fallback "Stream error" 并抛出', async () => {
    // 当 error.message 缺失时，fallback 为 'Stream error'，
    // catch 块中 e.message === 'Stream error' 条件不满足 !==，于是 throw
    const response = createMockResponse([
      createClaudeEvent('error', { error: {} }),
    ])
    await assert.rejects(
      () => collectChunks(parseClaudeStream(response)),
      (err) => {
        assert.equal(err.message, 'Stream error')
        assert.ok(err.classified)
        return true
      }
    )
  })

  it('error 事件有自定义 message 时被 catch 块静默跳过（源码行为）', async () => {
    // 源码 catch 块: if (e.message !== 'Stream error') { /* skip */ }
    // 有自定义 message 的 streamError 会被当作非 JSON 跳过
    const response = createMockResponse([
      createClaudeEvent('error', { error: { message: 'Rate limited' } }),
      createClaudeEvent('content_block_delta', { delta: { text: 'still works' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    // error 事件被静默跳过，后续 delta 正常 yield
    assert.deepEqual(chunks, ['still works'])
  })
})

describe('parseClaudeStream() — 边界情况', () => {
  it('空流（零 chunk）不抛异常，返回空数组', async () => {
    const response = createMockResponse([])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, [])
  })

  it('非 JSON 行静默跳过', async () => {
    const response = createMockResponse([
      'data: this is not json\n\n',
      createClaudeEvent('content_block_delta', { delta: { text: 'OK' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['OK'])
  })

  it('无 data: 前缀的行被忽略', async () => {
    const response = createMockResponse([
      'event: content_block_delta\n',
      'id: 1\n',
      createClaudeEvent('content_block_delta', { delta: { text: 'real' } }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['real'])
  })

  it('buffer 跨 chunk 拼接正确', async () => {
    // 拆分一个 SSE 行到两个 chunk
    const event = createClaudeEvent('content_block_delta', { delta: { text: 'split' } })
    const mid = Math.floor(event.length / 2)
    const chunk1 = event.slice(0, mid)
    const chunk2 = event.slice(mid)

    const response = createMockResponse([
      chunk1,
      chunk2,
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['split'])
  })

  it('单个 chunk 包含多行时正确解析', async () => {
    const multiLine =
      createClaudeEvent('content_block_delta', { delta: { text: 'A' } }) +
      createClaudeEvent('content_block_delta', { delta: { text: 'B' } }) +
      createDoneSignal()

    const response = createMockResponse([multiLine])
    const chunks = await collectChunks(parseClaudeStream(response))
    assert.deepEqual(chunks, ['A', 'B'])
  })
})

// ==================== parseOpenAIStream ====================

describe('parseOpenAIStream() — 正常事件', () => {
  it('单个 choices[0].delta.content 事件 yield 文本', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: [{ delta: { content: 'Hello' } }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['Hello'])
  })

  it('多个 delta 事件依次 yield', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: [{ delta: { content: 'Hel' } }] }),
      createOpenAIEvent({ choices: [{ delta: { content: 'lo ' } }] }),
      createOpenAIEvent({ choices: [{ delta: { content: 'world' } }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['Hel', 'lo ', 'world'])
  })

  it('[DONE] 信号终止生成器', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: [{ delta: { content: 'A' } }] }),
      createDoneSignal(),
      createOpenAIEvent({ choices: [{ delta: { content: 'B' } }] }),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['A'])
  })
})

describe('parseOpenAIStream() — 非 content 事件', () => {
  it('delta.content 为 undefined 时不 yield', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: [{ delta: { role: 'assistant' } }] }),
      createOpenAIEvent({ choices: [{ delta: { content: 'OK' } }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['OK'])
  })

  it('choices 为空数组时不 yield 不抛异常', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: [] }),
      createOpenAIEvent({ choices: [{ delta: { content: 'after' } }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['after'])
  })

  it('choices[0] 不存在时不 yield 不抛异常', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: null }),
      createOpenAIEvent({ choices: [{ delta: { content: 'ok' } }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['ok'])
  })
})

describe('parseOpenAIStream() — 边界情况', () => {
  it('空流（零 chunk）不抛异常，返回空数组', async () => {
    const response = createMockResponse([])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, [])
  })

  it('非 JSON 行静默跳过', async () => {
    const response = createMockResponse([
      'data: not valid json\n\n',
      createOpenAIEvent({ choices: [{ delta: { content: 'OK' } }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['OK'])
  })

  it('buffer 跨 chunk 拼接正确', async () => {
    const event = createOpenAIEvent({ choices: [{ delta: { content: 'split' } }] })
    const mid = Math.floor(event.length / 2)
    const chunk1 = event.slice(0, mid)
    const chunk2 = event.slice(mid)

    const response = createMockResponse([chunk1, chunk2, createDoneSignal()])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['split'])
  })

  it('单个 chunk 包含多行时正确解析', async () => {
    const multiLine =
      createOpenAIEvent({ choices: [{ delta: { content: 'X' } }] }) +
      createOpenAIEvent({ choices: [{ delta: { content: 'Y' } }] }) +
      createDoneSignal()

    const response = createMockResponse([multiLine])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['X', 'Y'])
  })

  it('finish_reason 事件不 yield content', async () => {
    const response = createMockResponse([
      createOpenAIEvent({ choices: [{ delta: { content: 'data' } }] }),
      createOpenAIEvent({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      createDoneSignal(),
    ])
    const chunks = await collectChunks(parseOpenAIStream(response))
    assert.deepEqual(chunks, ['data'])
  })
})
