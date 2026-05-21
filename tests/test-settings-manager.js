/**
 * 测试 lib/settings-manager.js — 统一设置管理器
 *
 * R248: UnifiedSettingsPanel
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  createSettingsManager,
  SETTING_CATEGORIES,
  SETTING_TYPES,
} = await import('../lib/settings-manager.js')

// ==================== 测试辅助 ====================

/**
 * 创建内存 storage mock（兼容 chrome.storage 接口）
 */
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
    async set(obj) {
      Object.assign(_store, obj)
    },
    async remove(keys) {
      const arr = Array.isArray(keys) ? keys : [keys]
      for (const k of arr) delete _store[k]
    },
    _raw: _store,
  }
}

// ==================== 1. 基础创建与默认值 ====================

describe('SettingsManager — 创建与默认值', () => {
  it('创建实例不抛异常', () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    assert.ok(mgr)
  })

  it('默认设置全部可用（15+ 项）', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const all = await mgr.getAll()
    const keys = Object.keys(all)
    assert.ok(keys.length >= 15, `应有 ≥15 项默认设置，实际 ${keys.length}`)
  })

  it('getSettings() 返回包含 theme/language/model 等核心字段', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const all = await mgr.getAll()
    assert.ok('theme' in all, '应包含 theme')
    assert.ok('language' in all, '应包含 language')
    assert.ok('model' in all, '应包含 model')
    assert.ok('telemetryEnabled' in all, '应包含 telemetryEnabled')
    assert.ok('autoCollect' in all, '应包含 autoCollect')
  })
})

// ==================== 2. 设置读写 ====================

describe('SettingsManager — get / set', () => {
  it('get() 获取单个设置项', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const theme = await mgr.get('theme')
    assert.equal(theme, 'light')
  })

  it('set() 设置单个值后 get() 返回新值', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')
    const theme = await mgr.get('theme')
    assert.equal(theme, 'dark')
  })

  it('set() 多个设置互不干扰', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')
    await mgr.set('language', 'en-US')
    assert.equal(await mgr.get('theme'), 'dark')
    assert.equal(await mgr.get('language'), 'en-US')
    assert.equal(await mgr.get('model'), 'gpt-4o')
  })

  it('get() 不存在的 key 返回 undefined', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const val = await mgr.get('nonExistentKey')
    assert.equal(val, undefined)
  })

  it('set() 后数据持久化到 storage', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')
    const raw = await storage.get('pagewise_settings')
    assert.ok(raw.pagewise_settings)
    assert.equal(raw.pagewise_settings.theme, 'dark')
  })
})

// ==================== 3. 设置校验 ====================

describe('SettingsManager — 校验 validators', () => {
  it('theme 只接受 light/dark/system，拒绝其他值', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await assert.rejects(() => mgr.set('theme', 'blue'), /校验失败|validation/i)
    const theme = await mgr.get('theme')
    assert.equal(theme, 'light', '非法值不应写入')
  })

  it('maxTokens 范围校验：不能小于 256', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await assert.rejects(() => mgr.set('maxTokens', 100), /校验失败|validation|范围/i)
  })

  it('maxTokens 范围校验：不能大于 128000', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await assert.rejects(() => mgr.set('maxTokens', 200000), /校验失败|validation|范围/i)
  })

  it('language 只接受已注册的语言', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await assert.rejects(() => mgr.set('language', 'fr-FR'), /校验失败|validation|不支持/i)
  })

  it('telemetryEnabled 必须为 boolean', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await assert.rejects(() => mgr.set('telemetryEnabled', 'yes'), /校验失败|validation|boolean/i)
  })

  it('合法值可以正常写入', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('maxTokens', 8192)
    assert.equal(await mgr.get('maxTokens'), 8192)
  })
})

// ==================== 4. 设置分组 ====================

describe('SettingsManager — 分组 categories', () => {
  it('SETTING_CATEGORIES 包含至少 5 个分组', () => {
    assert.ok(Object.keys(SETTING_CATEGORIES).length >= 5)
  })

  it('每个设置项都属于一个分组', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const schema = mgr.getSchema()
    for (const [key, def] of Object.entries(schema)) {
      assert.ok(def.category, `${key} 缺少 category 字段`)
      assert.ok(
        SETTING_CATEGORIES[def.category],
        `${key} 的 category "${def.category}" 未在 SETTING_CATEGORIES 中注册`
      )
    }
  })

  it('getSchemaByCategory() 按分类返回设置', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const appearance = mgr.getSchemaByCategory('appearance')
    assert.ok(Object.keys(appearance).length >= 1, 'appearance 分组至少有 1 个设置')
    assert.ok('theme' in appearance, 'theme 应在 appearance 分组')
  })
})

// ==================== 5. 设置变更事件 ====================

describe('SettingsManager — 变更事件 onSettingChange', () => {
  it('onSettingChange 注册回调，set 后触发', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    let called = false
    let receivedKey = null
    let receivedValue = null

    mgr.onSettingChange('theme', (key, value) => {
      called = true
      receivedKey = key
      receivedValue = value
    })

    await mgr.set('theme', 'dark')
    assert.ok(called, '回调应被触发')
    assert.equal(receivedKey, 'theme')
    assert.equal(receivedValue, 'dark')
  })

  it('多个回调同时注册', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const calls = []

    mgr.onSettingChange('theme', () => calls.push('cb1'))
    mgr.onSettingChange('theme', () => calls.push('cb2'))

    await mgr.set('theme', 'dark')
    assert.deepEqual(calls, ['cb1', 'cb2'])
  })

  it('offSettingChange 取消注册后不再触发', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    let count = 0
    const cb = () => { count++ }

    const unsub = mgr.onSettingChange('theme', cb)
    await mgr.set('theme', 'dark')
    assert.equal(count, 1)

    unsub()
    await mgr.set('theme', 'light')
    assert.equal(count, 1, '取消后不应再触发')
  })

  it('值未变化时不触发回调', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    let count = 0
    mgr.onSettingChange('theme', () => { count++ })
    await mgr.set('theme', 'light') // 与默认值相同
    assert.equal(count, 0, '值未变化不应触发')
  })

  it('校验失败不触发回调', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    let called = false
    mgr.onSettingChange('theme', () => { called = true })
    try { await mgr.set('theme', 'invalid') } catch (_) { /* expected */ }
    assert.ok(!called, '校验失败不应触发回调')
  })
})

// ==================== 6. 设置导入导出 ====================

describe('SettingsManager — 导入导出', () => {
  it('exportSettings() 返回合法 JSON 字符串', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const json = await mgr.exportSettings()
    const parsed = JSON.parse(json)
    assert.ok(parsed.version, '导出应含版本号')
    assert.ok(parsed.settings, '导出应含 settings')
    assert.ok(parsed.exportedAt, '导出应含时间戳')
  })

  it('导出再导入，设置完全恢复', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')
    await mgr.set('maxTokens', 8192)

    const json = await mgr.exportSettings()

    const storage2 = createMockStorage()
    const mgr2 = createSettingsManager(storage2)
    await mgr2.importSettings(json)

    assert.equal(await mgr2.get('theme'), 'dark')
    assert.equal(await mgr2.get('maxTokens'), 8192)
  })

  it('导入非法 JSON 抛出错误', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await assert.rejects(() => mgr.importSettings('not json'), /JSON|格式/i)
  })

  it('导入后触发变更事件', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const changed = []
    mgr.onSettingChange('theme', (k) => changed.push(k))

    const json = JSON.stringify({
      version: 1,
      settings: { theme: 'dark' },
      exportedAt: Date.now(),
    })
    await mgr.importSettings(json)
    assert.ok(changed.includes('theme'), '导入变更应触发事件')
  })
})

// ==================== 7. 设置重置 ====================

describe('SettingsManager — 重置 resetToDefaults', () => {
  it('resetToDefaults() 恢复所有默认值', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')
    await mgr.set('maxTokens', 8192)

    await mgr.resetToDefaults()
    assert.equal(await mgr.get('theme'), 'light')
    assert.equal(await mgr.get('maxTokens'), 4096)
  })

  it('resetToDefaults("appearance") 只重置外观类', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')
    await mgr.set('model', 'deepseek-chat')

    await mgr.resetToDefaults('appearance')
    assert.equal(await mgr.get('theme'), 'light', '外观应被重置')
    assert.equal(await mgr.get('model'), 'deepseek-chat', 'AI 设置不应受影响')
  })

  it('重置后触发变更事件', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('theme', 'dark')

    const changed = []
    mgr.onSettingChange('theme', (k) => changed.push(k))
    await mgr.resetToDefaults()
    assert.ok(changed.includes('theme'), '重置应触发事件')
  })
})

// ==================== 8. getSchema / Schema 生成 ====================

describe('SettingsManager — getSchema', () => {
  it('getSchema() 返回对象，每个 key 含 type/label/default/category', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const schema = mgr.getSchema()
    for (const [key, def] of Object.entries(schema)) {
      assert.ok(def.type, `${key} 缺少 type`)
      assert.ok(def.label, `${key} 缺少 label`)
      assert.ok('default' in def, `${key} 缺少 default`)
      assert.ok(def.category, `${key} 缺少 category`)
    }
  })

  it('类型定义包含 text/number/boolean/select', () => {
    assert.ok(SETTING_TYPES.TEXT)
    assert.ok(SETTING_TYPES.NUMBER)
    assert.ok(SETTING_TYPES.BOOLEAN)
    assert.ok(SETTING_TYPES.SELECT)
  })

  it('select 类型有 options', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const schema = mgr.getSchema()
    for (const [key, def] of Object.entries(schema)) {
      if (def.type === SETTING_TYPES.SELECT) {
        assert.ok(Array.isArray(def.options), `${key} select 类型缺少 options`)
        assert.ok(def.options.length >= 2, `${key} options 至少 2 个`)
      }
    }
  })
})

// ==================== 9. 自定义注册 ====================

describe('SettingsManager — registerSetting 自定义注册', () => {
  it('registerSetting 添加新设置项', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)

    mgr.registerSetting({
      key: 'customFontSize',
      type: SETTING_TYPES.NUMBER,
      label: '自定义字号',
      default: 14,
      category: 'appearance',
      validator: (v) => typeof v === 'number' && v >= 8 && v <= 32,
    })

    assert.equal(await mgr.get('customFontSize'), 14)
    await mgr.set('customFontSize', 18)
    assert.equal(await mgr.get('customFontSize'), 18)
  })

  it('registerSetting 后校验生效', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)

    mgr.registerSetting({
      key: 'customFontSize',
      type: SETTING_TYPES.NUMBER,
      label: '自定义字号',
      default: 14,
      category: 'appearance',
      validator: (v) => typeof v === 'number' && v >= 8 && v <= 32,
    })

    await assert.rejects(
      () => mgr.set('customFontSize', 3),
      /校验失败|validation/i
    )
  })
})

// ==================== 10. 边界与兼容 ====================

describe('SettingsManager — 边界场景', () => {
  it('并发 set 不丢失数据', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await Promise.all([
      mgr.set('theme', 'dark'),
      mgr.set('model', 'claude-3'),
      mgr.set('language', 'en-US'),
    ])
    assert.equal(await mgr.get('theme'), 'dark')
    assert.equal(await mgr.get('model'), 'claude-3')
    assert.equal(await mgr.get('language'), 'en-US')
  })

  it('exportSettings 导出不含 apiKey', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    await mgr.set('apiKey', 'sk-secret-key-12345')
    const json = await mgr.exportSettings()
    const parsed = JSON.parse(json)
    assert.ok(
      !parsed.settings.apiKey || parsed.settings.apiKey === '',
      '导出不应包含 apiKey 明文'
    )
  })

  it('getAll 返回深拷贝（修改不影响内部状态）', async () => {
    const storage = createMockStorage()
    const mgr = createSettingsManager(storage)
    const all = await mgr.getAll()
    all.theme = 'modified'
    const theme = await mgr.get('theme')
    assert.equal(theme, 'light', '外部修改不应影响内部')
  })
})
