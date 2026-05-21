# 需求文档 — 迭代 16: 全量回归与 v3.2.1 发布收尾 (ReleaseV321)

> **需求编号**: R244
> **创建日期**: 2026-05-21
> **状态**: 📋 待开发
> **复杂度**: Simple
> **飞轮迭代**: R16

---

## 1. 背景与问题

R240-R243 四轮迭代完成了版本断言修复、行覆盖率务实突破 30%、测试执行效率优化、覆盖率门禁硬化等关键质量改进。当前版本仍标记为 3.2.0，但代码质量基线已与 R231 发布 v3.2.0 时存在显著差异：

| 维度 | v3.2.0 发布时 (R231) | 当前 (R243 后) | 变化 |
|------|---------------------|---------------|------|
| 行覆盖率 | ~23.68% | **≥28%** (门禁 28%) | +4pp+ |
| 函数覆盖率 | ~48% | **≥50%** (门禁 50%) | +2pp+ |
| 覆盖率门禁 | 虚高（声称 50% 实测 23%） | **硬化至实测基线** | 诚实化 |
| 测试执行时间 | ~38.5s | **≤35s** (目标) | −3.5s+ |
| 版本断言 | 断言 3.1.0（过时） | **断言 3.2.0（同步）** | 修复 |
| 测试用例数 | ~7,484 | **≥7,611** | +127+ |

**核心问题**: 四轮质量改进累积未归档为正式发布版本，CHANGELOG 和 Release Notes 缺失 R240-R243 的变更记录，版本号停留在 3.2.0 无法区分改进前后的产物。

**目标**: 通过一次发布收尾迭代，将所有质量改进固化为 v3.2.1 正式发布。

---

## 2. 用户故事

**作为** PageWise 项目的维护者，
**我希望** 将 R240-R243 的全部质量改进归档为 v3.2.1 正式版本，
**以便** 用户和 CI 流水线能通过版本号区分改进前后的构建产物，且发布包通过所有自动化检查。

---

## 3. 验收标准

### AC-1: 全量测试通过且用例数达标

**Given** R240-R243 已合入 master
**When** 执行 `npm run test:ci`
**Then** 结果应满足：
- **0 fail** — 所有用例全部通过
- **≥7,611 pass** — 用例总数不低于 R241 新增后的基线
- **0 skip** — 无被跳过的 CI 用例（E2E 等非 CI 用例不计入）

**验证方式**: 执行 `npm run test:ci`，解析输出的 pass/fail/skip 计数。

### AC-2: Lint 零问题

**Given** ESLint 配置为 `--max-warnings 0`
**When** 执行 `npm run lint`
**Then** 结果应为 **0 errors, 0 warnings**，退出码为 0。

**验证方式**: 执行 `npm run lint`，确认退出码为 0 且无任何输出行含 "error" 或 "warning"。

### AC-3: 行覆盖率 ≥30%（实测验证）

**Given** 覆盖率门禁在 R243 已硬化至 `--lines 28 --functions 50 --branches 75`
**When** 执行 `npm run test:coverage` 并读取覆盖率报告
**Then** 实测行覆盖率应 **≥30%**（高于门禁阈值 28%，为后续迭代留余量）

**验证方式**:
1. 执行 `npm run test:coverage`
2. 读取 `coverage/coverage-summary.json` 中 `total.lines.pct`
3. 断言 `pct >= 30.0`
4. 同步验证 `npm run coverage:gate` 通过

### AC-4: 测试执行效率 ≤35s

**Given** R242 已对测试套件进行并行分片优化
**When** 执行 `npm run test:ci` 并计时
**Then** 总执行时间应 **≤35 秒**

**验证方式**: `time npm run test:ci`，记录 wall-clock 时间，断言 ≤35s。

### AC-5: 版本号同步 bump 至 3.2.1

**Given** 当前 `package.json` 和 `manifest.json` 版本均为 `3.2.0`
**When** 执行版本号更新
**Then** 以下三个位置的版本号必须一致为 `3.2.1`：
1. `package.json` → `"version": "3.2.1"`
2. `manifest.json` → `"version": "3.2.1"`
3. 测试中断言版本号的用例（如 `test-r197-version-sync.js`）需同步更新

**验证方式**:
1. `grep '"version"' package.json` → `3.2.1`
2. `grep '"version"' manifest.json` → `3.2.1`
3. `npm run test:ci` 中版本同步用例全部通过

### AC-6: CHANGELOG.md 补充 v3.2.1 区段

**Given** `CHANGELOG.md` 最新条目为 `[3.1.0] - 2026-05-20`
**When** 补充 `[3.2.1] - 2026-05-21` 区段
**Then** 该区段应涵盖 R240-R243 的全部变更，结构如下：

```
## [3.2.1] - 2026-05-21

### 修复
- R240: 版本断言同步 — test-r197-version-sync.js 断言从 3.1.0 更新至 3.2.0

### 新增
- R241: 行覆盖率突破 30% — Top-15 零覆盖纯逻辑模块补测试，新增 60+ 用例
- R243: 覆盖率门禁硬化 — 门禁阈值从虚高值收紧至实测基线 (lines 28/functions 50/branches 75)

### 性能优化
- R242: 测试执行效率优化八期 — 拆分测试套件为并行分片，执行时间目标 ≤35s

### 测试
- 测试用例: ≥7,611 个 (从 v3.2.0 的 7,484 增长)
- 行覆盖率: ≥30% (实测验证，从 v3.2.0 的 23.68% 提升)
- 覆盖率门禁: --lines 28 --functions 50 --branches 75 (硬化至实测基线)
```

**验证方式**: 读取 `CHANGELOG.md`，断言 `[3.2.1]` 区段存在且包含 R240、R241、R242、R243 四个需求编号。

### AC-7: 更新 RELEASE-NOTES-v3.2.1.md

**Given** `docs/RELEASE-NOTES-v3.2.md` 记录了 v3.2.0 的发布说明
**When** 创建 `docs/RELEASE-NOTES-v3.2.1.md`
**Then** 文档应包含：
1. **Overview** — 概述 v3.2.0 → v3.2.1 的质量改进定位
2. **What's New** — R240-R243 四项变更的详细说明
3. **Statistics** — 对比表格（v3.2.0 vs v3.2.1 各指标）
4. **Upgrade Instructions** — 从 v3.2.0 升级说明（无数据迁移需求）
5. **Known Limitations** — 已知限制（与 v3.2.0 一致）

**验证方式**: 文件存在且包含上述 5 个章节标题。

### AC-8: 发布产物就绪验证

**Given** 版本号已 bump，CHANGELOG 和 Release Notes 已更新
**When** 执行 `bash scripts/publish-check.sh`
**Then** 所有检查项应 PASS，退出码为 0，特别包括：
1. manifest.json 与 package.json 版本一致性 → 均为 `3.2.1`
2. 权限最小化审计 → 无新增权限
3. 必需图标存在性 → 16/48/128px 均存在
4. `_locales` 完整性 → zh_CN 与 en key 一致
5. 无残留开发文件

**验证方式**: 执行 `bash scripts/publish-check.sh`，断言退出码为 0。

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **零新功能** | 本迭代不新增任何功能代码或测试用例，仅做版本归档和文档更新 |
| **版本同步** | `package.json`、`manifest.json`、测试断言三处版本号必须一致 |
| **CHANGELOG 完整性** | 必须覆盖 R240-R243 全部四轮迭代，不可遗漏 |
| **发布脚本兼容** | `publish-check.sh` 使用 `grep` 解析版本号，版本格式必须为 `"version": "X.Y.Z"` |
| **向后兼容** | v3.2.1 是 v3.2.0 的补丁版本，API、数据格式、存储结构零变更 |
| **门禁全绿** | `coverage:gate`、`lint`、`test:ci` 三项 CI 门禁必须全部通过 |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R240 VersionSyncFix | 前置 | 修复版本断言 3.1.0 → 3.2.0，确保测试全绿为发布基线 |
| R241 CoverageRealBreak30 | 前置 | 实际提升行覆盖率至 ≥28%，新增 60+ 测试用例 |
| R242 TestExecutionOpt8 | 前置 | 测试执行效率优化，目标 ≤35s |
| R243 CoverageGateAlign | 前置 | 门禁阈值硬化至实测基线 (28/50/75) |
| `scripts/bump-version.sh` | 工具依赖 | R214 创建的版本号管理脚本，支持 `patch` 参数自动 bump |
| `scripts/publish-check.sh` | 工具依赖 | R208 创建的发布前自检脚本，验证产物完整性 |
| `scripts/build.sh` | 工具依赖 | R208 创建的构建脚本，生成 .zip 产物 |
| `docs/RELEASE-NOTES-v3.2.md` | 参考依赖 | v3.2.0 发布说明，v3.2.1 文档参照其结构 |

---

## 6. 变更影响范围

| 文件 | 变更类型 | 变更内容 |
|------|---------|---------|
| `package.json` | 修改 | `version`: `3.2.0` → `3.2.1` |
| `manifest.json` | 修改 | `version`: `3.2.0` → `3.2.1` |
| `CHANGELOG.md` | 修改 | 在 `[3.1.0]` 条目前插入 `[3.2.1] - 2026-05-21` 区段 |
| `docs/RELEASE-NOTES-v3.2.1.md` | **新建** | v3.2.1 发布说明文档 |
| `tests/test-r197-version-sync.js` | 可能修改 | 若有硬编码 `3.2.0` 断言需更新为 `3.2.1` |
| `docs/reports/coverage-baseline.md` | 可能修改 | 若实测覆盖率数据有变化，同步更新基线 |

**不受影响的文件**: `lib/` 下所有功能代码、`scripts/` 下所有脚本、`manifest.json` 的权限和配置（仅 version 字段变更）。

---

## 7. 执行顺序

本迭代各步骤存在严格的先后依赖关系：

```
Step 1: 版本号 bump (package.json + manifest.json)
    ↓
Step 2: 更新版本同步测试断言 (test-r197-version-sync.js)
    ↓
Step 3: `npm run test:ci` 验证 0 fail + 用例数 ≥7611
    ↓
Step 4: `npm run lint` 验证 0 errors 0 warnings
    ↓
Step 5: `npm run test:coverage` + `npm run coverage:gate` 验证行覆盖率 ≥30%
    ↓
Step 6: 计时 `npm run test:ci` 验证 ≤35s
    ↓
Step 7: 更新 CHANGELOG.md 补充 [3.2.1] 区段
    ↓
Step 8: 创建 docs/RELEASE-NOTES-v3.2.1.md
    ↓
Step 9: 执行 `bash scripts/publish-check.sh` 验证发布产物就绪
```

---

## 8. 不在范围内

- 不新增任何功能代码或测试用例
- 不修改 CI workflow 配置（`.github/workflows/`）
- 不执行 Chrome Web Store 实际提交
- 不修改覆盖率门禁阈值（R243 已完成硬化）
- 不创建 git tag（发布标签由发布流水线在合并后自动创建）
- 不修改 `scripts/bump-version.sh` 或 `scripts/publish-check.sh`

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| R241/R242/R243 合入后存在隐式冲突导致 `test:ci` 失败 | 低 | 高 | 逐步骤验证，失败时定位具体用例并修复（但不新增功能代码，仅修正断言或配置） |
| 版本 bump 后 `test-r197-version-sync.js` 中有未发现的硬编码版本断言 | 低 | 中 | `grep -r "3.2.0" tests/` 全量搜索，逐一更新 |
| 实测行覆盖率恰好在 30% 边界（如 29.9%），需精确验证 | 中 | 低 | AC-3 设定 30.0 为硬性下限；若不达标需回到 R241 补充覆盖模块（不在本迭代范围） |
| `publish-check.sh` 因 CHANGELOG 格式不规范报 WARN | 低 | 低 | 参照 v3.1.0 和 v3.2.0 区段的既有格式编写 |

---

## 10. 验收检查清单

- [ ] `package.json` 版本号为 `3.2.1`
- [ ] `manifest.json` 版本号为 `3.2.1`
- [ ] `npm run test:ci` → 0 fail, ≥7,611 pass
- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] 行覆盖率实测 ≥30%（读取 `coverage-summary.json`）
- [ ] `npm run coverage:gate` → exit code 0
- [ ] `npm run test:ci` 执行时间 ≤35s
- [ ] `CHANGELOG.md` 包含 `[3.2.1] - 2026-05-21` 区段
- [ ] `CHANGELOG.md` v3.2.1 区段提及 R240、R241、R242、R243
- [ ] `docs/RELEASE-NOTES-v3.2.1.md` 存在且包含 5 个必要章节
- [ ] `bash scripts/publish-check.sh` → exit code 0
- [ ] `tests/test-r197-version-sync.js` 中版本断言为 `3.2.1`
- [ ] `grep -r "3.2.0" tests/` 无残留硬编码旧版本号

---

*需求文档由 Plan Agent 生成于 2026-05-21*
