/**
 * 测试 lib/settings-storage.js — 读写/导入导出/重置/并发安全
 *
 * R250: SettingsManagerSplit
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { createSettingsStorage } = await import('../lib/settings-storage.js')
const { createSettingsRegistry } = await import('../lib/settings-registry.js')
const { createSettingsEvents } = await import('../lib/settings-events.js')

// ==================== 测试辅助 ====================

function createMockStorage() {
  const _store = {}
  return {
    async get(keys) {
      if (typeof keys === 'string') return { [keys]: _store[keys] }
      if (Array.isArray(keys)) {
        const r = {}
        for (const k of keys) r[k] = _store[k]
        return r
      }
      if (keys && typeof keys === 'object') {
        const r = {}
        for (const [k, v] of Object.entries(keys)) {
          r[k] = _store[k] !== undefined ? _store[k] : v
        }
        return r
      }
      return { ..._store }
    },
    async set(obj) { Object.assign(_store, obj) },
    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys]
      for (const k of arr) delete _store[k]
    },
    _raw: _store,
  }
}

function createStore() {
  const storage = createMockStorage()
  const registry = createSettingsRegistry()
  const events = createSettingsEvents()
  const store = createSettingsStorage(storage, registry, events)
  return { storage, registry, events, store }
}

// ==================== 1. 创建 ====================

describe('SettingsStorage — 创建', () => {
  it('createSettingsStorage 返回对象', () => {
    const { store } = createStore()
    assert.ok(store)
    assert.equal(typeof store.get, 'function')
    assert.equal(typeof store.set, 'function')
    assert.equal(typeof store.getAll, 'function')
  })
})

// ==================== 2. 读写 ====================

describe('SettingsStorage — get / set', () => {
  it('get() 返回默认值', async () => {
    const { store } = createStore()
    assert.equal(await store.get('theme'), 'light')
  })

  it('set() 后 get() 返回新值', async () => {
    const { store } = createStore()
    await store.set('theme', 'dark')
    assert.equal(await store.get('theme'), 'dark')
  })

  it('get() 不存在的 key 返回 undefined', async () => {
    const { store } = createStore()
    assert.equal(await store.get('nonExistent'), undefined)
  })

  it('set() 后数据持久化到 storage', async () => {
    const { storage, store } = createStore()
    await store.set('theme', 'dark')
    const raw = await storage.get('pagewise_settings')
    assert.ok(raw.pagewise_settings)
    assert.equal(raw.pagewise_settings.theme, 'dark')
  })

  it('getAll 返回合并默认值', async () => {
    const { store } = createStore()
    const all = await store.getAll()
    assert.ok(Object.keys(all).length >= 18)
    assert.equal(all.theme, 'light')
    assert.equal(all.model, 'gpt-4o')
  })
})

// ==================== 3. 校验集成 ====================

describe('SettingsStorage — 校验集成', () => {
  it('非法值 set() 拒绝写入', async () => {
    const { store } = createStore()
    await assert.rejects(() => store.set('theme', 'blue'), /校验失败/)
    assert.equal(await store.get('theme'), 'light')
  })

  it('合法值 set() 正常写入', async () => {
    const { store } = createStore()
    await store.set('maxTokens', 8192)
    assert.equal(await store.get('maxTokens'), 8192)
  })
})

// ==================== 4. 事件集成 ====================

describe('SettingsStorage — 事件集成', () => {
  it('set() 后触发事件', async () => {
    const { events, store } = createStore()
    let called = false
    events.onSettingChange('theme', () => { called = true })

    await store.set('theme', 'dark')
    assert.ok(called)
  })

  it('值未变化不触发事件', async () => {
    const { events, store } = createStore()
    let count = 0
    events.onSettingChange('theme', () => { count++ })

    await store.set('theme', 'light') // same as default
    assert.equal(count, 0)
  })
})

// ==================== 5. 导入导出 ====================

describe('SettingsStorage — 导入导出', () => {
  it('exportSettings 返回合法 JSON', async () => {
    const { store } = createStore()
    const json = await store.exportSettings()
    const parsed = JSON.parse(json)
    assert.ok(parsed.version)
    assert.ok(parsed.settings)
    assert.ok(parsed.exportedAt)
  })

  it('导出再导入恢复设置', async () => {
    const { store: s1 } = createStore()
    await s1.set('theme', 'dark')
    await s1.set('maxTokens', 8192)
    const json = await s1.exportSettings()

    const storage2 = createMockStorage()
    const registry2 = createSettingsRegistry()
    const events2 = createSettingsEvents()
    const s2 = createSettingsStorage(storage2, registry2, events2)

    await s2.importSettings(json)
    assert.equal(await s2.get('theme'), 'dark')
    assert.equal(await s2.get('maxTokens'), 8192)
  })

  it('apiKey 导出时被清除', async () => {
    const { store } = createStore()
    await store.set('apiKey', 'sk-secret-123')
    const json = await store.exportSettings()
    const parsed = JSON.parse(json)
    assert.ok(!parsed.settings.apiKey || parsed.settings.apiKey === '')
  })

  it('导入非法 JSON 抛出错误', async () => {
    const { store } = createStore()
    await assert.rejects(() => store.importSettings('not json'), /JSON|格式/)
  })

  it('导入缺少 settings 字段抛出错误', async () => {
    const { store } = createStore()
    await assert.rejects(() => store.importSettings('{"version":1}'), /settings/)
  })

  it('导入后触发事件', async () => {
    const { events, store } = createStore()
    const changed = []
    events.onSettingChange('theme', (k) => changed.push(k))

    const json = JSON.stringify({ version: 1, settings: { theme: 'dark' }, exportedAt: Date.now() })
    await store.importSettings(json)
    assert.ok(changed.includes('theme'))
  })
})

// ==================== 6. 重置 ====================

describe('SettingsStorage — 重置', () => {
  it('resetToDefaults 恢复全部默认', async () => {
    const { store } = createStore()
    await store.set('theme', 'dark')
    await store.set('maxTokens', 8192)

    await store.resetToDefaults()
    assert.equal(await store.get('theme'), 'light')
    assert.equal(await store.get('maxTokens'), 4096)
  })

  it('resetToDefaults(scope) 只重置指定分类', async () => {
    const { store } = createStore()
    await store.set('theme', 'dark')
    await store.set('model', 'deepseek-chat')

    await store.resetToDefaults('appearance')
    assert.equal(await store.get('theme'), 'light')
    assert.equal(await store.get('model'), 'deepseek-chat')
  })

  it('重置后触发变更事件', async () => {
    const { events, store } = createStore()
    await store.set('theme', 'dark')

    const changed = []
    events.onSettingChange('theme', (k) => changed.push(k))
    await store.resetToDefaults()
    assert.ok(changed.includes('theme'))
  })
})

// ==================== 7. 并发安全 ====================

describe('SettingsStorage — 并发安全', () => {
  it('并发 set 不丢失数据', async () => {
    const { store } = createStore()
    await Promise.all([
      store.set('theme', 'dark'),
      store.set('model', 'claude-3'),
      store.set('language', 'en-US'),
    ])
    assert.equal(await store.get('theme'), 'dark')
    assert.equal(await store.get('model'), 'claude-3')
    assert.equal(await store.get('language'), 'en-US')
  })
})
