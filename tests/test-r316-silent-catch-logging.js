/**
 * test-r316-silent-catch-logging.js — R316: Silent catch 降级日志
 *
 * 验证 i18n.js 和 docmind-sync-helpers.js 中的 catch 块有日志输出。
 *
 * 注意: i18n.js 中 storageGet/storageSet 是 ES Module 绑定，无法 mock。
 * 因此 i18n 的 catch 块通过源码检查验证日志存在，运行时行为通过 happy path 验证。
 * docmind-sync-helpers.js 的 saveConfigSilent 接受函数参数，可直接注入失败函数。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── i18n.js — 源码检查：catch 块有日志输出 ─────────────────────────────

describe('R316: i18n.js — silent catch 已添加降级日志', () => {

  it('1. getPreferredLanguage catch 块包含 console.warn', () => {
    const src = readFileSync(join(ROOT, 'lib/i18n.js'), 'utf8')
    // 提取 getPreferredLanguage 函数
    const fnMatch = src.match(/export async function getPreferredLanguage\(\)[\s\S]*?(?=\n\}\n)/)
    assert.ok(fnMatch, 'getPreferredLanguage function should exist')
    const fnBody = fnMatch[0]
    assert.ok(
      fnBody.includes("console.warn('[PageWise] i18n: locale fallback'"),
      'catch block should have console.warn with "[PageWise] i18n: locale fallback"'
    )
  })

  it('2. setPreferredLanguage catch 块包含 console.warn', () => {
    const src = readFileSync(join(ROOT, 'lib/i18n.js'), 'utf8')
    // 提取 setPreferredLanguage 函数
    const fnMatch = src.match(/export async function setPreferredLanguage\(locale\)[\s\S]*?(?=\n\}\n)/)
    assert.ok(fnMatch, 'setPreferredLanguage function should exist')
    const fnBody = fnMatch[0]
    assert.ok(
      fnBody.includes("console.warn('[PageWise] i18n: locale fallback'"),
      'catch block should have console.warn with "[PageWise] i18n: locale fallback"'
    )
  })

  it('3. i18n.js 中无残留的 silent catch (catch 块使用 _e 但无日志)', () => {
    const src = readFileSync(join(ROOT, 'lib/i18n.js'), 'utf8')
    // 查找所有 catch 块并检查都有日志
    const catchBlocks = src.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g) || []
    for (const block of catchBlocks) {
      if (block.includes('_e')) {
        assert.ok(
          block.includes('console.') ,
          `catch block with _e should have console output: ${block.slice(0, 80)}`
        )
      }
    }
  })

  it('4. i18n.js happy path — getPreferredLanguage 正常工作', async () => {
    const i18n = await import('../lib/i18n.js')
    const result = await i18n.getPreferredLanguage()
    assert.ok(typeof result === 'string', 'should return a string locale')
  })

  it('5. i18n.js happy path — setPreferredLanguage 正常工作', async () => {
    const i18n = await import('../lib/i18n.js')
    // Should not throw
    await i18n.setPreferredLanguage('en-US')
    assert.ok(true, 'setPreferredLanguage should complete without error')
  })
})

// ── docmind-sync-helpers.js — 运行时验证 catch 日志 ─────────────────────

describe('R316: docmind-sync-helpers.js — silent catch 已添加降级日志', () => {

  it('6. saveConfigSilent catch 块包含 console.debug 日志（源码检查）', () => {
    const src = readFileSync(join(ROOT, 'lib/docmind-sync-helpers.js'), 'utf8')
    const fnMatch = src.match(/export async function saveConfigSilent[\s\S]*?(?=\n\}\n)/)
    assert.ok(fnMatch, 'saveConfigSilent function should exist')
    const fnBody = fnMatch[0]
    assert.ok(
      fnBody.includes("console.debug('[PageWise] sync-helpers: using defaults'"),
      'catch block should have console.debug with "[PageWise] sync-helpers: using defaults"'
    )
  })

  it('7. saveConfigSilent — storageSetFn 失败时 console.debug 输出且返回原 config', async () => {
    const { saveConfigSilent } = await import('../lib/docmind-sync-helpers.js')

    const config = { serverUrl: 'http://test', apiKey: 'key1' }
    const failingFn = () => { throw new Error('simulated failure') }

    // 捕获 console.debug
    const debugLogs = []
    const origDebug = console.debug
    console.debug = (...args) => debugLogs.push(args)

    try {
      const result = await saveConfigSilent(failingFn, config, { apiKey: 'key2' }, 'testKey')
      assert.deepEqual(result, config, 'should return original config on failure')

      const found = debugLogs.some(args =>
        args.some(a => typeof a === 'string' && a.includes('[PageWise] sync-helpers: using defaults'))
      )
      assert.ok(found, `Expected console.debug with '[PageWise] sync-helpers: using defaults', got: ${JSON.stringify(debugLogs)}`)
    } finally {
      console.debug = origDebug
    }
  })

  it('8. docmind-sync-helpers.js 中无残留的 silent catch (_e 无日志)', () => {
    const src = readFileSync(join(ROOT, 'lib/docmind-sync-helpers.js'), 'utf8')
    const catchBlocks = src.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g) || []
    for (const block of catchBlocks) {
      if (block.includes('_e')) {
        assert.ok(
          block.includes('console.'),
          `catch block with _e should have console output: ${block.slice(0, 80)}`
        )
      }
    }
  })

  it('9. saveConfigSilent happy path — 正常写入成功', async () => {
    const { saveConfigSilent } = await import('../lib/docmind-sync-helpers.js')

    const config = { serverUrl: 'http://test', apiKey: 'key1' }
    const successFn = (_items, cb) => cb()

    const result = await saveConfigSilent(successFn, config, { apiKey: 'key2' }, 'testKey')
    assert.equal(result.apiKey, 'key2', 'should return updated config')
    assert.equal(result.serverUrl, 'http://test', 'should preserve existing fields')
  })
})
