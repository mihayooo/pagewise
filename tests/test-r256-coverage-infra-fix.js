/**
 * Tests for R256: CoverageInfraFixFinal — 覆盖率基础设施根因修复
 *
 * 验收标准:
 * AC-1: test:coverage 脚本开头包含 clean-coverage.js + mkdir -p coverage/tmp
 * AC-2: .gitignore 包含 coverage/tmp 和 coverage/_tmp_*
 * AC-3: scripts/clean-coverage.js 安全导出可用
 * AC-4: coverage:gate 三项门禁阈值正确 (lines ≥28%, functions ≥50%, branches ≥75%)
 * AC-5: architecture-guard.sh 包含 coverage/tmp 目录存在性检查
 * AC-6: architecture-guard.sh 包含模块行数检查和回归检测
 * AC-7: docs/reports/coverage-baseline.md 基线文档存在且结构完整
 * AC-8: test:coverage 脚本防御顺序正确 (clean → mkdir → c8)
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

describe('R256: CoverageInfraFixFinal — 覆盖率基础设施根因修复', () => {

  describe('AC-1: test:coverage 脚本包含防御性清理+重建', () => {
    it('test:coverage 脚本存在', () => {
      const pkg = readJSON('package.json')
      assert.ok(pkg.scripts['test:coverage'], 'test:coverage script should exist')
    })

    it('test:coverage 使用 clean-coverage.js 清理（R195 安全模式）', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      assert.ok(
        script.includes('clean-coverage.js'),
        'should use clean-coverage.js for safe cleanup (no direct rm -rf)'
      )
    })

    it('test:coverage 包含 mkdir -p coverage/tmp（防御性重建）', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      assert.ok(
        script.includes('mkdir -p coverage/tmp'),
        'should contain mkdir -p coverage/tmp for defensive rebuild'
      )
    })

    it('test:coverage 不直接使用 rm -rf（由 clean-coverage.js 处理）', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      assert.ok(
        !script.includes('rm -rf'),
        'should not use rm -rf directly, delegated to clean-coverage.js'
      )
    })

    it('test:coverage 仍调用 clean-coverage.js', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      assert.ok(
        script.includes('clean-coverage.js'),
        'should still call clean-coverage.js for _tmp_* cleanup'
      )
    })

    it('test:coverage 仍调用 c8 生成报告', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      assert.ok(
        script.includes('c8 --reporter='),
        'should still call c8 with reporters'
      )
    })
  })

  describe('AC-2: .gitignore 包含 coverage/tmp 和 coverage/_tmp_*', () => {
    const gitignore = readFile('.gitignore')

    it('.gitignore 包含 coverage/tmp 规则', () => {
      assert.ok(
        gitignore.includes('coverage/tmp'),
        '.gitignore should contain coverage/tmp'
      )
    })

    it('.gitignore 包含 coverage/_tmp_* 规则 (R195)', () => {
      assert.ok(
        gitignore.includes('coverage/_tmp_*'),
        '.gitignore should contain coverage/_tmp_* (from R195)'
      )
    })

    it('.gitignore 包含 coverage/ 主目录规则', () => {
      assert.ok(
        gitignore.includes('coverage/'),
        '.gitignore should contain coverage/ parent dir rule'
      )
    })

    it('R256 注释标记存在', () => {
      assert.ok(
        gitignore.includes('R256'),
        '.gitignore should contain R256 annotation'
      )
    })
  })

  describe('AC-3: scripts/clean-coverage.js 安全导出可用', () => {
    it('clean-coverage.js 文件存在', () => {
      assert.ok(fileExists('scripts/clean-coverage.js'), 'clean-coverage.js should exist')
    })

    it('clean-coverage.js 导出 safeRmdir 函数', () => {
      const src = readFile('scripts/clean-coverage.js')
      assert.ok(
        src.includes('export function safeRmdir'),
        'should export safeRmdir function'
      )
    })

    it('clean-coverage.js 导出 findTmpDirs 函数', () => {
      const src = readFile('scripts/clean-coverage.js')
      assert.ok(
        src.includes('export function findTmpDirs'),
        'should export findTmpDirs function'
      )
    })

    it('clean-coverage.js 导出 cleanCoverage 函数', () => {
      const src = readFile('scripts/clean-coverage.js')
      assert.ok(
        src.includes('export function cleanCoverage'),
        'should export cleanCoverage function'
      )
    })

    it('clean-coverage.js 始终退出码为 0（不阻断覆盖率生成）', () => {
      const src = readFile('scripts/clean-coverage.js')
      assert.ok(
        src.includes('process.exitCode = 0'),
        'should set process.exitCode = 0 for safe exit'
      )
    })

    it('clean-coverage.js 处理 EACCES/EPERM 权限问题', () => {
      const src = readFile('scripts/clean-coverage.js')
      assert.ok(
        src.includes('EACCES'),
        'should handle EACCES permission error'
      )
      assert.ok(
        src.includes('EPERM'),
        'should handle EPERM permission error'
      )
    })
  })

  describe('AC-4: coverage:gate 三项门禁阈值正确', () => {
    it('coverage:gate 使用 c8 check-coverage', () => {
      const pkg = readJSON('package.json')
      assert.ok(
        pkg.scripts['coverage:gate'].startsWith('c8 check-coverage'),
        'should use c8 check-coverage'
      )
    })

    it('coverage:gate --lines ≥ 28%', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      assert.ok(match, '--lines should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.ok(val >= 28, `--lines should be ≥ 28, got ${val}`)
    })

    it('coverage:gate --functions ≥ 50%', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      assert.ok(match, '--functions should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.ok(val >= 50, `--functions should be ≥ 50, got ${val}`)
    })

    it('coverage:gate --branches ≥ 75%', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      assert.ok(match, '--branches should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.ok(val >= 75, `--branches should be ≥ 75, got ${val}`)
    })

    it('coverage:gate 包含全部三个维度', () => {
      const pkg = readJSON('package.json')
      const gate = pkg.scripts['coverage:gate']
      assert.ok(gate.includes('--lines'), 'should include --lines')
      assert.ok(gate.includes('--branches'), 'should include --branches')
      assert.ok(gate.includes('--functions'), 'should include --functions')
    })
  })

  describe('AC-5: architecture-guard.sh 包含 coverage/tmp 目录存在性检查', () => {
    const guard = readFile('scripts/architecture-guard.sh')

    it('包含 Part 3: Coverage Infrastructure Guard', () => {
      assert.ok(
        guard.includes('Part 3: Coverage Infrastructure Guard'),
        'should have Part 3 section for coverage infrastructure'
      )
    })

    it('包含 R256 标记', () => {
      assert.ok(
        guard.includes('R256'),
        'should reference R256 in Part 3 header'
      )
    })

    it('检查 coverage/tmp 目录是否存在', () => {
      assert.ok(
        guard.includes('coverage/tmp'),
        'should check coverage/tmp directory'
      )
    })

    it('使用 -d 检测目录存在性', () => {
      assert.ok(
        guard.includes('[ -d '),
        'should use -d test for directory existence'
      )
    })

    it('目录存在时 pass', () => {
      assert.ok(
        guard.includes('pass "coverage/tmp directory exists"'),
        'should pass when coverage/tmp exists'
      )
    })

    it('目录不存在时 fail', () => {
      assert.ok(
        guard.includes('fail "coverage/tmp directory does not exist'),
        'should fail when coverage/tmp does not exist'
      )
    })
  })

  describe('AC-6: architecture-guard.sh 包含完整的三部分检查', () => {
    const guard = readFile('scripts/architecture-guard.sh')

    it('Part 1: 模块行数检查 MAX_LINES=400', () => {
      assert.ok(guard.includes('MAX_LINES=400'), 'should have module size guard')
    })

    it('Part 2: 覆盖率回归检测 REGRESSION_TOLERANCE=2', () => {
      assert.ok(guard.includes('REGRESSION_TOLERANCE=2'), 'should have regression tolerance')
    })

    it('Part 3: 覆盖率基础设施检查', () => {
      assert.ok(guard.includes('Part 3:'), 'should have Part 3')
    })

    it('包含 PASS/FAIL 计数器', () => {
      assert.ok(guard.includes('PASS=0'), 'should initialize PASS counter')
      assert.ok(guard.includes('FAIL=0'), 'should initialize FAIL counter')
    })

    it('Summary 输出通过/失败计数', () => {
      assert.ok(
        guard.includes('Guard Results:'),
        'should output guard results summary'
      )
    })
  })

  describe('AC-7: 覆盖率基线文档存在且结构完整', () => {
    it('docs/reports/coverage-baseline.md 存在', () => {
      assert.ok(
        fileExists('docs/reports/coverage-baseline.md'),
        'coverage baseline document should exist'
      )
    })

    it('基线文档包含 R256 迭代标识', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(
        baseline.includes('R256'),
        'baseline should reference R256 iteration'
      )
    })

    it('基线文档包含 Lines 维度', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('**Lines**'), 'should have Lines metric')
    })

    it('基线文档包含 Branches 维度', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('**Branches**'), 'should have Branches metric')
    })

    it('基线文档包含 Functions 维度', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('**Functions**'), 'should have Functions metric')
    })

    it('基线文档包含 Statements 维度', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('**Statements**'), 'should have Statements metric')
    })

    it('基线文档包含门禁阈值映射', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('门禁阈值映射'), 'should have gate threshold mapping')
    })

    it('基线文档包含测量环境', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('测量环境'), 'should have measurement environment section')
    })

    it('基线文档包含更新规则', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('更新规则'), 'should have update rules')
    })

    it('基线文档包含 ENOENT 根因说明', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(
        baseline.includes('ENOENT') || baseline.includes('coverage/tmp'),
        'should reference ENOENT root cause or coverage/tmp fix'
      )
    })
  })

  describe('AC-8: test:coverage 脚本执行顺序正确', () => {
    it('clean-coverage.js 在 mkdir -p 之前执行', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      const cleanIdx = script.indexOf('clean-coverage.js')
      const mkdirIdx = script.indexOf('mkdir -p coverage/tmp')
      assert.ok(cleanIdx >= 0, 'clean-coverage.js should be present')
      assert.ok(mkdirIdx >= 0, 'mkdir -p should be present')
      assert.ok(cleanIdx < mkdirIdx, 'clean-coverage.js should come before mkdir -p')
    })

    it('mkdir -p 在 c8 之前执行', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      const mkdirIdx = script.indexOf('mkdir -p coverage/tmp')
      const c8Idx = script.indexOf('c8 ')
      assert.ok(mkdirIdx < c8Idx, 'mkdir -p should come before c8')
    })

    it('clean-coverage.js 在 c8 之前执行', () => {
      const pkg = readJSON('package.json')
      const script = pkg.scripts['test:coverage']
      const cleanIdx = script.indexOf('clean-coverage.js')
      const c8Idx = script.indexOf('c8 ')
      assert.ok(cleanIdx < c8Idx, 'clean-coverage.js should come before c8')
    })
  })

  describe('AC-9: clean-coverage.js 可成功导入并执行', () => {
    it('可导入 clean-coverage.js 模块', async () => {
      const mod = await import('../scripts/clean-coverage.js')
      assert.ok(mod.safeRmdir, 'should export safeRmdir')
      assert.ok(mod.findTmpDirs, 'should export findTmpDirs')
      assert.ok(mod.cleanCoverage, 'should export cleanCoverage')
    })

    it('safeRmdir 对不存在的目录返回 success', async () => {
      const { safeRmdir } = await import('../scripts/clean-coverage.js')
      const result = safeRmdir('/tmp/nonexistent-dir-r256-test-' + Date.now())
      assert.ok(result.success, 'safeRmdir should succeed for non-existent dir')
    })

    it('findTmpDirs 对不存在的目录返回空数组', async () => {
      const { findTmpDirs } = await import('../scripts/clean-coverage.js')
      const result = findTmpDirs('/tmp/nonexistent-dir-r256-test-' + Date.now())
      assert.ok(Array.isArray(result), 'should return array')
      assert.equal(result.length, 0, 'should return empty array for non-existent dir')
    })

    it('cleanCoverage 执行不抛出异常', async () => {
      const { cleanCoverage } = await import('../scripts/clean-coverage.js')
      assert.doesNotThrow(() => {
        const result = cleanCoverage()
        assert.ok(result, 'should return result object')
        assert.ok(Array.isArray(result.cleaned), 'result.cleaned should be array')
        assert.ok(Array.isArray(result.skipped), 'result.skipped should be array')
        assert.ok(Array.isArray(result.errors), 'result.errors should be array')
      })
    })
  })

  describe('AC-10: ENOENT 根因防护链完整性', () => {
    it('R192 修复标记在 .gitignore 中', () => {
      const gitignore = readFile('.gitignore')
      assert.ok(gitignore.includes('R195') || gitignore.includes('R192'), '.gitignore should reference R192/R195 fix')
    })

    it('R195 修复标记在 clean-coverage.js 中', () => {
      const src = readFile('scripts/clean-coverage.js')
      assert.ok(src.includes('R195'), 'clean-coverage.js should reference R195')
    })

    it('R256 修复标记在 .gitignore 中', () => {
      const gitignore = readFile('.gitignore')
      assert.ok(gitignore.includes('R256'), '.gitignore should reference R256')
    })

    it('coverage:gate 阈值与基线文档一致 (lines ≥ 28%)', () => {
      const pkg = readJSON('package.json')
      const baseline = readFile('docs/reports/coverage-baseline.md')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      assert.ok(baseline.includes('≥ 28%'), 'baseline should document lines gate as 28%')
      assert.equal(parseInt(match[1], 10), 28, 'package.json --lines should be 28')
    })

    it('coverage:gate 阈值与基线文档一致 (functions ≥ 50%)', () => {
      const pkg = readJSON('package.json')
      const baseline = readFile('docs/reports/coverage-baseline.md')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      assert.ok(baseline.includes('≥ 50%'), 'baseline should document functions gate as 50%')
      assert.equal(parseInt(match[1], 10), 50, 'package.json --functions should be 50')
    })

    it('coverage:gate 阈值与基线文档一致 (branches ≥ 75%)', () => {
      const pkg = readJSON('package.json')
      const baseline = readFile('docs/reports/coverage-baseline.md')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      assert.ok(baseline.includes('≥ 75%'), 'baseline should document branches gate as 75%')
      assert.equal(parseInt(match[1], 10), 75, 'package.json --branches should be 75')
    })
  })
})
