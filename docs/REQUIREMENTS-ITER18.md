# 需求文档 — 迭代 18: 测试执行效率九期 (TestExecutionOpt9)

> **需求编号**: R246
> **创建日期**: 2026-05-21
> **状态**: 📋 待开发
> **复杂度**: Medium
> **飞轮迭代**: R18

---

## 1. 背景与问题

R242（测试执行效率优化八期）将 `npm run test:ci` 的执行策略升级为 `--test-concurrency=16` 高并行度，并将 R241 新增的覆盖率测试文件分离组织，但 **实际执行时间仍为 38.5s，未达到 ≤35s 的目标**（差距 3.5s / 9%）。

**历史回顾**: 自 R135 起，测试执行效率优化已进行八轮（R135 → R152 → R198 → R202 → R227 → R232 → R237 → R242），每轮均在 ≤30s 的目标上失败。核心矛盾：**覆盖率冲刺（R241/R245）不断引入大量新测试文件**，每次新增数十个覆盖零覆盖模块的测试，每个文件加载数十个 `lib/` 模块的 `import`，带来显著的模块加载和解析开销。

**当前执行时间分解**（预估）:
- 主测试流（历史文件 + 核心测试）：~25s
- R241 新增覆盖率测试文件（~60 个文件）：~8s
- R245 新增覆盖率测试文件：~5s
- 覆盖率提升测试与主测试流并行重叠后仍拖累整体：3.5s 溢出

**本轮策略**: 不再单纯追求"让已有文件跑得更快"，而是 **隔离"重量级"测试文件**——将 R241/R245 新增的大量 import 零覆盖模块的测试从主 `test:ci` 流中分离，移入独立子目录 `tests/coverage-boost/`，通过 `test:ci:coverage` 单独执行。主测试流只保留核心功能测试，实现轻量化。

---

## 2. 用户故事

**作为** PageWise 项目的开发者 / CI 流水线维护者，
**我希望** 核心测试流 `npm run test:ci` 的执行时间从 38.5s 降至 ≤35s，
**以便** 每次代码提交后的 CI 反馈循环更短，开发者迭代效率更高；同时覆盖率测试不丢失，通过 `test:ci:coverage` 单独按需执行。

---

## 3. 验收标准

### AC-1: `npm run test:ci` 执行时间 ≤35s

**Given** 当前 `npm run test:ci` 执行耗时 38.5s（7,551 用例）
**When** 将 R241/R245 新增的覆盖率提升测试文件（大量 import 零覆盖模块的文件）从 `test:ci` 的文件发现路径中排除，移入 `tests/coverage-boost/` 子目录
**Then** `npm run test:ci` 执行时间应 **≤35s**

**验证方式**:
1. 执行 `time npm run test:ci` 三次取中位数
2. 断言 wall-clock time ≤ 35s
3. 用例通过数与排除前相比确认覆盖率测试文件已正确排除（通过数会减少，对应移出文件的用例数）

### AC-2: `npm run test:smoke` 执行时间 ≤3s

**Given** 当前 `npm run test:smoke` 包含 11 个核心模块测试文件
**When** 确认 smoke test 集合未被 R246 修改影响（不包含新增/排除文件）
**Then** `npm run test:smoke` 执行时间应 **≤3s**

**验证方式**:
1. 执行 `time npm run test:smoke`
2. 断言 wall-clock time ≤ 3s

### AC-3: Top-10 最慢测试文件分析报告

**Given** 当前缺少按单文件耗时排序的精确数据
**When** 使用 `node --test --test-reporter=json` 或其他可行方案采集每个测试文件的独立执行时间
**Then** 输出 Top-10 最慢测试文件清单（文件名 + 耗时 + 用例数），保存至 `docs/reports/test-perf-top10.md`

**验证方式**:
1. 读取 `docs/reports/test-perf-top10.md`
2. 断言包含 ≥10 条记录，每条含文件名、耗时、用例数
3. 确认 R241/R245 新增文件在 Top-10 中有所体现（证实其为性能瓶颈）

### AC-4: 覆盖率测试文件独立隔离

**Given** R241 和 R245 新增的测试文件旨在提升行覆盖率/函数覆盖率，它们通过大量 `import` 加载零覆盖模块，是执行时间增长的主因
**When** 将这些文件移至 `tests/coverage-boost/` 子目录
**Then** 满足以下条件：
1. `test:ci` 的 `find` 命令排除 `tests/coverage-boost/` 路径（不拖慢主测试流）
2. `test:ci:coverage` 包含 `tests/coverage-boost/` 下所有测试文件（覆盖率度量不丢失）
3. `test:coverage`（c8 包裹执行）仍能统计到覆盖率提升测试贡献的行/函数覆盖
4. `coverage:gate` 阈值不受影响（排除文件仅影响 test:ci 执行时间，不影响覆盖率统计）

**验证方式**:
1. 确认 `tests/coverage-boost/` 目录存在且包含文件
2. 确认 `npm run test:ci` 不执行 `tests/coverage-boost/` 下的文件
3. 确认 `npm run test:ci:coverage` 包含 `tests/coverage-boost/` 下的文件
4. 执行 `npm run test:coverage` → `npm run coverage:gate`，确认门禁仍通过

### AC-5: 用例总数不减少

**Given** 当前 7,551 个测试用例全部通过
**When** 将覆盖率测试文件移入子目录
**Then** 全量测试执行（`test:all` 或 `test:ci:coverage`）的用例总数不变（7,551+），不丢失任何用例

**验证方式**:
1. 执行 `npm run test:ci:coverage`（包含所有文件），确认 pass 计数 ≥ 7,551
2. 对比 R245 结束时的用例数，确认无减少

### AC-6: Top-3 最慢文件拆分为 ≤30 用例的小文件

**Given** Top-10 分析完成后，Top-3 最慢的单文件（预计 >1s，内含 >30 用例）
**When** 将每个最慢文件拆分为多个 ≤30 用例的子文件
**Then** 拆分后：
1. 每个子文件用例数 ≤ 30
2. 拆分前后总用例数不变
3. 子文件仍在 `tests/coverage-boost/` 目录下（不拖慢主测试流）

**验证方式**:
1. 统计拆分前后文件数和总用例数
2. 确认每个子文件 `grep -c 'test('` ≤ 30
3. 确认拆分后所有用例通过

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **不修改 lib/ 功能代码** | 本轮仅调整测试文件组织结构和执行脚本，不改动任何 lib/ 模块 |
| **覆盖率门禁不可降级** | `coverage:gate` 阈值（lines ≥28 / functions ≥50 / branches ≥75）只可持平或收紧，不可放宽 |
| **覆盖率数据完整性** | 移入 `tests/coverage-boost/` 的测试文件必须仍被 `test:ci:coverage` 和 `test:coverage` 包含，确保 c8 能统计其贡献的覆盖率 |
| **向后兼容 test:smoke** | `test:smoke` 脚本不修改（已是最小子集），仅验证其执行时间 |
| **`--test-concurrency` 维持 16** | 并行度不降低，确保排除重量级文件后充分利用并行能力 |
| **Node.js --test 限制** | Node.js 内置 test runner 的 `--test-reporter=json` 可能不输出单文件粒度的耗时，需评估替代方案（如 `--test-reporter=spec` + 时间戳解析，或自定义脚本逐文件计时） |
| **向后兼容 CI workflow** | `.github/workflows/` 中的 CI 配置不需修改（`npm run test:ci` 脚本变化自动生效） |
| **文件移动而非文件删除** | 覆盖率测试文件是物理移动到子目录，不是删除，确保 `test:ci:coverage` 可发现 |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R241 CoverageRealBreak30 | 前置 | 已完成，新增 ~60 个覆盖率测试文件（当前在 `tests/` 根目录），是本轮移动/隔离的主要对象 |
| R242 TestExecutionOpt8 | 前置 | 已完成，建立了 `--test-concurrency=16` 并行策略和文件分离基础，但 38.5s 未达 ≤35s 目标 |
| R245 CoverageGatePass | 前置 | 已完成，新增覆盖率测试进一步增加了 `test:ci` 执行时间 |
| R243 CoverageGateAlign | 前置 | 门禁阈值已硬化（lines 28 / functions 50 / branches 75），R246 不能降低 |
| Node.js 内置 test runner | 运行时依赖 | `node --test` 提供文件发现、并行执行和 reporter 功能 |
| `c8` (v10.1.3) | 工具依赖 | 覆盖率统计工具，需确保 `test:coverage` 仍能覆盖 `tests/coverage-boost/` 下文件 |

---

## 6. 变更影响范围

| 文件/目录 | 变更类型 | 变更内容 |
|-----------|---------|---------|
| `tests/coverage-boost/` | **新建目录** | 存放从 `tests/` 移入的 R241/R245 覆盖率提升测试文件 |
| `tests/test-r241-*.js` (60+ 个) | **移动** → `tests/coverage-boost/` | R241 新增的覆盖率测试文件从 `tests/` 根目录移入子目录 |
| `tests/test-r245-*.js` (N 个) | **移动** → `tests/coverage-boost/` | R245 新增的覆盖率测试文件同上 |
| `package.json` → `test:ci` | **修改** | `find` 命令新增 `-not -path 'tests/coverage-boost/*'` 排除条件 |
| `package.json` → `test:ci:coverage` | **修改** | `find` 命令移除 coverage-boost 排除条件（确保包含所有文件） |
| Top-3 最慢文件（拆分后） | **拆分 + 移动** | 一个大文件拆为多个 ≤30 用例的小文件，均在 `tests/coverage-boost/` 下 |
| `docs/reports/test-perf-top10.md` | **新建** | Top-10 最慢测试文件分析报告 |
| `docs/REQUIREMENTS-ITER18.md` | **本文档** | 需求归档 |

**不受影响的文件**: `lib/` 下所有功能代码、`manifest.json`、CI workflow 配置（`.github/workflows/`）、`tests/test-smoke.js`、已有测试文件的断言逻辑。

---

## 7. 执行策略

### 7.1 性能分析（Step 1）

```
Step 1: 单文件耗时采集
  ├─ 方案 A: node --test --test-reporter=json --test-concurrency=1 逐文件计时
  │   └─ 解析 JSON 输出中每个 test file 的 start/end timestamp
  ├─ 方案 B: 自定义脚本 scripts/test-perf.sh
  │   └─ 遍历 tests/test-*.js，逐个执行并计时，输出 CSV
  └─ 方案 C: npm run test:ci -- --test-reporter=spec + 时间戳差值
      └─ 解析 spec 输出中每个 suite 的耗时
  → 输出: docs/reports/test-perf-top10.md
```

### 7.2 文件隔离（Step 2）

```
Step 2: 识别并移动覆盖率提升测试文件
  ├─ 识别标准:
  │   ├─ 文件名匹配 test-r241-*.js 或 test-r245-*.js
  │   ├─ 或: Top-10 最慢文件中的覆盖率测试集
  │   └─ 或: 文件 import 了 ≥5 个零覆盖 lib/ 模块的测试
  ├─ 移动: tests/test-r241-*.js → tests/coverage-boost/test-r241-*.js
  ├─ 移动: tests/test-r245-*.js → tests/coverage-boost/test-r245-*.js
  └─ 修改 package.json:
      ├─ test:ci: 新增 -not -path 'tests/coverage-boost/*'
      └─ test:ci:coverage: 移除该排除条件（确保覆盖率统计完整）
```

### 7.3 慢文件拆分（Step 3）

```
Step 3: Top-3 最慢文件拆分
  ├─ 选择: Step 1 中 Top-3 最慢（>1s 且 >30 用例）的文件
  ├─ 拆分策略: 按用例功能域/模块域分组，每组 ≤30 用例
  │   └─ 如: test-r245-coverage-boost.js (80 用例)
  │       → test-r245-coverage-boost-bookmark.js (25 用例)
  │       → test-r245-coverage-boost-knowledge.js (25 用例)
  │       → test-r245-coverage-boost-utils.js (30 用例)
  └─ 验证: 拆分后总用例数不变，全部通过
```

### 7.4 验证闭环（Step 4）

```
Step 4: 四步验证
  ├─ A: time npm run test:ci → ≤35s, 0 fail
  ├─ B: time npm run test:smoke → ≤3s
  ├─ C: npm run test:ci:coverage → pass ≥ 7,551（用例不丢失）
  ├─ D: npm run test:coverage → npm run coverage:gate → exit code 0
  └─ E: docs/reports/test-perf-top10.md 已生成
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
- 不删除任何测试文件（仅移动和拆分）
- 不修改 `tests/test-smoke.js` 的文件列表
- 不追求 ≤30s 目标（R246 目标为 ≤35s，≤30s 留给后续迭代）

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Node.js `--test-reporter=json` 不输出单文件粒度耗时，Top-10 分析无法通过 JSON 解析完成 | 中 | 低 | 回退到自定义脚本逐文件计时（`for f in tests/test-*.js; do time node --test "$f"; done`） |
| 移入 `tests/coverage-boost/` 后 `test:coverage`（c8）无法发现子目录文件 | 低 | 高 | `test:ci:coverage` 的 `find` 命令确保包含 `tests/coverage-boost/`；验证 c8 输出中仍有覆盖率提升文件的统计 |
| 排除覆盖率文件后 `test:ci` 用例数减少但时间降幅不足（≤38.5s 但 >35s） | 中 | 中 | 配合 Top-3 慢文件拆分：拆分大文件可提升 `--test-concurrency=16` 的并行效率（更多小文件 → 更均匀分配到 16 个 worker） |
| 拆分 Top-3 慢文件后，子文件的 import 语句重复导致模块加载总开销不变 | 低 | 低 | Node.js test runner 每个文件独立进程，模块加载确实重复；但拆分后并行调度更均衡，总体 wall-clock time 可下降 |
| `coverage:gate` 门禁因排除文件后覆盖率下降而失败 | 低 | 高 | `test:ci:coverage` 仍包含所有文件，`npm run test:coverage` 基于 `test:ci:coverage` 运行，覆盖率统计完整；门禁不受影响 |

---

## 10. 验收检查清单

- [ ] `time npm run test:ci` ≤ 35s（三次中位数）
- [ ] `time npm run test:smoke` ≤ 3s
- [ ] `npm run test:ci` → 0 fail
- [ ] `npm run test:ci:coverage` → pass ≥ 7,551（用例不丢失）
- [ ] `npm run test:coverage` → 行覆盖率 ≥28%、函数覆盖率 ≥50%、分支覆盖率 ≥75%
- [ ] `npm run coverage:gate` → exit code 0
- [ ] `tests/coverage-boost/` 目录存在且包含 R241/R245 移入的文件
- [ ] `test:ci` 的 `find` 命令排除 `tests/coverage-boost/`
- [ ] `test:ci:coverage` 的 `find` 命令包含 `tests/coverage-boost/`
- [ ] `docs/reports/test-perf-top10.md` 已生成，含 ≥10 条记录
- [ ] Top-3 最慢文件已拆分为 ≤30 用例的子文件
- [ ] 拆分前后总用例数不变
- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] 不修改任何 `lib/` 文件

---

*需求文档由 Plan Agent 生成于 2026-05-21*
