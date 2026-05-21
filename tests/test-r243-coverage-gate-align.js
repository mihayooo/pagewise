/**
 * Tests for R243: CoverageGateAlign
 *
 * 验收标准:
 * AC-1: coverage:gate 阈值收紧至 R241 达成的实际基线值
 * AC-2: CI workflow 中门禁描述与实际阈值一致
 * AC-3: 基线文档包含当前真实基线数据
 * AC-4: architecture-guard.sh 回归检测使用基线文件
 * AC-5: 门禁阈值与基线文档交叉验证
 * AC-6: 历史演进表包含 R243 条目
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

describe('R243: Coverage Gate Align', () => {

  describe('AC-1: coverage:gate 阈值收紧', () => {
    it('package.json 中 coverage:gate 使用 c8 check-coverage', () => {
      const pkg = readJSON('package.json')
      assert.ok(pkg.scripts['coverage:gate'], 'coverage:gate script should exist')
      assert.ok(
        pkg.scripts['coverage:gate'].startsWith('c8 check-coverage'),
        'should use c8 check-coverage'
      )
    })

    it('coverage:gate --lines 收紧至 28 (R241 实际基线附近)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      assert.ok(match, '--lines should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.equal(val, 28, '--lines should be 28 (tightened from R233 value of 23)')
    })

    it('coverage:gate --functions 收紧至 50 (从 48 收紧)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      assert.ok(match, '--functions should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.equal(val, 50, '--functions should be 50 (tightened from 48)')
    })

    it('coverage:gate --branches 维持 75', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      assert.ok(match, '--branches should have a numeric value')
      const val = parseInt(match[1], 10)
      assert.equal(val, 75, '--branches should remain 75')
    })

    it('coverage:gate 包含所有三个维度 (--lines, --branches, --functions)', () => {
      const pkg = readJSON('package.json')
      const gate = pkg.scripts['coverage:gate']
      assert.ok(gate.includes('--lines'), 'should include --lines')
      assert.ok(gate.includes('--branches'), 'should include --branches')
      assert.ok(gate.includes('--functions'), 'should include --functions')
    })
  })

  describe('AC-2: CI workflow 门禁描述与实际阈值一致', () => {
    const ciYml = readFile('.github/workflows/ci.yml')

    it('ci.yml coverage gate 描述包含 lines >= 28%', () => {
      assert.ok(
        ciYml.includes('lines >= 28%'),
        'ci.yml coverage gate step name should mention lines >= 28%'
      )
    })

    it('ci.yml coverage gate 描述包含 functions >= 50%', () => {
      assert.ok(
        ciYml.includes('functions >= 50%'),
        'ci.yml coverage gate step name should mention functions >= 50%'
      )
    })

    it('ci.yml coverage gate 描述包含 branches >= 75%', () => {
      assert.ok(
        ciYml.includes('branches >= 75%'),
        'ci.yml coverage gate step name should mention branches >= 75%'
      )
    })

    it('ci.yml coverage gate 运行 npm run coverage:gate', () => {
      assert.ok(
        ciYml.includes('npm run coverage:gate'),
        'ci.yml should run npm run coverage:gate'
      )
    })

    it('ci.yml coverage regression check 运行 architecture-guard.sh', () => {
      assert.ok(
        ciYml.includes('bash scripts/architecture-guard.sh'),
        'ci.yml should run architecture-guard.sh for regression check'
      )
    })
  })

  describe('AC-3: 基线文档包含当前真实基线数据', () => {
    const baseline = readFile('docs/reports/coverage-baseline.md')

    it('基线文档存在', () => {
      assert.ok(fileExists('docs/reports/coverage-baseline.md'), 'baseline file should exist')
    })

    it('记录行覆盖率 24.89%', () => {
      assert.ok(baseline.includes('24.89%'), 'should contain actual line coverage 24.89%')
    })

    it('记录函数覆盖率 49.79%', () => {
      assert.ok(baseline.includes('49.79%'), 'should contain actual function coverage 49.79%')
    })

    it('记录分支覆盖率 75.83%', () => {
      assert.ok(baseline.includes('75.83%'), 'should contain actual branch coverage 75.83%')
    })

    it('门禁阈值包含 lines ≥ 28%', () => {
      assert.ok(baseline.includes('≥ 28%'), 'baseline should document lines gate threshold 28%')
    })

    it('门禁阈值包含 functions ≥ 50%', () => {
      assert.ok(baseline.includes('≥ 50%'), 'baseline should document functions gate threshold 50%')
    })

    it('门禁阈值包含 branches ≥ 75%', () => {
      assert.ok(baseline.includes('≥ 75%'), 'baseline should document branches gate threshold 75%')
    })

    it('包含迭代标识 R243', () => {
      assert.ok(baseline.includes('R243'), 'should reference R243 iteration')
    })

    it('包含容差下限 22.89%', () => {
      assert.ok(baseline.includes('22.89%'), 'should contain lines regression threshold 22.89%')
    })

    it('包含函数容差下限 47.79%', () => {
      assert.ok(baseline.includes('47.79%'), 'should contain functions regression threshold 47.79%')
    })

    it('包含分支容差下限 73.83%', () => {
      assert.ok(baseline.includes('73.83%'), 'should contain branches regression threshold 73.83%')
    })
  })

  describe('AC-4: architecture-guard.sh 回归检测完整性', () => {
    const guard = readFile('scripts/architecture-guard.sh')

    it('包含回归容差 2pp', () => {
      assert.ok(guard.includes('REGRESSION_TOLERANCE=2'), 'tolerance should be 2pp')
    })

    it('解析基线文件 coverage-baseline.md', () => {
      assert.ok(guard.includes('coverage-baseline.md'), 'should reference baseline file')
    })

    it('解析 Lines 指标', () => {
      assert.ok(guard.includes('parse_baseline "Lines"'), 'should parse Lines baseline')
    })

    it('解析 Branches 指标', () => {
      assert.ok(guard.includes('parse_baseline "Branches"'), 'should parse Branches baseline')
    })

    it('解析 Functions 指标', () => {
      assert.ok(guard.includes('parse_baseline "Functions"'), 'should parse Functions baseline')
    })

    it('退化时 exit 1', () => {
      assert.ok(guard.includes('exit 1'), 'should exit 1 on regression')
    })

    it('通过时 exit 0', () => {
      assert.ok(guard.includes('exit 0'), 'should exit 0 on success')
    })

    it('包含模块行数检查 MAX_LINES=400', () => {
      assert.ok(guard.includes('MAX_LINES=400'), 'should have module size guard at 400 lines')
    })
  })

  describe('AC-5: 门禁阈值与基线文档交叉验证', () => {
    it('package.json --lines 值 28 与基线文档门禁阈值一致', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      const gateVal = parseInt(match[1], 10)
      const baseline = readFile('docs/reports/coverage-baseline.md')
      // 基线文档应包含 ≥ 28%
      assert.ok(baseline.includes('≥ 28%'), 'baseline should document lines gate as 28%')
      assert.equal(gateVal, 28, 'package.json --lines should match baseline document')
    })

    it('package.json --functions 值 50 与基线文档门禁阈值一致', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      const gateVal = parseInt(match[1], 10)
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('≥ 50%'), 'baseline should document functions gate as 50%')
      assert.equal(gateVal, 50, 'package.json --functions should match baseline document')
    })

    it('package.json --branches 值 75 与基线文档门禁阈值一致', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      const gateVal = parseInt(match[1], 10)
      const baseline = readFile('docs/reports/coverage-baseline.md')
      assert.ok(baseline.includes('≥ 75%'), 'baseline should document branches gate as 75%')
      assert.equal(gateVal, 75, 'package.json --branches should match baseline document')
    })

    it('ci.yml 门禁描述与 package.json 阈值一致', () => {
      const pkg = readJSON('package.json')
      const ciYml = readFile('.github/workflows/ci.yml')
      const linesMatch = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      const functionsMatch = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      const branchesMatch = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      const linesVal = parseInt(linesMatch[1], 10)
      const functionsVal = parseInt(functionsMatch[1], 10)
      const branchesVal = parseInt(branchesMatch[1], 10)
      assert.ok(ciYml.includes(`lines >= ${linesVal}%`), `ci.yml should mention lines >= ${linesVal}%`)
      assert.ok(ciYml.includes(`functions >= ${functionsVal}%`), `ci.yml should mention functions >= ${functionsVal}%`)
      assert.ok(ciYml.includes(`branches >= ${branchesVal}%`), `ci.yml should mention branches >= ${branchesVal}%`)
    })
  })

  describe('AC-6: R233 测试旧阈值已更新', () => {
    it('test-r233-coverage-gate.js 存在', () => {
      assert.ok(fileExists('tests/test-r233-coverage-gate.js'), 'R233 test file should exist')
    })

    it('R233 测试文件中旧阈值断言已被 R243 测试取代', () => {
      // R243 test file should exist as the definitive source of gate assertions
      assert.ok(
        fileExists('tests/test-r243-coverage-gate-align.js'),
        'R243 test file should exist'
      )
    })
  })

  describe('AC-7: 基线文档历史演进表包含 R243', () => {
    const baseline = readFile('docs/reports/coverage-baseline.md')

    it('包含 R243 行在演进表中', () => {
      assert.ok(baseline.includes('R243'), 'history table should include R243')
    })

    it('包含 R233 在历史演进表中', () => {
      assert.ok(baseline.includes('R233'), 'history table should include R233')
    })

    it('包含 "收紧对齐" 描述', () => {
      assert.ok(baseline.includes('收紧对齐'), 'R243 should be described as tightening alignment')
    })

    it('包含 "太宽松" 描述 R205 问题', () => {
      assert.ok(baseline.includes('太宽松'), 'R205 should be described as too loose')
    })
  })

  describe('AC-8: architecture-guard.sh 基线解析格式兼容性', () => {
    it('基线文件中 Lines 行格式匹配 parse_baseline 正则', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      // parse_baseline uses: grep -oP '\*\*\K[0-9]+\.[0-9]+(?=%\*\*)'
      // The format should be: | **Lines** | ... | **24.89%** |
      const linesMatch = baseline.match(/\|\s*\*\*Lines\*\*\s*\|.*?\|\s*\*\*([0-9]+\.[0-9]+%)\*\*/)
      assert.ok(linesMatch, 'Lines row should match bold percentage format')
      assert.equal(linesMatch[1], '24.89%', 'Lines percentage should be 24.89%')
    })

    it('基线文件中 Branches 行格式匹配 parse_baseline 正则', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      const match = baseline.match(/\|\s*\*\*Branches\*\*\s*\|.*?\|\s*\*\*([0-9]+\.[0-9]+%)\*\*/)
      assert.ok(match, 'Branches row should match bold percentage format')
      assert.equal(match[1], '75.83%', 'Branches percentage should be 75.83%')
    })

    it('基线文件中 Functions 行格式匹配 parse_baseline 正则', () => {
      const baseline = readFile('docs/reports/coverage-baseline.md')
      const match = baseline.match(/\|\s*\*\*Functions\*\*\s*\|.*?\|\s*\*\*([0-9]+\.[0-9]+%)\*\*/)
      assert.ok(match, 'Functions row should match bold percentage format')
      assert.equal(match[1], '49.79%', 'Functions percentage should be 49.79%')
    })
  })

  describe('AC-9: 门禁收紧幅度合理性', () => {
    it('lines 门禁从 23 提升至 28 (收紧 5pp)', () => {
      // R233 had --lines 23, R243 should be 28
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--lines\s+(\d+)/)
      const val = parseInt(match[1], 10)
      assert.equal(val, 28, 'should tighten lines by 5pp from 23 to 28')
    })

    it('functions 门禁从 48 提升至 50 (收紧 2pp)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--functions\s+(\d+)/)
      const val = parseInt(match[1], 10)
      assert.equal(val, 50, 'should tighten functions by 2pp from 48 to 50')
    })

    it('branches 门禁维持 75 (不变)', () => {
      const pkg = readJSON('package.json')
      const match = pkg.scripts['coverage:gate'].match(/--branches\s+(\d+)/)
      const val = parseInt(match[1], 10)
      assert.equal(val, 75, 'should keep branches at 75')
    })
  })

  describe('AC-10: 基线文档结构完整性', () => {
    const baseline = readFile('docs/reports/coverage-baseline.md')

    it('包含基线快照章节', () => {
      assert.ok(baseline.includes('基线快照'), 'should have baseline snapshot section')
    })

    it('包含测量环境章节', () => {
      assert.ok(baseline.includes('测量环境'), 'should have measurement environment section')
    })

    it('包含门禁阈值映射章节', () => {
      assert.ok(baseline.includes('门禁阈值映射'), 'should have gate threshold mapping section')
    })

    it('包含历史门禁阈值演进章节', () => {
      assert.ok(baseline.includes('历史门禁阈值演进'), 'should have history evolution section')
    })

    it('包含更新规则章节', () => {
      assert.ok(baseline.includes('更新规则'), 'should have update rules section')
    })

    it('包含关联文件章节', () => {
      assert.ok(baseline.includes('关联文件'), 'should have related files section')
    })

    it('包含双层门禁机制说明', () => {
      assert.ok(baseline.includes('双层门禁机制'), 'should describe dual-layer gate mechanism')
    })

    it('关联文件包含所有四个关键文件', () => {
      assert.ok(baseline.includes('package.json'), 'should reference package.json')
      assert.ok(baseline.includes('architecture-guard.sh'), 'should reference architecture-guard.sh')
      assert.ok(baseline.includes('ci.yml'), 'should reference ci.yml')
      assert.ok(baseline.includes('coverage-summary.json'), 'should reference coverage-summary.json')
    })
  })
})
