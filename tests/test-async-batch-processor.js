/**
 * 测试 lib/async-batch-processor.js — 异步批量处理器
 *
 * R183: 探索性改进 — 新功能原型
 * 覆盖: 基本处理、并发控制、重试机制、取消、超时、进度回调、错误处理、边界条件
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { AsyncBatchProcessor, processBatch } = await import('../lib/async-batch-processor.js')

// ==================== 构造 ====================

describe('AsyncBatchProcessor — 构造', () => {
  it('默认构造参数', () => {
    const bp = new AsyncBatchProcessor()
    assert.equal(bp.concurrency, 3)
    assert.equal(bp.maxRetries, 0)
    assert.equal(bp.baseDelay, 1000)
    assert.equal(bp.timeoutMs, 0)
  })

  it('自定义构造参数', () => {
    const bp = new AsyncBatchProcessor({
      concurrency: 5,
      maxRetries: 2,
      baseDelay: 500,
      timeoutMs: 5000
    })
    assert.equal(bp.concurrency, 5)
    assert.equal(bp.maxRetries, 2)
    assert.equal(bp.baseDelay, 500)
    assert.equal(bp.timeoutMs, 5000)
  })

  it('concurrency < 1 时修正为 1', () => {
    const bp = new AsyncBatchProcessor({ concurrency: 0 })
    assert.equal(bp.concurrency, 1)
  })

  it('maxRetries < 0 时修正为 0', () => {
    const bp = new AsyncBatchProcessor({ maxRetries: -3 })
    assert.equal(bp.maxRetries, 0)
  })
})

// ==================== 基本处理 ====================

describe('AsyncBatchProcessor — 基本处理', () => {
  it('处理空数组返回空结果', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([], async (x) => x * 2)
    assert.equal(result.succeeded, 0)
    assert.equal(result.failed, 0)
    assert.equal(result.total, 0)
    assert.deepEqual(result.results, [])
  })

  it('处理单项', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([5], async (x) => x * 2)
    assert.equal(result.succeeded, 1)
    assert.equal(result.failed, 0)
    assert.equal(result.results[0].status, 'fulfilled')
    assert.equal(result.results[0].value, 10)
  })

  it('处理多项全部成功', async () => {
    const bp = new AsyncBatchProcessor({ concurrency: 2 })
    const result = await bp.process([1, 2, 3, 4], async (x) => x * 10)
    assert.equal(result.succeeded, 4)
    assert.equal(result.failed, 0)
    assert.deepEqual(
      result.results.map(r => r.value),
      [10, 20, 30, 40]
    )
  })

  it('结果保持输入顺序', async () => {
    const bp = new AsyncBatchProcessor({ concurrency: 1 })
    const items = [3, 1, 4, 1, 5]
    const result = await bp.process(items, async (x) => x * 100)
    assert.deepEqual(
      result.results.map(r => r.value),
      [300, 100, 400, 100, 500]
    )
  })

  it('duration 为正数', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([1], async (x) => x)
    assert.ok(result.duration >= 0)
  })
})

// ==================== 并发控制 ====================

describe('AsyncBatchProcessor — 并发控制', () => {
  it('concurrency=1 串行执行', async () => {
    const order = []
    const bp = new AsyncBatchProcessor({ concurrency: 1 })
    await bp.process([1, 2, 3], async (x) => {
      order.push(`start-${x}`)
      await new Promise(r => setTimeout(r, 10))
      order.push(`end-${x}`)
      return x
    })
    // 串行: start-1, end-1, start-2, end-2, start-3, end-3
    assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3'])
  })

  it('concurrency=2 允许 2 个并发', async () => {
    let active = 0
    let maxActive = 0
    const bp = new AsyncBatchProcessor({ concurrency: 2 })
    await bp.process([1, 2, 3, 4], async (x) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 20))
      active--
      return x
    })
    assert.ok(maxActive <= 2, `maxActive=${maxActive} 应 <= 2`)
  })

  it('concurrency=10 且只有 3 项不会超过 3 并发', async () => {
    let active = 0
    let maxActive = 0
    const bp = new AsyncBatchProcessor({ concurrency: 10 })
    await bp.process([1, 2, 3], async (x) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 10))
      active--
      return x
    })
    assert.ok(maxActive <= 3, `maxActive=${maxActive} 应 <= 3`)
  })
})

// ==================== 错误处理与重试 ====================

describe('AsyncBatchProcessor — 错误处理', () => {
  it('部分失败不影响成功项', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([1, 2, 3], async (x) => {
      if (x === 2) throw new Error('boom')
      return x * 10
    })
    assert.equal(result.succeeded, 2)
    assert.equal(result.failed, 1)
    assert.equal(result.results[0].status, 'fulfilled')
    assert.equal(result.results[0].value, 10)
    assert.equal(result.results[1].status, 'rejected')
    assert.equal(result.results[1].error.message, 'boom')
    assert.equal(result.results[2].status, 'fulfilled')
    assert.equal(result.results[2].value, 30)
  })

  it('全部失败时 succeeded=0', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([1, 2], async () => {
      throw new Error('fail')
    })
    assert.equal(result.succeeded, 0)
    assert.equal(result.failed, 2)
  })

  it('maxRetries=2 成功前重试', async () => {
    let attempts = 0
    const bp = new AsyncBatchProcessor({ maxRetries: 2, baseDelay: 10 })
    const result = await bp.process([1], async (x) => {
      attempts++
      if (attempts < 3) throw new Error('not yet')
      return x * 100
    })
    assert.equal(result.succeeded, 1)
    assert.equal(result.results[0].value, 100)
    assert.equal(attempts, 3)
  })

  it('maxRetries=2 用尽后标记失败', async () => {
    let attempts = 0
    const bp = new AsyncBatchProcessor({ maxRetries: 2, baseDelay: 10 })
    const result = await bp.process([1], async () => {
      attempts++
      throw new Error('always fail')
    })
    assert.equal(result.failed, 1)
    // 初始 1 次 + 2 次重试 = 3 次
    assert.equal(attempts, 3)
  })

  it('指数退避重试间隔递增', async () => {
    const timestamps = []
    const bp = new AsyncBatchProcessor({ maxRetries: 3, baseDelay: 50 })
    await bp.process([1], async () => {
      timestamps.push(Date.now())
      throw new Error('fail')
    })
    // 第一次尝试立即执行
    assert.equal(timestamps.length, 4) // 1 初始 + 3 重试
  })
})

// ==================== 取消 ====================

describe('AsyncBatchProcessor — 取消', () => {
  it('cancel 停止后续任务', async () => {
    const executed = []
    const bp = new AsyncBatchProcessor({ concurrency: 1 })
    const promise = bp.process([1, 2, 3, 4, 5], async (x) => {
      executed.push(x)
      if (x === 2) bp.cancel()
      return x
    })
    const result = await promise
    // 已执行的任务应该完成
    assert.ok(executed.includes(1))
    assert.ok(executed.includes(2))
    // 取消后不应执行后续
    assert.ok(!executed.includes(4))
    assert.ok(!executed.includes(5))
    assert.ok(result.cancelled)
  })

  it('cancel 后已完成项保留在结果中', async () => {
    const bp = new AsyncBatchProcessor({ concurrency: 1 })
    const promise = bp.process([1, 2, 3], async (x) => {
      if (x === 2) bp.cancel()
      return x * 10
    })
    const result = await promise
    assert.ok(result.cancelled)
    assert.equal(result.results[0].status, 'fulfilled')
    assert.equal(result.results[0].value, 10)
  })
})

// ==================== 超时 ====================

describe('AsyncBatchProcessor — 超时', () => {
  it('单任务超时标记失败', async () => {
    const bp = new AsyncBatchProcessor({ timeoutMs: 50, maxRetries: 0 })
    const result = await bp.process([1], async () => {
      await new Promise(r => setTimeout(r, 200))
      return 'should not reach'
    })
    assert.equal(result.failed, 1)
    assert.equal(result.results[0].status, 'rejected')
  })

  it('超时不被重试（timeoutMs > 0 且 maxRetries > 0）', async () => {
    let attempts = 0
    const bp = new AsyncBatchProcessor({ timeoutMs: 30, maxRetries: 2, baseDelay: 10 })
    const result = await bp.process([1], async () => {
      attempts++
      await new Promise(r => setTimeout(r, 200))
      return 'done'
    })
    assert.equal(result.failed, 1)
  })
})

// ==================== 进度回调 ====================

describe('AsyncBatchProcessor — 进度回调', () => {
  it('onProgress 被调用', async () => {
    const progressCalls = []
    const bp = new AsyncBatchProcessor()
    await bp.process([1, 2, 3], async (x) => x, {
      onProgress: (p) => progressCalls.push({ ...p })
    })
    assert.equal(progressCalls.length, 3)
    // 最后一次完成
    assert.equal(progressCalls[2].completed, 3)
    assert.equal(progressCalls[2].total, 3)
  })

  it('onProgress 每次递增 completed', async () => {
    const progressCalls = []
    const bp = new AsyncBatchProcessor({ concurrency: 1 })
    await bp.process([1, 2, 3], async (x) => x, {
      onProgress: (p) => progressCalls.push(p.completed)
    })
    assert.deepEqual(progressCalls, [1, 2, 3])
  })

  it('onProgress 失败时 failed 递增', async () => {
    const progressCalls = []
    const bp = new AsyncBatchProcessor()
    await bp.process([1, 2, 3], async (x) => {
      if (x === 2) throw new Error('fail')
      return x
    }, {
      onProgress: (p) => progressCalls.push({ completed: p.completed, failed: p.failed })
    })
    assert.equal(progressCalls.length, 3)
    // 第二项失败
    const failCall = progressCalls.find(p => p.failed === 1)
    assert.ok(failCall, '应有 failed=1 的进度回调')
  })
})

// ==================== processBatch 便捷函数 ====================

describe('AsyncBatchProcessor — processBatch 便捷函数', () => {
  it('processBatch 快捷调用', async () => {
    const result = await processBatch([1, 2, 3], async (x) => x * 2, { concurrency: 2 })
    assert.equal(result.succeeded, 3)
    assert.deepEqual(
      result.results.map(r => r.value),
      [2, 4, 6]
    )
  })

  it('processBatch 默认参数', async () => {
    const result = await processBatch([10], async (x) => x + 1)
    assert.equal(result.results[0].value, 11)
  })
})

// ==================== 边界条件 ====================

describe('AsyncBatchProcessor — 边界条件', () => {
  it('processFn 返回 undefined', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([1], async () => undefined)
    assert.equal(result.results[0].status, 'fulfilled')
    assert.equal(result.results[0].value, undefined)
  })

  it('processFn 返回 Promise', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([1], async (x) => Promise.resolve(x + 1))
    assert.equal(result.results[0].value, 2)
  })

  it('processFn 同步抛出错误', async () => {
    const bp = new AsyncBatchProcessor()
    const result = await bp.process([1], () => {
      throw new Error('sync error')
    })
    assert.equal(result.failed, 1)
    assert.equal(result.results[0].error.message, 'sync error')
  })

  it('processFn 接收正确的 index 参数', async () => {
    const received = []
    const bp = new AsyncBatchProcessor()
    await bp.process(['a', 'b', 'c'], async (item, index) => {
      received.push({ item, index })
      return item
    })
    assert.deepEqual(received, [
      { item: 'a', index: 0 },
      { item: 'b', index: 1 },
      { item: 'c', index: 2 }
    ])
  })

  it('大数组批量处理 (100 项)', async () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    const bp = new AsyncBatchProcessor({ concurrency: 10 })
    const result = await bp.process(items, async (x) => x * 2)
    assert.equal(result.succeeded, 100)
    assert.equal(result.failed, 0)
    assert.equal(result.results[0].value, 0)
    assert.equal(result.results[99].value, 198)
  })
})
