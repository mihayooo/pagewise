/**
 * 测试 lib/ring-buffer.js — 定长环形缓冲区
 *
 * R183: 探索性改进 — Ring Buffer FIFO 优化
 * 覆盖: 构造/push/toArray/长度/清空/边界/容量溢出
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { RingBuffer } = await import('../lib/ring-buffer.js')

// ==================== 构造 ====================

describe('RingBuffer — 构造', () => {
  it('默认构造创建空缓冲区', () => {
    const buf = new RingBuffer(10)
    assert.equal(buf.length, 0)
  })

  it('容量为 1 时正确工作', () => {
    const buf = new RingBuffer(1)
    assert.equal(buf.capacity, 1)
    assert.equal(buf.length, 0)
  })

  it('容量为 0 时创建无效但不抛异常', () => {
    const buf = new RingBuffer(0)
    assert.equal(buf.capacity, 0)
    assert.equal(buf.length, 0)
  })

  it('负容量等同于 0', () => {
    const buf = new RingBuffer(-5)
    assert.equal(buf.capacity, 0)
  })
})

// ==================== push 基本操作 ====================

describe('RingBuffer — push 基本', () => {
  it('push 增加 length', () => {
    const buf = new RingBuffer(5)
    buf.push('a')
    assert.equal(buf.length, 1)
    buf.push('b')
    assert.equal(buf.length, 2)
  })

  it('push 到满后 length 等于 capacity', () => {
    const buf = new RingBuffer(3)
    buf.push(1)
    buf.push(2)
    buf.push(3)
    assert.equal(buf.length, 3)
  })

  it('push 超过 capacity 后 length 保持为 capacity', () => {
    const buf = new RingBuffer(3)
    for (let i = 0; i < 10; i++) buf.push(i)
    assert.equal(buf.length, 3)
  })
})

// ==================== toArray FIFO 顺序 ====================

describe('RingBuffer — toArray FIFO 顺序', () => {
  it('未溢出时按插入顺序', () => {
    const buf = new RingBuffer(5)
    buf.push('a')
    buf.push('b')
    buf.push('c')
    assert.deepEqual(buf.toArray(), ['a', 'b', 'c'])
  })

  it('溢出后保留最新 capacity 个元素', () => {
    const buf = new RingBuffer(3)
    buf.push(1)
    buf.push(2)
    buf.push(3)
    buf.push(4)
    assert.deepEqual(buf.toArray(), [2, 3, 4])
  })

  it('多次溢出后 FIFO 正确', () => {
    const buf = new RingBuffer(3)
    for (let i = 1; i <= 7; i++) buf.push(i)
    assert.deepEqual(buf.toArray(), [5, 6, 7])
  })

  it('空缓冲区 toArray 返回空数组', () => {
    const buf = new RingBuffer(5)
    assert.deepEqual(buf.toArray(), [])
  })

  it('单元素 toArray', () => {
    const buf = new RingBuffer(3)
    buf.push('only')
    assert.deepEqual(buf.toArray(), ['only'])
  })

  it('容量为 1 时 push 两次保留最新', () => {
    const buf = new RingBuffer(1)
    buf.push('old')
    buf.push('new')
    assert.deepEqual(buf.toArray(), ['new'])
  })
})

// ==================== clear ====================

describe('RingBuffer — clear', () => {
  it('clear 重置 length 为 0', () => {
    const buf = new RingBuffer(5)
    buf.push(1)
    buf.push(2)
    buf.clear()
    assert.equal(buf.length, 0)
  })

  it('clear 后 toArray 返回空数组', () => {
    const buf = new RingBuffer(5)
    buf.push(1)
    buf.clear()
    assert.deepEqual(buf.toArray(), [])
  })

  it('clear 后可继续 push', () => {
    const buf = new RingBuffer(3)
    for (let i = 0; i < 5; i++) buf.push(i)
    buf.clear()
    buf.push('a')
    assert.deepEqual(buf.toArray(), ['a'])
  })
})

// ==================== 容量边界 ====================

describe('RingBuffer — 容量边界', () => {
  it('大容量正确工作', () => {
    const buf = new RingBuffer(1000)
    for (let i = 0; i < 1000; i++) buf.push(i)
    assert.equal(buf.length, 1000)
    const arr = buf.toArray()
    assert.equal(arr[0], 0)
    assert.equal(arr[999], 999)
  })

  it('大容量溢出后正确淘汰', () => {
    const buf = new RingBuffer(100)
    for (let i = 0; i < 500; i++) buf.push(i)
    assert.equal(buf.length, 100)
    const arr = buf.toArray()
    assert.equal(arr[0], 400)
    assert.equal(arr[99], 499)
  })

  it('push + clear + push 循环正确', () => {
    const buf = new RingBuffer(3)
    buf.push(1); buf.push(2); buf.push(3); buf.push(4)
    assert.deepEqual(buf.toArray(), [2, 3, 4])
    buf.clear()
    buf.push('x'); buf.push('y'); buf.push('z'); buf.push('w')
    assert.deepEqual(buf.toArray(), ['y', 'z', 'w'])
  })

  it('不同类型元素混合存储', () => {
    const buf = new RingBuffer(5)
    buf.push(1)
    buf.push('hello')
    buf.push(null)
    buf.push(undefined)
    buf.push({ key: 'val' })
    const arr = buf.toArray()
    assert.equal(arr.length, 5)
    assert.equal(arr[0], 1)
    assert.equal(arr[1], 'hello')
    assert.equal(arr[2], null)
    assert.equal(arr[3], undefined)
    assert.deepEqual(arr[4], { key: 'val' })
  })
})

// ==================== capacity 属性 ====================

describe('RingBuffer — capacity 属性', () => {
  it('capacity 只读返回构造容量', () => {
    const buf = new RingBuffer(42)
    assert.equal(buf.capacity, 42)
  })
})
