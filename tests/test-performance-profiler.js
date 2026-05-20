/**
 * Tests for lib/performance-profiler.js — R183 探索性改进
 *
 * 覆盖:
 *   PerformanceProfiler 构造与配置
 *   measure() / start() / end() 计时
 *   stats() 统计报告
 *   getReport() 完整报告
 *   mark() / getMarks() 标记点
 *   wrap() 函数包装
 *   Memory tracking (snapshot)
 *   Hierarchical profiling (parent-child)
 *   Singleton getInstance()
 *   reset() / clear()
 *   Edge cases
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  PerformanceProfiler,
  getProfiler,
  measureSync,
  measureAsync,
} from '../lib/performance-profiler.js'

describe('PerformanceProfiler', () => {
  let profiler

  beforeEach(() => {
    profiler = new PerformanceProfiler()
  })

  // ==================== 构造与配置 ====================

  describe('constructor', () => {
    it('默认配置', () => {
      const p = new PerformanceProfiler()
      assert.equal(p.enabled, true)
      assert.equal(p.maxSamples, 1000)
    })

    it('自定义配置', () => {
      const p = new PerformanceProfiler({ enabled: false, maxSamples: 100 })
      assert.equal(p.enabled, false)
      assert.equal(p.maxSamples, 100)
    })

    it('maxSamples 为 0 时禁用采样', () => {
      const p = new PerformanceProfiler({ maxSamples: 0 })
      assert.equal(p.maxSamples, 0)
    })
  })

  // ==================== measure() 同步测量 ====================

  describe('measure()', () => {
    it('同步函数测量', () => {
      const result = profiler.measure('test', () => 42)
      assert.equal(result, 42)
      const stats = profiler.stats('test')
      assert.equal(stats.count, 1)
      assert.ok(stats.totalMs >= 0)
      assert.ok(stats.avgMs >= 0)
      assert.ok(stats.minMs >= 0)
      assert.ok(stats.maxMs >= 0)
    })

    it('多次测量', () => {
      for (let i = 0; i < 5; i++) {
        profiler.measure('loop', () => i * 2)
      }
      const stats = profiler.stats('loop')
      assert.equal(stats.count, 5)
      assert.ok(stats.avgMs >= 0)
      assert.ok(stats.minMs <= stats.maxMs)
    })

    it('异常不阻止统计', () => {
      assert.throws(() => {
        profiler.measure('fail', () => { throw new Error('boom') })
      }, /boom/)
      // 异常后仍然记录了时间
      const stats = profiler.stats('fail')
      assert.equal(stats.count, 1)
    })

    it('disabled 时直接执行不记录', () => {
      const p = new PerformanceProfiler({ enabled: false })
      const result = p.measure('noop', () => 99)
      assert.equal(result, 99)
      const stats = p.stats('noop')
      assert.equal(stats.count, 0)
    })

    it('多个操作独立统计', () => {
      profiler.measure('op-a', () => 1)
      profiler.measure('op-b', () => 2)
      profiler.measure('op-a', () => 3)

      const statsA = profiler.stats('op-a')
      const statsB = profiler.stats('op-b')
      assert.equal(statsA.count, 2)
      assert.equal(statsB.count, 1)
    })
  })

  // ==================== measureAsync() 异步测量 ====================

  describe('measureAsync', () => {
    it('异步函数测量', async () => {
      const result = await profiler.measureAsync('async-op', async () => {
        return 42
      })
      assert.equal(result, 42)
      const stats = profiler.stats('async-op')
      assert.equal(stats.count, 1)
      assert.ok(stats.totalMs >= 0)
    })

    it('异步异常不阻止统计', async () => {
      await assert.rejects(
        () => profiler.measureAsync('async-fail', async () => {
          throw new Error('async boom')
        }),
        /async boom/
      )
      const stats = profiler.stats('async-fail')
      assert.equal(stats.count, 1)
    })

    it('disabled 时直接执行不记录', async () => {
      const p = new PerformanceProfiler({ enabled: false })
      const result = await p.measureAsync('noop', async () => 77)
      assert.equal(result, 77)
      assert.equal(p.stats('noop').count, 0)
    })
  })

  // ==================== start() / end() 手动计时 ====================

  describe('start/end', () => {
    it('手动计时', () => {
      profiler.start('manual')
      // 模拟一些工作
      let sum = 0
      for (let i = 0; i < 1000; i++) sum += i
      const elapsed = profiler.end('manual')
      assert.ok(typeof elapsed === 'number')
      assert.ok(elapsed >= 0)
      assert.equal(profiler.stats('manual').count, 1)
    })

    it('end 返回耗时毫秒', () => {
      const elapsed = profiler.end(profiler.start('timing'))
      // start returns the label, end returns elapsed time
      assert.ok(typeof elapsed === 'number')
    })

    it('end 对未 start 的操作返回 0', () => {
      const elapsed = profiler.end('nonexistent')
      assert.equal(elapsed, 0)
    })

    it('start 返回标签名', () => {
      const label = profiler.start('my-op')
      assert.equal(label, 'my-op')
    })
  })

  // ==================== stats() 统计报告 ====================

  describe('stats()', () => {
    it('不存在的操作返回零值', () => {
      const stats = profiler.stats('nonexistent')
      assert.equal(stats.count, 0)
      assert.equal(stats.totalMs, 0)
      assert.equal(stats.avgMs, 0)
      assert.equal(stats.minMs, Infinity)
      assert.equal(stats.maxMs, -Infinity)
      assert.equal(stats.p50, 0)
      assert.equal(stats.p95, 0)
      assert.equal(stats.p99, 0)
    })

    it('单次采样统计', () => {
      profiler.measure('single', () => 1)
      const stats = profiler.stats('single')
      assert.equal(stats.count, 1)
      assert.ok(stats.avgMs >= 0)
      assert.equal(stats.minMs, stats.maxMs)
      assert.ok(stats.p50 >= 0)
    })

    it('多次采样百分位', () => {
      // 产生足够多的样本以测试百分位
      for (let i = 0; i < 100; i++) {
        profiler.measure('multi', () => {
          // 不同耗时
          let s = 0
          for (let j = 0; j < i * 10; j++) s += j
          return s
        })
      }
      const stats = profiler.stats('multi')
      assert.equal(stats.count, 100)
      assert.ok(stats.minMs <= stats.p50)
      assert.ok(stats.p50 <= stats.p95)
      assert.ok(stats.p95 <= stats.p99)
      assert.ok(stats.p99 <= stats.maxMs)
    })

    it('返回值是副本（不可变）', () => {
      profiler.measure('immutable', () => 1)
      const s1 = profiler.stats('immutable')
      const s2 = profiler.stats('immutable')
      assert.deepEqual(s1, s2)
      s1.count = 999
      assert.equal(profiler.stats('immutable').count, 1)
    })
  })

  // ==================== getReport() 完整报告 ====================

  describe('getReport()', () => {
    it('空 profiler 报告', () => {
      const report = profiler.getReport()
      assert.ok(Array.isArray(report.operations))
      assert.equal(report.operations.length, 0)
      assert.ok(typeof report.totalTimeMs === 'number')
      assert.ok(typeof report.operationCount === 'number')
      assert.equal(report.operationCount, 0)
    })

    it('包含所有操作', () => {
      profiler.measure('op-1', () => 1)
      profiler.measure('op-2', () => 2)
      profiler.measure('op-1', () => 3)

      const report = profiler.getReport()
      assert.equal(report.operations.length, 2)
      assert.equal(report.operationCount, 2)
      assert.ok(report.totalTimeMs >= 0)
    })

    it('操作按总耗时降序排列', () => {
      // op-slow 测量多次，总时间更长
      for (let i = 0; i < 10; i++) profiler.measure('slow', () => {
        let s = 0; for (let j = 0; j < 1000; j++) s += j; return s
      })
      profiler.measure('fast', () => 1)

      const report = profiler.getReport()
      // slow 应排在前面
      const names = report.operations.map(o => o.name)
      const slowIdx = names.indexOf('slow')
      const fastIdx = names.indexOf('fast')
      assert.ok(slowIdx < fastIdx)
    })

    it('操作对象包含完整字段', () => {
      profiler.measure('full', () => 1)
      const report = profiler.getReport()
      const op = report.operations[0]
      assert.equal(op.name, 'full')
      assert.equal(op.count, 1)
      assert.ok(typeof op.totalMs === 'number')
      assert.ok(typeof op.avgMs === 'number')
      assert.ok(typeof op.minMs === 'number')
      assert.ok(typeof op.maxMs === 'number')
      assert.ok(typeof op.p50 === 'number')
      assert.ok(typeof op.p95 === 'number')
      assert.ok(typeof op.p99 === 'number')
    })
  })

  // ==================== mark() 标记点 ====================

  describe('mark()', () => {
    it('记录标记点', () => {
      profiler.mark('start')
      profiler.mark('middle')
      profiler.mark('end')

      const marks = profiler.getMarks()
      assert.equal(marks.length, 3)
      assert.equal(marks[0].label, 'start')
      assert.equal(marks[1].label, 'middle')
      assert.equal(marks[2].label, 'end')
    })

    it('标记点有时间戳', () => {
      const before = Date.now()
      profiler.mark('ts')
      const after = Date.now()

      const marks = profiler.getMarks()
      assert.ok(marks[0].timestamp >= before)
      assert.ok(marks[0].timestamp <= after)
    })

    it('标记点可附带元数据', () => {
      profiler.mark('meta', { key: 'value' })
      const marks = profiler.getMarks()
      assert.deepEqual(marks[0].data, { key: 'value' })
    })

    it('disabled 时不记录标记', () => {
      const p = new PerformanceProfiler({ enabled: false })
      p.mark('noop')
      assert.equal(p.getMarks().length, 0)
    })

    it('getMarks 返回副本', () => {
      profiler.mark('a')
      const marks = profiler.getMarks()
      marks.push({ label: 'fake', timestamp: 0 })
      assert.equal(profiler.getMarks().length, 1)
    })
  })

  // ==================== wrap() 函数包装 ====================

  describe('wrap()', () => {
    it('包装同步函数', () => {
      const add = (a, b) => a + b
      const wrapped = profiler.wrap('add', add)
      const result = wrapped(2, 3)
      assert.equal(result, 5)
      assert.equal(profiler.stats('add').count, 1)
    })

    it('包装异步函数', async () => {
      const asyncAdd = async (a, b) => a + b
      const wrapped = profiler.wrap('async-add', asyncAdd)
      const result = await wrapped(2, 3)
      assert.equal(result, 5)
      assert.equal(profiler.stats('async-add').count, 1)
    })

    it('包装函数保留 this 上下文', () => {
      const obj = {
        value: 10,
        getValue() { return this.value }
      }
      obj.getValue = profiler.wrap('ctx', obj.getValue.bind(obj))
      assert.equal(obj.getValue(), 10)
    })

    it('包装函数传递参数正确', () => {
      const fn = (...args) => args.reduce((a, b) => a + b, 0)
      const wrapped = profiler.wrap('args', fn)
      assert.equal(wrapped(1, 2, 3, 4), 10)
    })

    it('disabled 时不包装（直接透传）', () => {
      const p = new PerformanceProfiler({ enabled: false })
      const fn = () => 42
      const wrapped = p.wrap('noop', fn)
      assert.equal(wrapped(), 42)
      assert.equal(p.stats('noop').count, 0)
    })
  })

  // ==================== Memory snapshot ====================

  describe('memory snapshot', () => {
    it('snapshot 返回对象或 null', () => {
      const snapshot = profiler.snapshot('mem')
      // Node.js 中 process.memoryUsage 可用
      if (snapshot) {
        assert.ok(typeof snapshot.heapUsed === 'number')
        assert.ok(typeof snapshot.heapTotal === 'number')
        assert.ok(typeof snapshot.timestamp === 'number')
        assert.equal(snapshot.label, 'mem')
      }
    })

    it('getSnapshots 返回数组', () => {
      profiler.snapshot('s1')
      profiler.snapshot('s2')
      const snapshots = profiler.getSnapshots()
      assert.ok(Array.isArray(snapshots))
      assert.ok(snapshots.length <= 2)
    })

    it('disabled 时不记录快照', () => {
      const p = new PerformanceProfiler({ enabled: false })
      p.snapshot('noop')
      assert.equal(p.getSnapshots().length, 0)
    })
  })

  // ==================== Hierarchical profiling ====================

  describe('hierarchical profiling', () => {
    it('嵌套操作记录父子关系', () => {
      profiler.start('parent')
      profiler.start('child')
      profiler.end('child')
      profiler.end('parent')

      const report = profiler.getReport()
      const parent = report.operations.find(o => o.name === 'parent')
      const child = report.operations.find(o => o.name === 'child')
      assert.ok(parent)
      assert.ok(child)
      assert.ok(parent.totalMs >= child.totalMs)
    })
  })

  // ==================== reset() / clear() ====================

  describe('reset/clear', () => {
    it('reset 清除所有数据', () => {
      profiler.measure('op', () => 1)
      profiler.mark('mark')
      profiler.snapshot('snap')

      profiler.reset()

      assert.equal(profiler.stats('op').count, 0)
      assert.equal(profiler.getMarks().length, 0)
      assert.equal(profiler.getSnapshots().length, 0)
      assert.equal(profiler.getReport().operations.length, 0)
    })

    it('clear 清除单个操作数据', () => {
      profiler.measure('a', () => 1)
      profiler.measure('b', () => 2)

      profiler.clear('a')

      assert.equal(profiler.stats('a').count, 0)
      assert.equal(profiler.stats('b').count, 1)
    })

    it('clear 不存在的操作不报错', () => {
      assert.doesNotThrow(() => profiler.clear('nonexistent'))
    })
  })

  // ==================== maxSamples 限制 ====================

  describe('maxSamples limit', () => {
    it('超过 maxSamples 后保持 FIFO 淘汰', () => {
      const p = new PerformanceProfiler({ maxSamples: 5 })
      for (let i = 0; i < 10; i++) {
        p.measure('limited', () => i)
      }
      const stats = p.stats('limited')
      assert.equal(stats.count, 5)
    })

    it('maxSamples=1 只保留最新', () => {
      const p = new PerformanceProfiler({ maxSamples: 1 })
      p.measure('one', () => 1)
      p.measure('one', () => 2)
      assert.equal(p.stats('one').count, 1)
    })
  })

  // ==================== 边界情况 ====================

  describe('edge cases', () => {
    it('空操作名', () => {
      profiler.measure('', () => 1)
      assert.equal(profiler.stats('').count, 1)
    })

    it('特殊字符操作名', () => {
      profiler.measure('a.b/c', () => 1)
      assert.equal(profiler.stats('a.b/c').count, 1)
    })

    it('Unicode 操作名', () => {
      profiler.measure('搜索操作', () => 1)
      assert.equal(profiler.stats('搜索操作').count, 1)
    })

    it('null 函数不报错', () => {
      // wrap with null should return a function that returns undefined
      const wrapped = profiler.wrap('null-fn', null)
      assert.equal(wrapped(), undefined)
    })

    it('并发 start/end 不混淆', () => {
      profiler.start('a')
      profiler.start('b')
      const elapsedB = profiler.end('b')
      const elapsedA = profiler.end('a')
      assert.ok(typeof elapsedA === 'number')
      assert.ok(typeof elapsedB === 'number')
      // A 的时间应 >= B 的时间
      assert.ok(elapsedA >= elapsedB)
    })
  })

  // ==================== getProfiler 单例 ====================

  describe('getProfiler singleton', () => {
    it('返回 PerformanceProfiler 实例', () => {
      const p = getProfiler()
      assert.ok(p instanceof PerformanceProfiler)
    })

    it('多次调用返回同一实例', () => {
      const p1 = getProfiler()
      const p2 = getProfiler()
      assert.equal(p1, p2)
    })
  })

  // ==================== measureSync / measureAsync 便捷函数 ====================

  describe('measureSync / measureAsync 全局函数', () => {
    it('measureSync 使用全局 profiler', () => {
      const result = measureSync('global-sync', () => 42)
      assert.equal(result, 42)
      const p = getProfiler()
      assert.ok(p.stats('global-sync').count >= 1)
    })

    it('measureAsync 使用全局 profiler', async () => {
      const result = await measureAsync('global-async', async () => 99)
      assert.equal(result, 99)
      const p = getProfiler()
      assert.ok(p.stats('global-async').count >= 1)
    })

    it('measureSync 传入自定义 profiler', () => {
      const custom = new PerformanceProfiler()
      const result = measureSync('custom', () => 77, custom)
      assert.equal(result, 77)
      assert.equal(custom.stats('custom').count, 1)
      // 全局 profiler 无此操作
      assert.equal(getProfiler().stats('custom').count, 0)
    })

    it('measureAsync 传入自定义 profiler', async () => {
      const custom = new PerformanceProfiler()
      const result = await measureAsync('custom-async', async () => 55, custom)
      assert.equal(result, 55)
      assert.equal(custom.stats('custom-async').count, 1)
    })
  })

  // ==================== 百分位计算精确性 ====================

  describe('percentile accuracy', () => {
    it('p50 近似中位数', () => {
      // 产生 100 个样本，p50 应接近中位数位置
      const p = new PerformanceProfiler({ maxSamples: 100 })
      for (let i = 0; i < 100; i++) {
        p.measure('pct', () => {
          // 强制不同耗时
          let s = 0
          for (let j = 0; j < i * 50; j++) s += Math.sqrt(j)
          return s
        })
      }
      const stats = p.stats('pct')
      assert.ok(stats.p50 >= stats.minMs)
      assert.ok(stats.p50 <= stats.maxMs)
      assert.ok(stats.p95 >= stats.p50)
    })

    it('零样本百分位为 0', () => {
      const stats = profiler.stats('empty')
      assert.equal(stats.p50, 0)
      assert.equal(stats.p95, 0)
      assert.equal(stats.p99, 0)
    })
  })

  // ==================== enabled 切换 ====================

  describe('enabled toggle', () => {
    it('运行时切换 enabled', () => {
      profiler.measure('before', () => 1)
      profiler.enabled = false
      profiler.measure('during', () => 2)
      profiler.enabled = true
      profiler.measure('after', () => 3)

      assert.equal(profiler.stats('before').count, 1)
      assert.equal(profiler.stats('during').count, 0)
      assert.equal(profiler.stats('after').count, 1)
    })
  })

  // ==================== 结果完整性 ====================

  describe('result integrity', () => {
    it('measure 返回函数的原始返回值', () => {
      const obj = { complex: 'object' }
      const result = profiler.measure('obj', () => obj)
      assert.equal(result, obj)
    })

    it('measureAsync 返回 Promise 解析值', async () => {
      const arr = [1, 2, 3]
      const result = await profiler.measureAsync('arr', async () => arr)
      assert.equal(result, arr)
    })
  })
})
