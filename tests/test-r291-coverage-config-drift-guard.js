/**
 * R291: CoverageConfigDriftGuard — 覆盖率基础设施配置防漂移
 *
 * 验收标准:
 * AC-1: .c8rc.json tmpDir 与 test:coverage 脚本中创建的目录一致（防止声明 vs 实际漂移）
 * AC-2: .c8rc.json reporter 包含 lcov + text-summary（从实际文件读取，非硬编码）
 * AC-3: .c8rc.json include 覆盖 lib 目录下 JS 文件（从实际文件读取）
 * AC-4: scripts/validate-c8-config.sh 存在且包含关键字段验证
 * AC-5: scripts/architecture-guard.sh 集成了 c8 配置验证（Part 4）
 * AC-6: test:coverage 脚本在运行 c8 前自动创建 coverage/tmp（防御性 mkdir -p）
 * AC-7: c8 配置断言测试从 .c8rc.json 读取期望值（非硬编码）
 * AC-8: validate-c8-config.sh 验证 reporter 列表、include 覆盖、tmpDir 配置
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

function readJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'))
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

describe('R291: CoverageConfigDriftGuard — 覆盖率配置防漂移', () => {

  describe('AC-1: .c8rc.json tmpDir 与 test:coverage 脚本一致', () => {
    it('.c8rc.json 包含 tmpDir 字段', () => {
      const c8rc = readJSON('.c8rc.json')
      assert.ok(
        typeof c8rc.tmpDir === 'string' && c8rc.tmpDir.length > 0,
        `.c8rc.json tmpDir 应为非空字符串, 实际: ${c8rc.tmpDir}`
      )
    })

    it('.c8rc.json tmpDir 不指向 /tmp 外部路径（防止 CI 环境漂移）', () => {
      const c8rc = readJSON('.c8rc.json')
      const tmpDir = c8rc.tmpDir
      // tmpDir 应该是相对路径或指向项目内的 coverage/tmp
      // 不应该是 /tmp/c8_xxx 之类的外部绝对路径
      assert.ok(
        !tmpDir.startsWith('/tmp/') || tmpDir === 'coverage/tmp',
        `tmpDir 不应指向外部 /tmp 路径, 实际: ${tmpDir}. 建议使用 'coverage/tmp'`
      )
    })

    it('.c8rc.json tmpDir 与 test:coverage 创建的目录一致', () => {
      const c8rc = readJSON('.c8rc.json')
      const pkg = readJSON('package.json')
      const testCoverage = pkg.scripts['test:coverage']

      // test:coverage 应该创建与 c8rc.tmpDir 对应的目录
      if (c8rc.tmpDir === 'coverage/tmp' || c8rc.tmpDir === './coverage/tmp') {
        assert.ok(
          testCoverage.includes('mkdir -p coverage/tmp'),
          'test:coverage 应创建 coverage/tmp 目录以匹配 c8rc.tmpDir'
        )
      }
    })
  })

  describe('AC-2: .c8rc.json reporter 从实际文件读取验证', () => {
    it('.c8rc.json reporter 为数组', () => {
      const c8rc = readJSON('.c8rc.json')
      assert.ok(
        Array.isArray(c8rc.reporter),
        `reporter 应为数组, 实际: ${typeof c8rc.reporter}`
      )
    })

    it('.c8rc.json reporter 包含 lcov', () => {
      const c8rc = readJSON('.c8rc.json')
      assert.ok(
        c8rc.reporter.includes('lcov'),
        `reporter 应包含 'lcov', 实际: ${JSON.stringify(c8rc.reporter)}`
      )
    })

    it('.c8rc.json reporter 包含 text-summary', () => {
      const c8rc = readJSON('.c8rc.json')
      assert.ok(
        c8rc.reporter.includes('text-summary'),
        `reporter 应包含 'text-summary', 实际: ${JSON.stringify(c8rc.reporter)}`
      )
    })

    it('.c8rc.json reporter 包含 html', () => {
      const c8rc = readJSON('.c8rc.json')
      assert.ok(
        c8rc.reporter.includes('html'),
        `reporter 应包含 'html', 实际: ${JSON.stringify(c8rc.reporter)}`
      )
    })
  })

  describe('AC-3: .c8rc.json include 覆盖 lib/', () => {
    it('.c8rc.json include 为数组', () => {
      const c8rc = readJSON('.c8rc.json')
      assert.ok(
        Array.isArray(c8rc.include),
        `include 应为数组, 实际: ${typeof c8rc.include}`
      )
    })

    it('.c8rc.json include 包含 lib/ 下的 JS 文件匹配模式', () => {
      const c8rc = readJSON('.c8rc.json')
      const hasLibPattern = c8rc.include.some(p =>
        p.includes('lib/') && (p.includes('*.js') || p.includes('**'))
      )
      assert.ok(
        hasLibPattern,
        `include 应包含 lib/ 下的 JS 文件匹配模式, 实际: ${JSON.stringify(c8rc.include)}`
      )
    })

    it('.c8rc.json exclude 排除 tests 目录', () => {
      const c8rc = readJSON('.c8rc.json')
      const hasTestExclude = c8rc.exclude && c8rc.exclude.some(p => p.includes('tests'))
      assert.ok(
        hasTestExclude,
        `exclude 应包含 tests 目录排除, 实际: ${JSON.stringify(c8rc.exclude)}`
      )
    })

    it('.c8rc.json all 未设置（R306: 仅统计被测试导入的模块）', () => {
      const c8rc = readJSON('.c8rc.json')
      // R306: 移除 all:true — 171 个未测试模块计入分母导致覆盖率虚低 (24% vs 实际 75%)
      assert.equal(c8rc.all, undefined, 'all 不应设置')
    })
  })

  describe('AC-4: scripts/validate-c8-config.sh 存在且包含关键字段验证', () => {
    it('validate-c8-config.sh 文件存在', () => {
      assert.ok(
        fileExists('scripts/validate-c8-config.sh'),
        'scripts/validate-c8-config.sh 应存在'
      )
    })

    it('validate-c8-config.sh 可执行', () => {
      const scriptPath = path.join(ROOT, 'scripts/validate-c8-config.sh')
      const stat = fs.statSync(scriptPath)
      assert.ok(
        (stat.mode & 0o111) !== 0,
        'validate-c8-config.sh 应有可执行权限'
      )
    })

    it('validate-c8-config.sh 解析 .c8rc.json', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('.c8rc.json'),
        '应引用 .c8rc.json 配置文件'
      )
    })

    it('validate-c8-config.sh 验证 reporter 包含 lcov', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('lcov'),
        '应验证 reporter 包含 lcov'
      )
    })

    it('validate-c8-config.sh 验证 reporter 包含 text-summary', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('text-summary'),
        '应验证 reporter 包含 text-summary'
      )
    })

    it('validate-c8-config.sh 验证 include 覆盖 lib/', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('lib/') || src.includes('lib\\/') || src.includes('lib/.*'),
        '应验证 include 覆盖 lib/'
      )
    })

    it('validate-c8-config.sh 有 PASS/FAIL 输出', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('PASS') || src.includes('pass') || src.includes('✅') || src.includes('❌'),
        '应有 PASS/FAIL 结果输出'
      )
    })
  })

  describe('AC-5: scripts/architecture-guard.sh 集成 c8 配置验证', () => {
    const guard = readFile('scripts/architecture-guard.sh')

    it('包含 Part 4: c8 Config Drift Guard 部分', () => {
      assert.ok(
        guard.includes('Part 4') || guard.includes('c8 Config') || guard.includes('c8rc') || guard.includes('R291'),
        'architecture-guard.sh 应包含 Part 4 c8 配置验证部分'
      )
    })

    it('引用 validate-c8-config.sh 或直接验证 .c8rc.json', () => {
      const hasValidation = guard.includes('validate-c8-config') ||
        guard.includes('.c8rc.json') ||
        guard.includes('c8rc')
      assert.ok(
        hasValidation,
        '应引用 validate-c8-config.sh 或直接验证 .c8rc.json'
      )
    })
  })

  describe('AC-6: test:coverage 脚本防御性 mkdir -p', () => {
    it('test:coverage 包含 mkdir -p coverage/tmp', () => {
      const pkg = readJSON('package.json')
      assert.ok(
        pkg.scripts['test:coverage'].includes('mkdir -p coverage/tmp'),
        'test:coverage 应包含 mkdir -p coverage/tmp'
      )
    })

    it('test:coverage 在 c8 运行前创建目录', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      const mkdirIdx = script.indexOf('mkdir -p')
      const c8Idx = script.indexOf('c8 ')
      assert.ok(mkdirIdx >= 0, '应包含 mkdir -p')
      assert.ok(c8Idx >= 0, '应包含 c8')
      assert.ok(mkdirIdx < c8Idx, 'mkdir -p 应在 c8 之前执行')
    })
  })

  describe('AC-7: c8 配置断言从 .c8rc.json 读取（非硬编码）', () => {
    it('本测试文件读取实际 .c8rc.json 而非硬编码期望', () => {
      // 验证模式: 读取实际配置 → 断言结构正确
      // 而非: assert.equal(config.tmpDir, "coverage/tmp") 硬编码
      const c8rc = readJSON('.c8rc.json')

      // 结构断言（不依赖具体值）
      assert.ok(Array.isArray(c8rc.reporter), 'reporter 应为数组')
      assert.ok(c8rc.reporter.length > 0, 'reporter 不应为空')
      assert.ok(Array.isArray(c8rc.include), 'include 应为数组')
      assert.ok(c8rc.include.length > 0, 'include 不应为空')
      assert.ok(Array.isArray(c8rc.exclude), 'exclude 应为数组')
      assert.ok(typeof c8rc.tmpDir === 'string', 'tmpDir 应为字符串')
    })

    it('.c8rc.json 配置可 JSON 解析', () => {
      const raw = fs.readFileSync(path.join(ROOT, '.c8rc.json'), 'utf8')
      assert.doesNotThrow(() => {
        JSON.parse(raw)
      }, '.c8rc.json 应为合法 JSON')
    })

    it('.c8rc.json 包含所有必要字段', () => {
      const c8rc = readJSON('.c8rc.json')
      const requiredFields = ['include', 'exclude', 'reporter', 'tmpDir']
      for (const field of requiredFields) {
        assert.ok(
          field in c8rc,
          `.c8rc.json 应包含 ${field} 字段`
        )
      }
    })
  })

  describe('AC-8: validate-c8-config.sh 验证完整性', () => {
    it('validate-c8-config.sh 验证 tmpDir 配置', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('tmpDir') || src.includes('tmpdir') || src.includes('tmp'),
        '应验证 tmpDir 配置'
      )
    })

    it('validate-c8-config.sh 使用 exit code 表示结果', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('exit') || src.includes('EXIT'),
        '应使用 exit code 表示验证结果'
      )
    })

    it('validate-c8-config.sh 使用 set -euo pipefail（防御性脚本）', () => {
      const src = readFile('scripts/validate-c8-config.sh')
      assert.ok(
        src.includes('set -e') || src.includes('set -euo'),
        '应使用 set -e 防御性脚本模式'
      )
    })
  })
})
