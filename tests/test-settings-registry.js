/**
 * 测试 lib/settings-registry.js — 设置注册/校验/分类
 *
 * R250: SettingsManagerSplit
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  createSettingsRegistry,
  SETTING_TYPES,
  SETTING_CATEGORIES,
  BUILTIN_SETTINGS,
  SENSITIVE_KEYS,
  SUPPORTED_LOCALES,
} = await import('../lib/settings-registry.js')

// ==================== 1. 常量导出 ====================

describe('SettingsRegistry — 常量导出', () => {
  it('SETTING_TYPES 包含 4 种类型', () => {
    assert.ok(SETTING_TYPES.TEXT)
    assert.ok(SETTING_TYPES.NUMBER)
    assert.ok(SETTING_TYPES.BOOLEAN)
    assert.ok(SETTING_TYPES.SELECT)
  })

  it('SETTING_CATEGORIES 包含至少 6 个分组', () => {
    assert.ok(Object.keys(SETTING_CATEGORIES).length >= 6)
  })

  it('BUILTIN_SETTINGS 是数组且包含 ≥18 项', () => {
    assert.ok(Array.isArray(BUILTIN_SETTINGS))
    assert.ok(BUILTIN_SETTINGS.length >= 18, `实际 ${BUILTIN_SETTINGS.length}`)
  })

  it('SENSITIVE_KEYS 包含 apiKey', () => {
    assert.ok(SENSITIVE_KEYS.has('apiKey'))
  })

  it('SUPPORTED_LOCALES 包含 zh-CN 和 en-US', () => {
    assert.ok(SUPPORTED_LOCALES.includes('zh-CN'))
    assert.ok(SUPPORTED_LOCALES.includes('en-US'))
  })
})

// ==================== 2. 注册表创建 ====================

describe('SettingsRegistry — 创建与初始化', () => {
  it('createSettingsRegistry 返回对象', () => {
    const reg = createSettingsRegistry()
    assert.ok(reg)
  })

  it('内置设置已自动注册', () => {
    const reg = createSettingsRegistry()
    const keys = reg.getRegisteredKeys()
    assert.ok(keys.length >= 18, `应有 ≥18 项，实际 ${keys.length}`)
  })

  it('核心设置 key 存在', () => {
    const reg = createSettingsRegistry()
    const keys = reg.getRegisteredKeys()
    assert.ok(keys.includes('theme'))
    assert.ok(keys.includes('language'))
    assert.ok(keys.includes('model'))
    assert.ok(keys.includes('apiKey'))
    assert.ok(keys.includes('telemetryEnabled'))
    assert.ok(keys.includes('autoCollect'))
  })
})

// ==================== 3. 注册表查询 ====================

describe('SettingsRegistry — 查询', () => {
  it('getDefinition 返回设置定义', () => {
    const reg = createSettingsRegistry()
    const def = reg.getDefinition('theme')
    assert.ok(def)
    assert.equal(def.type, SETTING_TYPES.SELECT)
    assert.equal(def.category, 'appearance')
  })

  it('getDefinition 不存在的 key 返回 undefined', () => {
    const reg = createSettingsRegistry()
    assert.equal(reg.getDefinition('nonExistent'), undefined)
  })

  it('getDefaults 返回所有默认值', () => {
    const reg = createSettingsRegistry()
    const defaults = reg.getDefaults()
    assert.equal(defaults.theme, 'light')
    assert.equal(defaults.language, 'zh-CN')
    assert.equal(defaults.model, 'gpt-4o')
    assert.equal(defaults.maxTokens, 4096)
    assert.equal(defaults.debugMode, false)
  })
})

// ==================== 4. 自定义注册 ====================

describe('SettingsRegistry — registerSetting', () => {
  it('注册新设置项', () => {
    const reg = createSettingsRegistry()
    reg.registerSetting({
      key: 'customFontSize',
      type: SETTING_TYPES.NUMBER,
      label: '自定义字号',
      default: 14,
      category: 'appearance',
      validator: (v) => typeof v === 'number' && v >= 8 && v <= 32,
    })
    const keys = reg.getRegisteredKeys()
    assert.ok(keys.includes('customFontSize'))
    assert.equal(reg.getDefinition('customFontSize').default, 14)
  })

  it('缺少 key 抛出错误', () => {
    const reg = createSettingsRegistry()
    assert.throws(
      () => reg.registerSetting({ type: SETTING_TYPES.NUMBER, category: 'appearance' }),
      /key 必填/
    )
  })

  it('缺少 type 抛出错误', () => {
    const reg = createSettingsRegistry()
    assert.throws(
      () => reg.registerSetting({ key: 'test', category: 'appearance' }),
      /type 必填/
    )
  })

  it('缺少 category 抛出错误', () => {
    const reg = createSettingsRegistry()
    assert.throws(
      () => reg.registerSetting({ key: 'test', type: SETTING_TYPES.TEXT }),
      /category 必填/
    )
  })
})

// ==================== 5. 校验 ====================

describe('SettingsRegistry — validate', () => {
  it('合法值通过校验', () => {
    const reg = createSettingsRegistry()
    assert.doesNotThrow(() => reg.validate('theme', 'dark'))
    assert.doesNotThrow(() => reg.validate('maxTokens', 8192))
    assert.doesNotThrow(() => reg.validate('debugMode', true))
  })

  it('非法值抛出校验错误', () => {
    const reg = createSettingsRegistry()
    assert.throws(() => reg.validate('theme', 'blue'), /校验失败/)
    assert.throws(() => reg.validate('maxTokens', 100), /校验失败/)
    assert.throws(() => reg.validate('telemetryEnabled', 'yes'), /校验失败/)
  })

  it('未注册的 key 校验通过（兼容扩展）', () => {
    const reg = createSettingsRegistry()
    assert.doesNotThrow(() => reg.validate('unknownKey', 'any'))
  })
})
