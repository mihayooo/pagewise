/**
 * 测试 lib/settings-events.js — 变更事件/订阅/取消订阅
 *
 * R250: SettingsManagerSplit
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { createSettingsEvents } = await import('../lib/settings-events.js')

// ==================== 1. 基础创建 ====================

describe('SettingsEvents — 创建', () => {
  it('createSettingsEvents 返回对象', () => {
    const events = createSettingsEvents()
    assert.ok(events)
    assert.equal(typeof events.onSettingChange, 'function')
    assert.equal(typeof events.emit, 'function')
  })
})

// ==================== 2. 订阅与触发 ====================

describe('SettingsEvents — 订阅与触发', () => {
  it('注册回调后 emit 触发', () => {
    const events = createSettingsEvents()
    let calledKey = null
    let calledValue = null

    events.onSettingChange('theme', (key, value) => {
      calledKey = key
      calledValue = value
    })

    events.emit('theme', 'dark')
    assert.equal(calledKey, 'theme')
    assert.equal(calledValue, 'dark')
  })

  it('多个回调同时注册均被触发', () => {
    const events = createSettingsEvents()
    const calls = []

    events.onSettingChange('theme', () => calls.push('cb1'))
    events.onSettingChange('theme', () => calls.push('cb2'))

    events.emit('theme', 'dark')
    assert.deepEqual(calls, ['cb1', 'cb2'])
  })

  it('不同 key 的回调互不干扰', () => {
    const events = createSettingsEvents()
    let themeCalled = false
    let modelCalled = false

    events.onSettingChange('theme', () => { themeCalled = true })
    events.onSettingChange('model', () => { modelCalled = true })

    events.emit('theme', 'dark')
    assert.ok(themeCalled)
    assert.ok(!modelCalled)
  })

  it('未注册的 key emit 不抛异常', () => {
    const events = createSettingsEvents()
    assert.doesNotThrow(() => events.emit('unknownKey', 'value'))
  })
})

// ==================== 3. 取消订阅 ====================

describe('SettingsEvents — 取消订阅', () => {
  it('取消订阅后不再触发', () => {
    const events = createSettingsEvents()
    let count = 0
    const unsub = events.onSettingChange('theme', () => { count++ })

    events.emit('theme', 'dark')
    assert.equal(count, 1)

    unsub()
    events.emit('theme', 'light')
    assert.equal(count, 1, '取消后不应再触发')
  })

  it('取消订阅不影响其他回调', () => {
    const events = createSettingsEvents()
    const calls = []
    const unsub = events.onSettingChange('theme', () => calls.push('cb1'))
    events.onSettingChange('theme', () => calls.push('cb2'))

    unsub()
    events.emit('theme', 'dark')
    assert.deepEqual(calls, ['cb2'])
  })
})

// ==================== 4. 容错 ====================

describe('SettingsEvents — 容错', () => {
  it('回调抛出错误不影响其他回调', () => {
    const events = createSettingsEvents()
    const calls = []

    events.onSettingChange('theme', () => { throw new Error('boom') })
    events.onSettingChange('theme', () => calls.push('cb2'))

    events.emit('theme', 'dark')
    assert.deepEqual(calls, ['cb2'])
  })
})
