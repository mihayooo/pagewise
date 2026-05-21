# 需求文档 — 迭代 17: 覆盖率门禁三项达标冲刺 (CoverageGatePass)

> **需求编号**: R245
> **创建日期**: 2026-05-21
> **状态**: 📋 待开发
> **复杂度**: Medium
> **飞轮迭代**: R17

---

## 1. 背景与问题

R243 完成了覆盖率门禁硬化，将 `coverage:gate` 阈值从虚高值收紧至实测基线附近（lines 28 / functions 50 / branches 75）。然而 R244 发布 v3.2.1 时的实测数据显示，**三项门禁中有两项未通过**：

| 维度 | 实测值 (R241 后) | 门禁阈值 | 差距 | 状态 |
|------|-----------------|---------|------|------|
| **行覆盖率** | 24.89% (12,737/51,171) | ≥ 28% | **−3.11pp** (需新增覆盖 ~1,590 行) | ❌ 未通过 |
| **函数覆盖率** | 49.79% (471/946) | ≥ 50% | **−0.21pp** (需新增覆盖 ~2 个函数) | ❌ 未通过 |
| **分支覆盖率** | 75.83% (1,970/2,599) | ≥ 75% | +0.83pp 余量 | ✅ 通过 |

**根因分析**: 历史 R205/R216/R222/R225/R230/R236/R241 七次覆盖率冲刺均未实现持续达标，根因始终相同——**~38,000 行零覆盖模块在测试中从未被 `import` 加载**，导致 c8 (V8 native coverage) 无法插桩这些模块。仅靠提升已有模块的边界用例覆盖无法突破瓶颈，必须将零覆盖模块纳入测试范围。

**本轮目标**: 务实聚焦——行覆盖率突破 28%（+3.11pp, ~1,590 行）、函数覆盖率突破 50%（+0.21pp, ~2 个函数），使三项门禁全部通过。

---

## 2. 用户故事

**作为** PageWise 项目的质量保障工程师，
**我希望** 覆盖率门禁（行 ≥28%、函数 ≥50%、分支 ≥75%）三项全部通过，
**以便** CI 流水线能真正阻断覆盖率退化，杜绝历史反复出现的"声称达标实测未过"问题。

---

## 3. 验收标准

### AC-1: 行覆盖率 ≥28%（门禁通过）

**Given** 当前行覆盖率 24.89%（12,737/51,171），门禁阈值 ≥28%
**When** 为 Top-10 零覆盖纯逻辑模块编写测试并通过 `import` 加载目标模块（确保 c8 可插桩）
**Then** 实测行覆盖率应 **≥28%**（新增覆盖 ≥1,590 行）

**验证方式**:
1. 执行 `npm run test:coverage`
2. 读取 `coverage/coverage-summary.json` 中 `total.lines.pct`
3. 断言 `pct >= 28.0`
4. 同步验证 `npm run coverage:gate` 退出码为 0

### AC-2: 函数覆盖率 ≥50%（门禁通过）

**Given** 当前函数覆盖率 49.79%（471/946），门禁阈值 ≥50%
**When** 定位未被调用的关键函数（按函数体行数降序），为 ≥2 个函数新增直接调用测试
**Then** 实测函数覆盖率应 **≥50%**（新增覆盖 ≥2 个函数）

**验证方式**:
1. 执行 `npm run test:coverage`
2. 读取 `coverage/coverage-summary.json` 中 `total.functions.pct`
3. 断言 `pct >= 50.0`

### AC-3: 分支覆盖率维持 ≥75%

**Given** 当前分支覆盖率 75.83%，门禁阈值 ≥75%，余量仅 0.83pp
**When** 新增测试用例引入新的代码分支覆盖
**Then** 分支覆盖率不得退化至 <75%

**验证方式**:
1. 执行 `npm run test:coverage`
2. 读取 `coverage/coverage-summary.json` 中 `total.branches.pct`
3. 断言 `pct >= 75.0`

### AC-4: 新增测试用例 ≥40 个

**Given** 当前 7,551 个测试用例全部通过
**When** 为零覆盖模块和未覆盖函数编写新测试
**Then** 新增用例数 ≥40，且全部通过（新增后总数 ≥7,591）

**验证方式**:
1. 执行 `npm run test:ci`，解析输出的 pass 计数
2. 断言 pass ≥ 7,591 且 fail = 0

### AC-5: 覆盖率基线文档更新

**Given** `docs/reports/coverage-baseline.md` 记录了 R243 的基线快照（行 24.89%、函数 49.79%、分支 75.83%）
**When** R245 完成覆盖率提升后
**Then** 更新 `docs/reports/coverage-baseline.md`：
1. 基线快照表中的行/函数覆盖率数据刷新为 R245 实测值
2. 门禁阈值映射表更新（若 `coverage:gate --lines` 收紧至 30，则同步记录）
3. 历史门禁阈值演进表追加 R245 行
4. 测量环境和用例数更新

**验证方式**: 读取 `docs/reports/coverage-baseline.md`，断言基线数据为 R245 实测值。

### AC-6: 覆盖率门禁阈值可能收紧

**Given** R245 完成后行覆盖率确认稳定 ≥28%
**When** 若实测行覆盖率 ≥30%
**Then** 将 `coverage:gate --lines` 从 28 收紧至 30，为后续迭代建立更高基线；若实测在 28%-30% 之间则维持 28 不变

**验证方式**: 读取 `package.json` 中 `coverage:gate` 脚本，确认阈值与实测值对齐。

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **c8 插桩前提** | 新增测试文件必须通过 `import`（ES Module import）加载目标模块，而非仅 mock 模块接口。只有被 import 加载的模块才会被 c8 V8 coverage 引擎插桩统计 |
| **零 Chrome API 依赖优先** | 优先选择无 `chrome.*` API 依赖的纯逻辑/工具函数模块，降低 mock 复杂度，提高测试稳定性 |
| **零副作用** | 新增测试不得修改已有测试文件或已有 lib 模块的运行时行为 |
| **门禁不可降级** | `coverage:gate` 阈值只可持平或收紧，不可放宽 |
| **测试执行时间约束** | 新增测试不得使 `npm run test:ci` 执行时间显著增长（当前 38.5s，上限 45s） |
| **向后兼容** | 不修改任何 lib 模块的功能代码，仅新增测试文件 |
| **覆盖率报告格式** | 必须使用 `c8 --reporter=json` 或 `--reporter=json-summary` 生成机器可读的覆盖率数据 |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R241 CoverageRealBreak30 | 前置 | 已完成零覆盖模块 Top-20 识别和首批补测，为 R245 提供了模块筛选基础 |
| R243 CoverageGateAlign | 前置 | 门禁阈值已硬化至 lines 28 / functions 50 / branches 75 |
| R244 ReleaseV321 | 前置 | v3.2.1 已发布，测试基线 7,551 pass / 0 fail 稳定 |
| `c8` (v10.1.3) | 工具依赖 | V8 native coverage 工具，生成覆盖率报告 |
| `coverage/coverage-summary.json` | 数据依赖 | c8 生成的当前覆盖率详细数据，用于定位零覆盖模块和未覆盖函数 |
| `docs/reports/coverage-baseline.md` | 文档依赖 | R243 建立的覆盖率基线文档，R245 需更新 |
| `scripts/architecture-guard.sh` | 脚本依赖 | R243 添加的覆盖率回归检测脚本，若实测退化 >2pp 则 CI fail |

---

## 6. 变更影响范围

| 文件 | 变更类型 | 变更内容 |
|------|---------|---------|
| `tests/test-r245-coverage-boost-*.js` | **新建** (×5-10) | 为零覆盖模块和未覆盖函数编写的测试文件 |
| `docs/reports/coverage-baseline.md` | 修改 | 更新基线快照数据和门禁阈值映射 |
| `package.json` → `coverage:gate` | 可能修改 | 若行覆盖率确认 ≥30%，收紧 `--lines` 阈值至 30 |
| `docs/REQUIREMENTS-ITER17.md` | 本文档 | 需求归档 |

**不受影响的文件**: `lib/` 下所有功能代码、`manifest.json`、`scripts/` 下现有脚本、`.github/workflows/` CI 配置、已有测试文件。

---

## 7. 执行策略

### 7.1 行覆盖率提升路径（+1,590 行 → 达到 28%）

```
Step 1: c8 分析
  └─ 运行 c8 report --reporter=json，解析每个模块的 lines.covered / lines.total
  └─ 按 lines.total 降序排列零覆盖模块（lines.covered == 0）
  └─ 筛选 Top-20，标注是否有 chrome.* API 依赖

Step 2: 模块筛选
  └─ 从 Top-20 中筛选纯逻辑/工具函数模块（无 chrome.* 依赖）
  └─ 优先选择 lines.total ≥ 100 的模块（投入产出比最高）
  └─ 预估新增覆盖行数：10 个模块 × 平均 200 行 = 2,000 行

Step 3: 编写测试
  └─ 每个目标模块创建独立测试文件: tests/test-r245-coverage-boost-{module-name}.js
  └─ 每模块 ≥5 个用例，覆盖主路径 + 边界情况 + 异常路径
  └─ 关键: 必须通过 `import ModuleName from '../lib/module-name.js'` 加载模块

Step 4: 验证
  └─ npm run test:coverage → 读取 coverage-summary.json → 断言 lines.pct ≥ 28%
```

### 7.2 函数覆盖率提升路径（+2 个函数 → 达到 50%）

```
Step 1: c8 分析
  └─ 运行 c8 report --reporter=json，解析每个函数的覆盖状态
  └─ 筛选未覆盖函数中函数体行数最大的 Top-10
  └─ 优先选择已被 Step 7.1 覆盖的模块中的函数（一次 import 覆盖多个函数）

Step 2: 针对性补测
  └─ 对未覆盖的 ≥2 个函数编写直接调用测试
  └─ 确保测试 import 了包含目标函数的模块
  └─ 测试直接调用函数并验证返回值/副作用

Step 3: 验证
  └─ npm run test:coverage → 读取 coverage-summary.json → 断言 functions.pct ≥ 50%
```

### 7.3 三步验证闭环

```
Step A: npm run test:ci → 0 fail, ≥7,591 pass
Step B: npm run test:coverage → lines ≥28%, functions ≥50%, branches ≥75%
Step C: npm run coverage:gate → exit code 0
Step D: 更新 docs/reports/coverage-baseline.md
Step E: 若 lines ≥30% → 收紧 coverage:gate --lines 至 30
```

---

## 8. 不在范围内

- 不修改任何 `lib/` 功能代码
- 不修改 CI workflow 配置（`.github/workflows/`）
- 不执行版本号 bump（版本归档留给 R249 ReleaseV322）
- 不修改 CHANGELOG.md（归档留给 R249）
- 不新增功能模块
- 不修改已有测试文件的断言逻辑
- 不放宽任何覆盖率门禁阈值
- 不执行 Chrome Web Store 提交

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 零覆盖模块全部依赖 chrome.* API，mock 成本高 | 中 | 中 | 优先选纯逻辑模块；对 Chrome API 依赖模块编写最小化 mock（仅 stub 被测函数所需的 API） |
| 新增测试文件引入的 import 加载开销导致 test:ci 时间增长 | 中 | 低 | 控制单文件用例数 ≤30；若超时则拆分为更小的文件 |
| 覆盖率提升恰好卡在 28% 边界（如 27.9%），门禁未通过 | 低 | 高 | 预估需要覆盖 1,590 行，实际计划覆盖 2,000+ 行（10 模块 × 200 行），留 25% 余量 |
| 函数覆盖率卡在 49.99%，因 0.21pp 差距极其微小 | 低 | 中 | 除目标 2 个函数外，额外覆盖 3-5 个函数作为余量 |
| 分支覆盖率因新增代码引入未覆盖分支而退化 | 低 | 中 | 新增测试覆盖主路径和主要异常路径，确保分支覆盖不降反升 |

---

## 10. 验收检查清单

- [ ] `npm run test:ci` → 0 fail, ≥7,591 pass
- [ ] `npm run test:coverage` → 行覆盖率 ≥28%
- [ ] `npm run test:coverage` → 函数覆盖率 ≥50%
- [ ] `npm run test:coverage` → 分支覆盖率 ≥75%
- [ ] `npm run coverage:gate` → exit code 0
- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] 新增测试文件 ≥5 个（对应 ≥5 个零覆盖模块）
- [ ] 每个新增测试文件通过 `import` 加载目标模块（非纯 mock）
- [ ] `docs/reports/coverage-baseline.md` 基线数据已更新
- [ ] 若行覆盖率 ≥30%，`coverage:gate --lines` 已收紧至 30
- [ ] `scripts/architecture-guard.sh` 覆盖率回归检测仍通过
- [ ] 新增测试执行时间未导致 `npm run test:ci` 超过 45s

---

*需求文档由 Plan Agent 生成于 2026-05-21*
