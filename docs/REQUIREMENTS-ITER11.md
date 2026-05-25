# 需求文档 — R296: 测试执行性能回归防火墙 TestPerfRegressionWall

> 作者: Plan Agent
> 日期: 2026-05-25
> 飞轮迭代: R11
> 复杂度: Medium

---

## 1. 用户故事

**作为** PageWise 项目的维护者，  
**我希望** `npm run test:ci` 的执行时间被 CI 硬性门禁守护，且覆盖率冲刺新增的测试文件自动归类到正确的测试目标，  
**以便** 历史上 16 次测试执行效率优化（R202-R287）均被后续迭代拖回的循环被永久切断，CI 流水线保持在 ≤35s 的健康水平。

---

## 2. 问题分析

### 2.1 历史退化模式

| 指标 | 数据 |
|------|------|
| R287 优化后耗时 | **31.3s**（首次达标 ≤35s） |
| R292 当前耗时 | **43.4s**（+12.1s / +39%） |
| 历史优化轮次 | 16 次（R202/R203/R205/R210/R214/R217/R223/R225/R231/R237/R247/R253/R258/R269/R273/R287） |
| 历史退化次数 | 16 次均在后续迭代被拖回 |
| 当前 test:ci 文件数 | ~210 个（排除 5 个已知慢文件后） |

### 2.2 根因分析

退化的根本原因是 **测试分类治理缺失**：每次覆盖率冲刺（如 R289 CoverageBreak32）新增大量测试文件后，这些文件被 `find tests -name 'test-*.js'` 自动纳入 `test:ci`，但其目的并非回归验证而是覆盖率提升。

当前退化来源（推断）：

| 来源 | 文件特征 | 耗时贡献（估计） | 正确归属 |
|------|---------|-----------------|---------|
| 覆盖率冲刺测试 | `test-coverage-sprint-*.js`、`test-r137-coverage-boost.js`、`tests/coverage-boost/*.js` | ~5-8s | `test:ci:coverage` |
| 覆盖率配置守护 | `test-r291-coverage-config-drift-guard.js` | ~1-2s | `test:ci:coverage` |
| 迭代回归测试 | `test-r197-version-sync.js`、`test-r208-release-build.js`、`test-r244-release-v321.js`、`test-r282-jsdoc-audit.js` | ~3-5s | `test:ci:release` / `test:ci:lint` |
| 基础设施测试 | `test-infra-health.js`、`test-r156-coverage-infra.js`、`test-r233-coverage-gate.js`、`test-r256-coverage-infra-fix.js` | ~2-3s | 可保留或移至 `test:ci:infra` |

### 2.3 当前 test:ci 排除状态

R287 已排除的文件（硬编码在 package.json 的 `-not -name` 列表中）：

```
test-e2e-*          → test:e2e
test-lint-r159.js   → test:ci:lint
test-r201-lint-*    → test:ci:lint
test-r221-lint-*    → test:ci:lint
test-eslint-infra.js → test:ci:lint
test-r284-cws-*     → (已排除)
```

R287 **未排除**但应当排除的文件：

- `tests/coverage-boost/test-coverage-sprint-*.js`（5 个文件）
- `tests/test-r137-coverage-boost.js`
- `tests/test-coverage-sprint-*.js`（1 个文件）
- `tests/test-r291-coverage-config-drift-guard.js`
- `tests/test-r197-version-sync.js`（发布验证）
- `tests/test-r208-release-build.js`（发布验证）
- `tests/test-r244-release-v321.js`（发布验证）
- `tests/test-r282-jsdoc-audit.js`（Lint/质量验证）
- `tests/test-r280-changelog-v340-fix.js`（CHANGELOG 验证）

---

## 3. 验收标准

| # | 验收标准 | 判定方式 |
|---|---------|---------|
| AC1 | `scripts/check-test-time.sh` 脚本执行 `npm run test:ci` 并计时，若耗时 >37s 则 exit 1（CI 硬性阻断） | 手动测试：构造 >37s 场景验证 exit 1；正常场景验证 exit 0 |
| AC2 | 当前 `npm run test:ci` 耗时 **≤35s**（排除覆盖率冲刺/发布验证/Lint 验证测试后） | 连续 3 次 `npm run test:ci` 均 ≤35s |
| AC3 | 覆盖率冲刺测试（文件名含 `coverage-boost`、`coverage-sprint`、`r291-coverage-config` 等关键词）从 `test:ci` 排除至 `test:ci:coverage` | `npm run test:ci:coverage` 包含这些文件，`npm run test:ci` 不包含 |
| AC4 | 发布验证测试（`test-r197-version-sync.js`、`test-r208-release-build.js`、`test-r244-release-v321.js`、`test-r280-changelog-*`、`test-r282-jsdoc-audit.js`）从 `test:ci` 排除至 `test:ci:release` | `npm run test:ci:release` 包含这些文件 |
| AC5 | 新增 ≥5 个测试验证门禁脚本逻辑（阈值判定、计时精度、exit code、文件分类规则、边界条件） | `node --test tests/test-check-test-time.js` 全部通过 |

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **计时精度** | 门禁脚本使用 `date +%s%N` 或 `SECONDS` bash 变量计时，精度 ≤1s |
| **阈值设计** | 硬性上限 37s（高于目标 35s 留 2s buffer，避免 CI 环境 CPU 抖动导致 flaky） |
| **排除规则** | 使用 `-not -name` 或 `-not -path` 模式匹配，与现有 `test:ci` 脚本风格一致 |
| **分类规则** | 基于文件名关键词匹配（`coverage-boost`/`coverage-sprint`/`coverage-config`/`release-build`/`version-sync`/`changelog`/`jsdoc-audit`），非目录结构 |
| **向后兼容** | `npm run test:ci` 的通过用例数不减少（排除的文件移至对应目标后仍可独立执行） |
| **CI 集成** | `check-test-time.sh` 在 CI workflow 的 test job 中作为 `test:ci` 的包装器执行（或作为独立 step 紧接 test:ci 之后） |
| **test:ci:coverage 完整性** | `test:ci:coverage` 现有脚本需同步更新，确保新排除的覆盖率冲刺测试被纳入（用于 c8 插桩） |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R287 (TestExecutionOpt15) | 前置 | 建立了当前 test:ci 排除模式和 31.3s 基线 |
| R289 (CoverageBreak32) | 前置（引入退化） | 新增大量覆盖率冲刺测试文件，导致退化至 43.4s |
| R295 (TestInfraReliability) | 前置 | 建立了 test-preflight.sh 和 test-infra-health.js |
| R296 输出 | 被依赖 | Phase AP 及后续所有迭代的 CI 性能基线守护 |
| CI workflow (ci.yml) | 需修改 | test job 需集成 check-test-time.sh 门禁 |

---

## 6. 实现要点

### 6.1 门禁脚本 `scripts/check-test-time.sh`

```
功能：包装 npm run test:ci，捕获执行时间，与阈值比较
输入：环境变量 TEST_TIME_THRESHOLD（默认 37，单位秒）
输出：执行时间 + PASS/FAIL 判定
退出码：0 = 通过，1 = 超时
日志：输出 `test:ci` 完整 stdout/stderr（不吞输出）
```

### 6.2 test:ci 排除规则更新

在 `package.json` 的 `test:ci` 脚本中追加排除模式：

```
-not -path 'tests/coverage-boost/*'
-not -name 'test-r137-coverage-boost.js'
-not -name 'test-coverage-sprint-*.js'
-not -name 'test-r291-coverage-config-drift-guard.js'
-not -name 'test-r197-version-sync.js'
-not -name 'test-r208-release-build.js'
-not -name 'test-r244-release-v321.js'
-not -name 'test-r280-changelog-*.js'
-not -name 'test-r282-jsdoc-audit.js'
```

### 6.3 新增测试目标脚本

```
test:ci:release  → test-r197 / test-r208 / test-r244 / test-r280-changelog / test-r282
test:ci:coverage → 现有 test:ci:coverage + tests/coverage-boost/* + test-r137 + test-coverage-sprint-* + test-r291
```

### 6.4 门禁测试 `tests/test-check-test-time.js`

5+ 个测试用例建议：

1. **AC-1**: 门禁脚本文件存在且可执行（`-x` 权限）
2. **AC-2**: 脚本 `--help` 或无参执行输出使用说明（非崩溃）
3. **AC-3**: 阈值判定逻辑 — mock 计时 <37s 输出 PASS + exit 0
4. **AC-4**: 阈值判定逻辑 — mock 计时 ≥37s 输出 FAIL + exit 1
5. **AC-5**: 环境变量覆盖 — `TEST_TIME_THRESHOLD=50` 可修改阈值
6. **AC-6**: 被排除的覆盖率冲刺文件不在 `npm run test:ci` 执行列表中（`--dry-run` 或解析脚本输出验证）
7. **AC-7**: 被排除的文件在 `npm run test:ci:coverage` 或 `npm run test:ci:release` 执行列表中

---

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 排除文件过多导致回归覆盖面不足 | 中 | 核心回归遗漏 | 仅排除覆盖率冲刺/发布验证/Lint 验证类文件，核心功能测试保留 |
| CI 环境 CPU 抖动导致 37s 阈值 flaky | 低 | 门禁误报 | 37s 阈值高于 35s 目标留 6% buffer；极端情况可调整环境变量 |
| 排除后 test:ci:coverage 覆盖率数据变化 | 低 | 覆盖率门禁波动 | 门禁阈值不变（28%/75%/50%），c8 仅在 test:ci:coverage 中插桩 |
| 未来新增测试文件仍可能拖慢 test:ci | 中 | 防线再次被突破 | check-test-time.sh 作为硬性门禁，任何超时都会被 CI 阻断 |

---

## 8. 不包含

- 不包含新增 lib 模块功能
- 不包含覆盖率门禁阈值调整（R243 职责）
- 不包含测试用例重写或合并
- 不包含 test:ci 并行化优化（属于 TestExecutionOpt 系列）
- 不包含 E2E 测试性能优化（R288 职责）

---

## 附录 A: 受影响文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `scripts/check-test-time.sh` | **新建** | CI 门禁脚本 |
| `package.json` | **修改** | test:ci 排除规则追加 + 新增 test:ci:release |
| `.github/workflows/ci.yml` | **修改** | test job 集成 check-test-time.sh |
| `tests/test-check-test-time.js` | **新建** | 门禁脚本测试 |
| `docs/CHANGELOG.md` | **修改** | 新增 R296 条目 |

---

## 附录 B: 测试执行时间基线

| 迭代 | test:ci 耗时 | 用例数 | 说明 |
|------|-------------|--------|------|
| R202 | 45.4s | 6977 | 优化前基线 |
| R287 | **31.3s** | 7907 | 历史最优（达标 ≤35s） |
| R292 | 43.4s | ~7966 | 当前退化状态 |
| **R296 目标** | **≤35s** | ≥7800 | 本轮目标 |

---

## 附录 C: 测试分类目录

| 类别 | test 脚本名 | 包含文件 | 用途 |
|------|------------|---------|------|
| **核心回归** | `test:ci` | 所有 test-*.js（排除以下类别） | CI 主门禁，≤35s |
| **覆盖率冲刺** | `test:ci:coverage` | coverage-boost/\*、coverage-sprint-\*、r137-boost、r291-config-drift | c8 插桩覆盖率统计 |
| **发布验证** | `test:ci:release` | r197-version-sync、r208-release-build、r244-release-v321、r280-changelog、r282-jsdoc-audit | 版本/CHANGELOG/发布脚本验证 |
| **Lint 验证** | `test:ci:lint` | lint-r159、r201-lint、r221-lint、eslint-infra | ESLint 规则验证 |
| **E2E** | `test:e2e` | e2e-chrome/test-smoke.js | 浏览器端冒烟 |
