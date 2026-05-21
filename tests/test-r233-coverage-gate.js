/**
 * Tests for R233: CoverageGateHardening
 *
 * 验证:
 * 1. package.json coverage:gate 包含三维门禁 (--lines, --branches, --functions)
 * 2. CI workflow 中包含 coverage gate 和 regression check 步骤
 * 3. docs/reports/coverage-baseline.md 基线文档结构正确
 * 4. scripts/architecture-guard.sh 脚本存在且可执行
 * 5. 门禁阈值与基线文档一致
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

describe('R233: Coverage Gate Hardening', () => {

  describe('AC-1: coverage:gate 阈值与实测基线对齐', () => {
    it('package.json 中 coverage:gate 包含 --lines 参数', () => {
      const pkg = readJSON('package.json')
      assert.ok(pkg.scripts['coverage:gate'], 'coverage:gate script should exist')
      assert.ok(pkg.scripts['coverage:gate'].includes('--lines'), 'should include --lines')
    })

    it('package.json 中 coverage:gate 包含 --branches 参数', () => {
      const pkg = readJSON('package.json')
      assert.ok(pkg.scripts['coverage:gate'].includes('--branches'), 'should include --branches')
    })

    it('package.json 中 coverage:gate 包含 --functions 参数', () => {
      const pkg = readJSON('package.json')
      assert.ok(pkg.scripts['coverage:gate'].includes('--functions'), 'should include --functions')
    })

    it('门禁阈值: --lines 设为 23 (实测基线 23.68%)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      assert.ok(match, '--lines should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.equal(val, 23, '--lines should be 23 (downward adjusted from 50)')
    })

    it('门禁阈值: --functions 设为 48 (实测基线 48.85%)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      assert.ok(match, '--functions should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.equal(val, 48, '--functions should be 48 (downward adjusted from 60)')
    })

    it('门禁阈值: --branches 设为 75 (实测基线 75.97%)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      assert.ok(match, '--branches should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.equal(val, 75, '--branches should be 75')
    })

    it('coverage:gate 命令使用 c8 check-coverage', () => {
      const pkg = readJSON('package.json')
      assert.ok(
        pkg.scripts['coverage:gate'].startsWith('c8 check-coverage'),
        'should use c8 check-coverage'
      )
    })
  })

  describe('AC-2: CI workflow 硬性阻断', () => {
    const ciYml = readFile('.github/workflows/ci.yml')

    it('ci.yml 中 test job 包含 coverage gate 步骤', () => {
      assert.ok(
        ciYml.includes('Coverage gate'),
        'ci.yml should have a Coverage gate step'
      )
    })

    it('ci.yml 中 test job 包含 coverage regression check 步骤', () => {
      assert.ok(
        ciYml.includes('Coverage regression check'),
        'ci.yml should have a Coverage regression check step'
      )
    })

    it('ci.yml 中 coverage gate 使用 npm run coverage:gate', () => {
      assert.ok(
        ciYml.includes('npm run coverage:gate'),
        'ci.yml should run npm run coverage:gate'
      )
    })

    it('ci.yml 中 regression check 使用 architecture-guard.sh', () => {
      assert.ok(
        ciYml.includes('architecture-guard.sh'),
        'ci.yml should run architecture-guard.sh'
      )
    })

    it('ci.yml 中 package-check job 依赖 test job', () => {
      assert.ok(
        ciYml.includes('needs: [lint, test]') || ciYml.includes('needs:\n    - lint\n    - test'),
        'package-check should depend on test job so coverage failure blocks downstream'
      )
    })
  })

  describe('AC-3: 三维门禁覆盖', () => {
    it('coverage:gate 同时检查 lines, branches, functions', () => {
      const pkg = readJSON('package.json')
      const gate = pkg.scripts['coverage:gate']
      const dims = ['--lines', '--branches', '--functions']
      for (const dim of dims) {
        assert.ok(gate.includes(dim), `coverage:gate should include ${dim}`)
      }
    })
  })

  describe('AC-4: 基线文档可追溯', () => {
    const baselinePath = 'docs/reports/coverage-baseline.md'

    it('coverage-baseline.md 文件存在', () => {
      assert.ok(fileExists(baselinePath), 'coverage-baseline.md should exist')
    })

    it('包含 Lines 基线数据', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('Lines'), 'should contain Lines metric')
      assert.ok(content.includes('23.68%'), 'should contain actual baseline value 23.68%')
    })

    it('包含 Branches 基线数据', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('Branches'), 'should contain Branches metric')
      assert.ok(content.includes('75.97%'), 'should contain actual baseline value 75.97%')
    })

    it('包含 Functions 基线数据', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('Functions'), 'should contain Functions metric')
      assert.ok(content.includes('48.85%'), 'should contain actual baseline value 48.85%')
    })

    it('包含测量环境信息', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('Node.js'), 'should mention Node.js version')
      assert.ok(content.includes('c8'), 'should mention c8 version')
      assert.ok(content.includes('2026-05-21'), 'should include measurement date')
    })

    it('包含门禁阈值映射', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('2pp'), 'should mention 2pp tolerance')
      assert.ok(content.includes('21.68%'), 'should include Lines degradation threshold')
      assert.ok(content.includes('73.97%'), 'should include Branches degradation threshold')
      assert.ok(content.includes('46.85%'), 'should include Functions degradation threshold')
    })

    it('包含历史声称 vs 实测对比表', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('历史声称'), 'should have history comparison section')
      assert.ok(content.includes('R205'), 'should reference R205')
      assert.ok(content.includes('R230'), 'should reference R230')
    })

    it('包含更新规则', () => {
      const content = readFile(baselinePath)
      assert.ok(content.includes('更新规则'), 'should have update rules section')
    })
  })

  describe('AC-5: 覆盖率回归检测', () => {
    const guardPath = 'scripts/architecture-guard.sh'

    it('architecture-guard.sh 文件存在', () => {
      assert.ok(fileExists(guardPath), 'architecture-guard.sh should exist')
    })

    it('architecture-guard.sh 是可执行的', () => {
      const stat = fs.statSync(path.join(ROOT, guardPath))
      const isExec = (stat.mode & 0o111) !== 0
      assert.ok(isExec, 'should be executable')
    })

    it('包含覆盖率回归检测逻辑', () => {
      const content = readFile(guardPath)
      assert.ok(content.includes('Regression'), 'should have regression detection')
    })

    it('容差为 2pp', () => {
      const content = readFile(guardPath)
      assert.ok(content.includes('REGRESSION_TOLERANCE=2'), 'tolerance should be 2pp')
    })

    it('解析基线文件', () => {
      const content = readFile(guardPath)
      assert.ok(content.includes('coverage-baseline.md'), 'should reference baseline file')
    })

    it('包含模块行数检查 (R226)', () => {
      const content = readFile(guardPath)
      assert.ok(content.includes('400') || content.includes('MAX_LINES'), 'should have module size check')
    })

    it('退化时 exit 1', () => {
      const content = readFile(guardPath)
      assert.ok(content.includes('exit 1'), 'should exit 1 on failure')
    })

    it('通过时 exit 0', () => {
      const content = readFile(guardPath)
      assert.ok(content.includes('exit 0'), 'should exit 0 on success')
    })
  })

  describe('Cross-validation: 门禁阈值与基线文档一致', () => {
    it('package.json 的 --lines 值 ≤ baseline Lines 覆盖率', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      const gateVal = parseInt(match[1], 10)
      // 基线 Lines = 23.68%, 门禁应 ≤ 基线
      assert.ok(gateVal <= 24, 'gate value should not exceed rounded baseline')
      assert.ok(gateVal >= 23, 'gate value should be at least floor of baseline')
    })

    it('package.json 的 --functions 值 ≤ baseline Functions 覆盖率', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      const gateVal = parseInt(match[1], 10)
      // 基线 Functions = 48.85%
      assert.ok(gateVal <= 49, 'gate value should not exceed rounded baseline')
      assert.ok(gateVal >= 48, 'gate value should be at least floor of baseline')
    })

    it('package.json 的 --branches 值 ≤ baseline Branches 覆盖率', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      const gateVal = parseInt(match[1], 10)
      // 基线 Branches = 75.97%
      assert.ok(gateVal <= 76, 'gate value should not exceed rounded baseline')
      assert.ok(gateVal >= 75, 'gate value should be at least floor of baseline')
    })
  })
})
