/**
 * test-r316-silent-catch-logging.js — R316: Silent catch 日志降级
 *
 * 验证 i18n.js 和 docmind-sync-helpers.js 中之前静默的 catch 块
 * 现在有 console.warn / console.debug 日志输出。
 */

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// ── i18n.js silent catch 日志 ─────────────────────────────────────────────

describe('R316: i18n.js — silent catch 日志降级', () => {
  let i18n

  beforeEach(async () => {
    i18n = await import('../lib/i18n.js')
  })

  it('1. getPreferredLanguage — storage 读取失败时 console.warn', async () => {
    // 用 monkey-patch 模拟 storageGet 抛出异常
    const mod = await import('../lib/storage-adapter.js')
    const origGet = mod.storageGet

    // 替换为抛出异常的函数
    mod.storageGet = () => { throw new Error('simulated storage failure') }

    const logs = []
    const origWarn = console.warn
    console.warn = (...args) => logs.push(args)

    try {
      const result = await i18n.getPreferredLanguage()
      // 应返回当前 locale 而非崩溃
      assert.ok(typeof result === 'string', 'should return a locale string')
      // 应有 warn 日志
      const found = logs.some(args =>
        args.some(a => typeof a === 'string' && a.includes('[PageWise] i18n: locale fallback'))
      )
      assert.ok(found, `Expected console.warn with '[PageWise] i18n: locale fallback', got: ${JSON.stringify(logs)}`)
    } finally {
      console.warn = origWarn
      mod.storageGet = origGet
    }
  })

  it('2. setPreferredLanguage — storage 写入失败时 console.warn', async () => {
    const mod = await import('../lib/storage-adapter.js')
    const origSet = mod.storageSet
    mod.storageSet = () => { throw new Error('simulated storage failure') }

    const logs = []
    const origWarn = console.warn
    console.warn = (...args) => logs.push(args)

    try {
      // 应不抛异常
      await i18n.setPreferredLanguage('en-US')
      const found = logs.some(args =>
        args.some(a => typeof a === 'string' && a.includes('[PageWise] i18n: locale fallback'))
      )
      assert.ok(found, `Expected console.warn with '[PageWise] i18n: locale fallback', got: ${JSON.stringify(logs)}`)
    } finally {
      console.warn = origWarn
      mod.storageSet = origSet
    }
  })

  it('3. _notifyListeners — listener 抛出异常时已有 console.error', () => {
    // 已有日志，此测试验证行为不变
    const logs = []
    const origError = console.error
    console.error = (...args) => logs.push(args)

    try {
      i18n.onLocaleChange(() => { throw new Error('listener boom') })
      i18n.setLocale('en-US')
      const found = logs.some(args =>
        args.some(a => typeof a === 'string' && a.includes('[i18n] Listener error'))
      )
      assert.ok(found, 'Expected existing console.error in _notifyListeners')
    } finally {
      console.error = origError
    }
  })
})

// ── docmind-sync-helpers.js silent catch 日志 ────────────────────────────

describe('R316: docmind-sync-helpers.js — silent catch 日志降级', () => {

  it('4. saveConfigSilent — storage 写入失败时 console.debug', async () => {
    const { saveConfigSilent } = await import('../lib/docmind-sync-helpers.js')

    // storageSetFn 模拟抛出异常的场景
    const failingSetFn = () => { throw new Error('simulated write failure') }
    const config = { serverUrl: 'http://test', apiKey: 'key1' }

    const logs = []
    const origDebug = console.debug
    console.debug = (...args) => logs.push(args)

    try {
      const result = await saveConfigSilent(failingSetFn, config, { apiKey: 'key2' }, 'testKey')
      // 应返回原 config
      assert.deepEqual(result, config, 'should return original config on failure')
      // 应有 debug 日志
      const found = logs.some(args =>
        args.some(a => typeof a === 'string' && a.includes('[PageWise] sync-helpers: using defaults'))
      )
      assert.ok(found, `Expected console.debug with '[PageWise] sync-helpers: using defaults', got: ${JSON.stringify(logs)}`)
    } finally {
      console.debug = origDebug
    }
  })
})
