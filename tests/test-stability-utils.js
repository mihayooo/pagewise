/**
 * Tests for lib/stability-utils.js — R183 稳定性提升
 *
 * 覆盖:
 *   safeArray / safeString / safeNumber / ensureArray (类型安全)
 *   safeGet / safeCall (安全访问)
 *   clamp / safeParseInt / safeParseFloat / safeDivide (数值工具)
 *   withTimeout / retryAsync / safeAsync (异步工具)
 *   debounce / throttle / generateId / deepClone (通用工具)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  safeArray,
  safeString,
  safeNumber,
  ensureArray,
  safeGet,
  safeCall,
  clamp,
  safeParseInt,
  safeParseFloat,
  safeDivide,
  withTimeout,
  retryAsync,
  safeAsync,
  debounce,
  throttle,
  generateId,
  deepClone,
} from '../lib/stability-utils.js'

// ==================== 类型安全 ====================

describe('safeArray', () => {
  it('数组透传', () => {
    const arr = [1, 2, 3]
    assert.deepEqual(safeArray(arr), [1, 2, 3])
  })

  it('空数组透传', () => {
    assert.deepEqual(safeArray([]), [])
  })

  it('null 返回空数组', () => {
    assert.deepEqual(safeArray(null), [])
  })

  it('undefined 返回空数组', () => {
    assert.deepEqual(safeArray(undefined), [])
  })

  it('字符串返回空数组', () => {
    assert.deepEqual(safeArray('hello'), [])
  })

  it('数字返回空数组', () => {
    assert.deepEqual(safeArray(42), [])
  })

  it('对象返回空数组', () => {
    assert.deepEqual(safeArray({ a: 1 }), [])
  })

  it('函数返回空数组', () => {
    assert.deepEqual(safeArray(() => {}), [])
  })

  it('类数组对象（arguments）返回空数组', () => {
    // 类数组对象不是真正的数组
    assert.deepEqual(safeArray({ 0: 'a', length: 1 }), [])
  })

  it('返回原数组引用（高性能）', () => {
    const arr = [1, 2, 3]
    const result = safeArray(arr)
    assert.equal(result, arr) // 同一引用，不做不必要的拷贝
  })
})

describe('safeString', () => {
  it('字符串透传', () => {
    assert.equal(safeString('hello'), 'hello')
  })

  it('空字符串透传', () => {
    assert.equal(safeString(''), '')
  })

  it('null 返回空字符串', () => {
    assert.equal(safeString(null), '')
  })

  it('undefined 返回空字符串', () => {
    assert.equal(safeString(undefined), '')
  })

  it('数字转字符串', () => {
    assert.equal(safeString(42), '42')
  })

  it('布尔值转字符串', () => {
    assert.equal(safeString(true), 'true')
  })

  it('对象返回空字符串', () => {
    assert.equal(safeString({ a: 1 }), '')
  })

  it('数组返回空字符串', () => {
    assert.equal(safeString([1, 2]), '')
  })
})

describe('safeNumber', () => {
  it('正数透传', () => {
    assert.equal(safeNumber(42), 42)
  })

  it('零透传', () => {
    assert.equal(safeNumber(0), 0)
  })

  it('负数透传', () => {
    assert.equal(safeNumber(-5), -5)
  })

  it('浮点数透传', () => {
    assert.equal(safeNumber(3.14), 3.14)
  })

  it('null 返回默认值 0', () => {
    assert.equal(safeNumber(null), 0)
  })

  it('undefined 返回默认值 0', () => {
    assert.equal(safeNumber(undefined), 0)
  })

  it('null 返回自定义默认值', () => {
    assert.equal(safeNumber(null, 100), 100)
  })

  it('NaN 返回默认值', () => {
    assert.equal(safeNumber(NaN), 0)
  })

  it('NaN 返回自定义默认值', () => {
    assert.equal(safeNumber(NaN, -1), -1)
  })

  it('Infinity 返回默认值', () => {
    assert.equal(safeNumber(Infinity), 0)
  })

  it('字符串数字返回默认值', () => {
    assert.equal(safeNumber('42'), 0) // 不做隐式转换
  })

  it('字符串返回默认值', () => {
    assert.equal(safeNumber('hello'), 0)
  })
})

describe('ensureArray', () => {
  it('数组透传', () => {
    assert.deepEqual(ensureArray([1, 2]), [1, 2])
  })

  it('单值包装为数组', () => {
    assert.deepEqual(ensureArray('hello'), ['hello'])
  })

  it('null 返回空数组', () => {
    assert.deepEqual(ensureArray(null), [])
  })

  it('undefined 返回空数组', () => {
    assert.deepEqual(ensureArray(undefined), [])
  })

  it('数字包装为数组', () => {
    assert.deepEqual(ensureArray(42), [42])
  })

  it('对象包装为数组', () => {
    const obj = { a: 1 }
    assert.deepEqual(ensureArray(obj), [{ a: 1 }])
  })

  it('空数组透传', () => {
    assert.deepEqual(ensureArray([]), [])
  })
})

// ==================== 安全访问 ====================

describe('safeGet', () => {
  const obj = { a: { b: { c: 42 } }, x: null, y: [1, 2, 3] }

  it('简单属性访问', () => {
    assert.equal(safeGet(obj, 'x'), null)
  })

  it('深度属性访问', () => {
    assert.equal(safeGet(obj, 'a.b.c'), 42)
  })

  it('不存在的路径返回 undefined', () => {
    assert.equal(safeGet(obj, 'a.b.d'), undefined)
  })

  it('不存在的路径返回自定义默认值', () => {
    assert.equal(safeGet(obj, 'a.b.d', 'not found'), 'not found')
  })

  it('null 对象返回默认值', () => {
    assert.equal(safeGet(null, 'a.b', 'default'), 'default')
  })

  it('undefined 对象返回默认值', () => {
    assert.equal(safeGet(undefined, 'a.b'), undefined)
  })

  it('空路径返回对象自身', () => {
    assert.equal(safeGet(obj, ''), obj)
  })

  it('数组索引访问', () => {
    assert.equal(safeGet(obj, 'y.1'), 2)
  })

  it('数组越界返回 undefined', () => {
    assert.equal(safeGet(obj, 'y.99'), undefined)
  })

  it('中间节点为 null 时返回默认值', () => {
    assert.equal(safeGet(obj, 'x.z', 'fallback'), 'fallback')
  })

  it('路径为 null 返回默认值', () => {
    assert.equal(safeGet(obj, null, 'default'), 'default')
  })

  it('路径为 undefined 返回默认值', () => {
    assert.equal(safeGet(obj, undefined, 'default'), 'default')
  })

  it('数字路径返回默认值', () => {
    assert.equal(safeGet(obj, 123, 'default'), 'default')
  })
})

describe('safeCall', () => {
  it('正常函数调用', () => {
    const add = (a, b) => a + b
    assert.equal(safeCall(add, 0, 3, 4), 7)
  })

  it('null 函数返回默认值', () => {
    assert.equal(safeCall(null, 'fallback'), 'fallback')
  })

  it('undefined 函数返回默认值', () => {
    assert.equal(safeCall(undefined, 0), 0)
  })

  it('非函数返回默认值', () => {
    assert.equal(safeCall('not a function', false), false)
  })

  it('函数抛异常返回默认值', () => {
    const fn = () => { throw new Error('boom') }
    assert.equal(safeCall(fn, 'safe'), 'safe')
  })

  it('无参数调用', () => {
    const fn = () => 42
    assert.equal(safeCall(fn, 0), 42)
  })

  it('默认值为 undefined 时省略', () => {
    const fn = () => { throw new Error('err') }
    assert.equal(safeCall(fn), undefined)
  })
})

// ==================== 数值工具 ====================

describe('clamp', () => {
  it('值在范围内', () => {
    assert.equal(clamp(5, 0, 10), 5)
  })

  it('值低于最小值', () => {
    assert.equal(clamp(-5, 0, 10), 0)
  })

  it('值高于最大值', () => {
    assert.equal(clamp(15, 0, 10), 10)
  })

  it('值等于最小值', () => {
    assert.equal(clamp(0, 0, 10), 0)
  })

  it('值等于最大值', () => {
    assert.equal(clamp(10, 0, 10), 10)
  })

  it('负数范围', () => {
    assert.equal(clamp(0, -10, -1), -1)
  })

  it('浮点数', () => {
    assert.equal(clamp(3.7, 0, 5), 3.7)
  })

  it('null 输入返回 min', () => {
    assert.equal(clamp(null, 0, 10), 0)
  })

  it('NaN 输入返回 min', () => {
    assert.equal(clamp(NaN, 0, 10), 0)
  })

  it('min > max 时交换', () => {
    assert.equal(clamp(5, 10, 0), 5) // 5 在 [0, 10] 范围内
  })
})

describe('safeParseInt', () => {
  it('正常整数字符串', () => {
    assert.equal(safeParseInt('42'), 42)
  })

  it('浮点字符串截断', () => {
    assert.equal(safeParseInt('3.14'), 3)
  })

  it('带前缀非十进制字符串返回默认值', () => {
    // safeParseInt 始终使用 10 进制解析，不支持自定义 radix
    assert.equal(safeParseInt('0xFF'), 0)
  })

  it('非数字字符串返回默认值', () => {
    assert.equal(safeParseInt('hello'), 0)
  })

  it('空字符串返回默认值', () => {
    assert.equal(safeParseInt(''), 0)
  })

  it('null 返回默认值', () => {
    assert.equal(safeParseInt(null, -1), -1)
  })

  it('undefined 返回默认值', () => {
    assert.equal(safeParseInt(undefined), 0)
  })

  it('数字直接返回', () => {
    assert.equal(safeParseInt(42), 42)
  })

  it('浮点数截断', () => {
    assert.equal(safeParseInt(3.99), 3)
  })

  it('NaN 返回默认值', () => {
    assert.equal(safeParseInt(NaN), 0)
  })

  it('Infinity 返回默认值', () => {
    assert.equal(safeParseInt(Infinity, 999), 999)
  })
})

describe('safeParseFloat', () => {
  it('正常浮点字符串', () => {
    assert.equal(safeParseFloat('3.14'), 3.14)
  })

  it('整数字符串', () => {
    assert.equal(safeParseFloat('42'), 42)
  })

  it('非数字字符串返回默认值', () => {
    assert.equal(safeParseFloat('hello'), 0)
  })

  it('空字符串返回默认值', () => {
    assert.equal(safeParseFloat(''), 0)
  })

  it('null 返回默认值', () => {
    assert.equal(safeParseFloat(null, -1.0), -1.0)
  })

  it('undefined 返回默认值', () => {
    assert.equal(safeParseFloat(undefined), 0)
  })

  it('数字直接返回', () => {
    assert.equal(safeParseFloat(3.14), 3.14)
  })

  it('NaN 返回默认值', () => {
    assert.equal(safeParseFloat(NaN, 1.0), 1.0)
  })
})

describe('safeDivide', () => {
  it('正常除法', () => {
    assert.equal(safeDivide(10, 2), 5)
  })

  it('除以零返回默认值', () => {
    assert.equal(safeDivide(10, 0), 0)
  })

  it('除以零返回自定义默认值', () => {
    assert.equal(safeDivide(10, 0, Infinity), Infinity)
  })

  it('零除以非零', () => {
    assert.equal(safeDivide(0, 5), 0)
  })

  it('浮点除法', () => {
    assert.equal(safeDivide(1, 3), 1 / 3)
  })

  it('负数除法', () => {
    assert.equal(safeDivide(-10, 2), -5)
  })

  it('null 分子返回默认值', () => {
    assert.equal(safeDivide(null, 5, -1), -1)
  })

  it('null 分母返回默认值', () => {
    assert.equal(safeDivide(10, null, -1), -1)
  })

  it('NaN 分子返回默认值', () => {
    assert.equal(safeDivide(NaN, 5, -1), -1)
  })

  it('NaN 分母返回默认值', () => {
    assert.equal(safeDivide(10, NaN, -1), -1)
  })
})

// ==================== 异步工具 ====================

describe('withTimeout', () => {
  it('Promise 在超时前完成', async () => {
    const result = await withTimeout(
      Promise.resolve('ok'),
      1000
    )
    assert.equal(result, 'ok')
  })

  it('Promise 超时抛出错误', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('slow'), 80))
    await assert.rejects(
      () => withTimeout(slow, 50),
      (err) => {
        assert.ok(err.message.includes('超时'))
        return true
      }
    )
  })

  it('自定义超时消息', async () => {
    const slow = new Promise(() => {}) // never resolves
    await assert.rejects(
      () => withTimeout(slow, 50, '自定义超时'),
      (err) => {
        assert.ok(err.message.includes('自定义超时'))
        return true
      }
    )
  })

  it('Promise 拒绝透传', async () => {
    await assert.rejects(
      () => withTimeout(Promise.reject(new Error('原错误')), 1000),
      { message: '原错误' }
    )
  })
})

describe('retryAsync', () => {
  it('首次成功不重试', async () => {
    let calls = 0
    const fn = async () => { calls++; return 'ok' }
    const result = await retryAsync(fn, 3, 10)
    assert.equal(result, 'ok')
    assert.equal(calls, 1)
  })

  it('失败后重试成功', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      if (calls < 3) throw new Error('not yet')
      return 'ok'
    }
    const result = await retryAsync(fn, 3, 10)
    assert.equal(result, 'ok')
    assert.equal(calls, 3)
  })

  it('全部重试失败后抛出最后一次错误', async () => {
    let calls = 0
    const fn = async () => { calls++; throw new Error(`fail-${calls}`) }
    await assert.rejects(
      () => retryAsync(fn, 2, 10),
      (err) => {
        assert.equal(err.message, 'fail-3') // 初始 1 + 重试 2
        return true
      }
    )
    assert.equal(calls, 3)
  })

  it('重试次数为 0 直接执行一次', async () => {
    let calls = 0
    const fn = async () => { calls++; throw new Error('fail') }
    await assert.rejects(() => retryAsync(fn, 0, 10))
    assert.equal(calls, 1)
  })
})

describe('safeAsync', () => {
  it('成功时返回结果', async () => {
    const fn = async () => 'ok'
    const result = await safeAsync(fn, 'fallback')
    assert.equal(result, 'ok')
  })

  it('失败时返回默认值', async () => {
    const fn = async () => { throw new Error('boom') }
    const result = await safeAsync(fn, 'fallback')
    assert.equal(result, 'fallback')
  })

  it('无默认值时返回 undefined', async () => {
    const fn = async () => { throw new Error('boom') }
    const result = await safeAsync(fn)
    assert.equal(result, undefined)
  })

  it('非函数返回默认值', async () => {
    const result = await safeAsync('not a function', 'fallback')
    assert.equal(result, 'fallback')
  })

  it('null 函数返回默认值', async () => {
    const result = await safeAsync(null, 'fallback')
    assert.equal(result, 'fallback')
  })
})

// ==================== 通用工具 ====================

describe('debounce', () => {
  it('延迟执行', async () => {
    let called = false
    const fn = debounce(() => { called = true }, 40)
    fn()
    assert.equal(called, false) // 立即未调用
    await new Promise(r => setTimeout(r, 50))
    assert.equal(called, true) // 延迟后调用
  })

  it('多次调用只执行最后一次', async () => {
    let count = 0
    const fn = debounce(() => { count++ }, 40)
    fn()
    fn()
    fn()
    await new Promise(r => setTimeout(r, 50))
    assert.equal(count, 1)
  })

  it('返回函数', () => {
    const fn = debounce(() => {}, 100)
    assert.equal(typeof fn, 'function')
  })
})

describe('throttle', () => {
  it('首次立即执行', () => {
    let called = false
    const fn = throttle(() => { called = true }, 100)
    fn()
    assert.equal(called, true)
  })

  it('节流期内不重复执行', async () => {
    let count = 0
    const fn = throttle(() => { count++ }, 200)
    fn()
    fn()
    fn()
    assert.equal(count, 1)
  })

  it('返回函数', () => {
    const fn = throttle(() => {}, 100)
    assert.equal(typeof fn, 'function')
  })
})

describe('generateId', () => {
  it('返回字符串', () => {
    const id = generateId()
    assert.equal(typeof id, 'string')
  })

  it('非空', () => {
    const id = generateId()
    assert.ok(id.length > 0)
  })

  it('带前缀', () => {
    const id = generateId('test')
    assert.ok(id.startsWith('test-'))
  })

  it('唯一性（多次生成不同）', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add(generateId())
    }
    assert.ok(ids.size > 90, '大部分 ID 应唯一')
  })

  it('默认前缀', () => {
    const id = generateId()
    assert.ok(id.startsWith('id-'))
  })
})

describe('deepClone', () => {
  it('简单对象', () => {
    const obj = { a: 1, b: 'hello' }
    const cloned = deepClone(obj)
    assert.deepEqual(cloned, obj)
    assert.notEqual(cloned, obj)
  })

  it('嵌套对象', () => {
    const obj = { a: { b: { c: 42 } } }
    const cloned = deepClone(obj)
    assert.deepEqual(cloned, obj)
    assert.notEqual(cloned.a, obj.a)
  })

  it('数组', () => {
    const arr = [1, [2, 3], { a: 4 }]
    const cloned = deepClone(arr)
    assert.deepEqual(cloned, arr)
    assert.notEqual(cloned, arr)
  })

  it('null 返回 null', () => {
    assert.equal(deepClone(null), null)
  })

  it('undefined 返回 undefined', () => {
    assert.equal(deepClone(undefined), undefined)
  })

  it('原始值透传', () => {
    assert.equal(deepClone(42), 42)
    assert.equal(deepClone('hello'), 'hello')
    assert.equal(deepClone(true), true)
  })

  it('日期对象', () => {
    const date = new Date('2026-01-01')
    const cloned = deepClone(date)
    assert.equal(cloned.getTime(), date.getTime())
  })

  it('修改克隆不影响原对象', () => {
    const obj = { a: { b: 1 } }
    const cloned = deepClone(obj)
    cloned.a.b = 2
    assert.equal(obj.a.b, 1)
  })
})
