/**
 * AsyncBatchProcessor — 通用异步批量处理器
 *
 * R183: 探索性改进 — 新功能原型
 *
 * 为项目提供统一的异步批量处理基础设施:
 *   - 并发池控制 (concurrency)
 *   - 指数退避重试 (maxRetries + baseDelay)
 *   - 进度回调 (onProgress)
 *   - 取消支持 (cancel)
 *   - 超时控制 (timeoutMs)
 *   - 优雅降级: 部分失败不阻塞成功项
 *
 * 设计约束:
 *   - 纯 ES Module，零外部依赖，不依赖 DOM / Chrome API
 *   - 结果保持输入顺序（即使并发乱序完成）
 *   - 无状态: 每次 process() 独立运行
 *
 * @module lib/async-batch-processor
 *
 * @example
 *   const bp = new AsyncBatchProcessor({ concurrency: 5, maxRetries: 2 })
 *   const result = await bp.process(bookmarks, checkLink)
 *   console.log(`成功 ${result.succeeded}, 失败 ${result.failed}`)
 *
 * @example
 *   // 便捷函数
 *   import { processBatch } from './async-batch-processor.js'
 *   const result = await processBatch(items, handler, { concurrency: 3 })
 */

export class AsyncBatchProcessor {
  /**
   * @param {Object}   [options]
   * @param {number}   [options.concurrency=3]   — 最大并发数
   * @param {number}   [options.maxRetries=0]    — 最大重试次数
   * @param {number}   [options.baseDelay=1000]  — 重试基础延迟 (ms)，实际延迟 = baseDelay * 2^attempt
   * @param {number}   [options.timeoutMs=0]     — 单任务超时 (ms)，0 表示不限
   */
  constructor(options = {}) {
    /** @type {number} */
    this.concurrency = Math.max(1, options.concurrency ?? 3)
    /** @type {number} */
    this.maxRetries = Math.max(0, options.maxRetries ?? 0)
    /** @type {number} */
    this.baseDelay = options.baseDelay ?? 1000
    /** @type {number} */
    this.timeoutMs = options.timeoutMs ?? 0

    /** @type {boolean} */
    this._cancelled = false
  }

  /**
   * 批量处理数组
   *
   * @template T, R
   * @param {T[]}    items     — 待处理数组
   * @param {function(T, number): Promise<R>} processFn — 处理函数 (item, index) → Promise<R>
   * @param {Object} [options]
   * @param {function({completed: number, total: number, succeeded: number, failed: number}): void} [options.onProgress]
   * @returns {Promise<{results: Array<{status: string, value?: R, error?: Error}>, succeeded: number, failed: number, total: number, duration: number, cancelled: boolean}>}
   */
  async process(items, processFn, options = {}) {
    const { onProgress } = options
    const total = items.length
    const t0 = Date.now()

    // 空数组快速返回
    if (total === 0) {
      return {
        results: [],
        succeeded: 0,
        failed: 0,
        total: 0,
        duration: 0,
        cancelled: false
      }
    }

    // 重置取消状态
    this._cancelled = false

    // 预分配结果数组
    const results = new Array(total)
    for (let i = 0; i < total; i++) {
      results[i] = { status: 'pending' }
    }

    // 统计计数器
    let completed = 0
    let succeeded = 0
    let failed = 0

    // 任务索引队列（待执行的索引）
    let nextIndex = 0
    let active = 0

    /**
     * 执行单个任务（含重试和超时）
     * @param {number} index — items 数组索引
     */
    const executeOne = async (index) => {
      const item = items[index]
      let lastError = null

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        // 取消检查
        if (this._cancelled) {
          results[index] = { status: 'skipped' }
          completed++
          failed++
          if (onProgress) {
            onProgress({ completed, total, succeeded, failed })
          }
          return
        }

        try {
          let value
          if (this.timeoutMs > 0) {
            // 带超时的执行
            value = await this._withTimeout(
              () => processFn(item, index),
              this.timeoutMs
            )
          } else {
            value = await processFn(item, index)
          }

          // 成功
          results[index] = { status: 'fulfilled', value }
          completed++
          succeeded++
          if (onProgress) {
            onProgress({ completed, total, succeeded, failed })
          }
          return
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))

          // 超时错误不重试
          if (lastError.name === 'TimeoutError') {
            break
          }

          // 非最后一次尝试，等待退避
          if (attempt < this.maxRetries) {
            const delay = this.baseDelay * Math.pow(2, attempt)
            await this._sleep(delay)
          }
        }
      }

      // 所有重试用尽
      results[index] = { status: 'rejected', error: lastError }
      completed++
      failed++
      if (onProgress) {
        onProgress({ completed, total, succeeded, failed })
      }
    }

    /**
     * 调度器: 循环填充并发池
     */
    const schedule = () => {
      return new Promise((resolve) => {
        const tryFinish = () => {
          if (completed >= total) {
            resolve()
            return
          }
          // 填充并发池
          while (active < this.concurrency && nextIndex < total && !this._cancelled) {
            const idx = nextIndex++
            active++
            executeOne(idx).then(() => {
              active--
              tryFinish()
            })
          }
          // 取消时快速结束
          if (this._cancelled) {
            // 标记剩余项为 skipped
            for (let i = nextIndex; i < total; i++) {
              if (results[i].status === 'pending') {
                results[i] = { status: 'skipped' }
                completed++
                failed++
              }
            }
            resolve()
          }
        }
        tryFinish()
      })
    }

    await schedule()

    return {
      results,
      succeeded,
      failed,
      total,
      duration: Date.now() - t0,
      cancelled: this._cancelled
    }
  }

  /**
   * 取消正在执行的批量任务
   * 已开始的任务会执行完毕，未开始的任务标记为 skipped
   */
  cancel() {
    this._cancelled = true
  }

  /**
   * 带超时执行异步函数
   * @param {Function} fn — 异步函数
   * @param {number} ms — 超时毫秒
   * @returns {Promise<*>}
   * @private
   */
  _withTimeout(fn, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(`Task timed out after ${ms}ms`)
        err.name = 'TimeoutError'
        reject(err)
      }, ms)

      fn().then(
        (val) => { clearTimeout(timer); resolve(val) },
        (err) => { clearTimeout(timer); reject(err) }
      )
    })
  }

  /**
   * 延迟
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 便捷函数: 处理批量异步任务
 *
 * @template T, R
 * @param {T[]}    items     — 待处理数组
 * @param {function(T, number): Promise<R>} processFn — 处理函数
 * @param {Object} [options] — AsyncBatchProcessor 配置 + onProgress
 * @returns {Promise<{results: Array, succeeded: number, failed: number, total: number, duration: number, cancelled: boolean}>}
 */
export function processBatch(items, processFn, options = {}) {
  const { onProgress, ...processorOptions } = options
  const bp = new AsyncBatchProcessor(processorOptions)
  return bp.process(items, processFn, { onProgress })
}
