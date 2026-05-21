# 需求文档 — 迭代 15: 覆盖率门禁与实测对齐 (CoverageGateAlign)

> **需求编号**: R243
> **创建日期**: 2026-05-21
> **状态**: 📋 待开发
> **复杂度**: Simple
> **飞轮迭代**: R15

---

## 1. 背景与问题

R233 (CoverageGateHardening) 曾将覆盖率门禁从声称的虚高阈值（50%/60%）下修至实测基线附近（23%/48%），建立了"绝对阈值 + 回归检测"双层门禁机制。然而 R241 之后实际覆盖率已有显著提升，门禁阈值却从未同步收紧，导致当前状态：

| 维度 | 门禁阈值 (coverage:gate) | R233 基线 (实测) | R241 后最新实测 | 门禁与实测差距 |
|------|------------------------|-----------------|----------------|--------------|
| **Lines** | 23% | 23.68% | **29.67%** | 6.67pp — 门禁形同虚设 |
| **Functions** | 48% | 48.85% | **50.22%** | 2.22pp — 门禁几乎无约束力 |
| **Branches** | 75% | 75.97% | **75.74%** | 0.74pp — 门禁合理 |

**核心问题**: 门禁阈值远低于实际覆盖率，失去了"守住底线"的意义。即使覆盖率大幅退化（例如从 29.67% 退化到 24%），CI 也不会报错。

**历史回顾**: 项目历经 R205/R216/R222/R225/R230/R233/R236/R241 共八次覆盖率相关迭代，从"声称 50% 实测 23%"到 R233 建立诚实基线，再到 R241 实际提升了覆盖率。本次迭代的目标是让门禁阈值跟上实测水平，确保覆盖率一旦退化就能被 CI 捕获。

---

## 2. 用户故事

**作为** PageWise 项目的开发者 / CI 维护者，
**我希望** 覆盖率门禁阈值与当前实际覆盖率对齐，且覆盖率文档记录真实基线数据，
**以便** 任何导致覆盖率退化的 PR 都能在 CI 中被及时阻断，避免覆盖率倒退而无人知晓。

---

## 3. 验收标准

### AC-1: 门禁阈值收紧至实测基线

**Given** 当前最新实测覆盖率数据为 Lines 29.67%、Functions 50.22%、Branches 75.74%
**When** 更新 `package.json` 中 `coverage:gate` 脚本的阈值
**Then** 门禁阈值应为：

| 维度 | 当前阈值 | **新阈值** | 实测值 | 上方余量 | 收紧依据 |
|------|---------|-----------|--------|---------|---------|
| `--lines` | 23 | **28** | 29.67% | 1.67pp | 取整至偶数，留合理余量 |
| `--functions` | 48 | **50** | 50.22% | 0.22pp | 取整至整十，与实测持平 |
| `--branches` | 75 | **75** (不变) | 75.74% | 0.74pp | 当前已合理 |

**验证方式**: 读取 `package.json` 的 `coverage:gate` 脚本，断言 `--lines 28 --branches 75 --functions 50`。

### AC-2: 基线文档更新为最新实测数据

**Given** `coverage/coverage-summary.json` 中存储了最新覆盖率数据
**When** 更新 `docs/reports/coverage-baseline.md`
**Then** 文档应包含：
- 基线快照表更新为 R241 后的实测值（Lines 29.67%、Branches 75.74%、Functions 50.22%）
- 门禁阈值映射表更新为新值（Lines 28%、Branches 75%、Functions 50%）
- 回归容差表更新（Lines 退化阈值 = 28 - 2 = 26%、Functions = 50 - 2 = 48%、Branches = 75 - 2 = 73%）
- 历史对比表新增 R241 行记录
- 流转标记：`R233 → R243 更新`

**验证方式**: 读取文档内容，断言新阈值和基线值均已写入，旧值保留在历史对比表中。

### AC-3: CI 硬性阻断验证

**Given** `coverage:gate` 已更新为新阈值
**And** `.github/workflows/ci.yml` 中调用了 `npm run coverage:gate`
**When** 覆盖率低于任一新阈值（例如 Lines < 28%）
**Then** `c8 check-coverage` 应以非零退出码退出，导致 CI pipeline fail

**验证方式**:
1. 静态验证：检查 ci.yml 中 `npm run coverage:gate` 步骤存在且无 `|| true` / `continue-on-error: true` 等容忍配置
2. 门禁语义验证：确认 `c8 check-coverage` 在阈值未达标时退出码为非零（已知 c8 行为，无需实际触发 CI）

### AC-4: 回归检测与新基线同步

**Given** `scripts/architecture-guard.sh` 已有 R233 的回归检测逻辑
**And** `docs/reports/coverage-baseline.md` 已更新为 R243 基线
**When** `architecture-guard.sh` 解析基线文件并与 `coverage/coverage-summary.json` 对比
**Then** 回归检测应使用更新后的基线值（Lines 29.67%、Functions 50.22%、Branches 75.74%），退化超过 2pp 即 CI fail

**验证方式**:
1. 读取 `architecture-guard.sh` 确认回归检测逻辑存在且解析 `coverage-baseline.md`
2. 确认 REGRESSION_TOLERANCE=2 未变
3. 运行 `bash scripts/architecture-guard.sh` 确认当前覆盖率通过回归检测

### AC-5: 验收测试覆盖门禁逻辑（≥10 新用例）

**Given** 已有 `tests/test-r233-coverage-gate.js`（23 用例）
**When** 创建/扩展门禁验收测试
**Then** 新增 ≥10 个测试用例覆盖以下场景：

1. **阈值正确性**: `coverage:gate` 中 `--lines` 值为 28（非旧值 23）
2. **阈值正确性**: `coverage:gate` 中 `--functions` 值为 50（非旧值 48）
3. **阈值正确性**: `coverage:gate` 中 `--branches` 值为 75（保持不变）
4. **基线文档一致**: `coverage-baseline.md` 中 Lines 基线值 ≥ 28%（确认门禁不高于基线）
5. **基线文档一致**: `coverage-baseline.md` 中 Functions 基线值 ≥ 50%
6. **基线文档一致**: `coverage-baseline.md` 中 Branches 基线值 ≥ 75%
7. **回归容差计算**: Lines 退化触发阈值 = 基线值 − 2pp
8. **回归容差计算**: Functions 退化触发阈值 = 基线值 − 2pp
9. **回归容差计算**: Branches 退化触发阈值 = 基线值 − 2pp
10. **跨文件一致性**: `coverage-baseline.md` 中的门禁阈值与 `package.json` 的 `coverage:gate` 一致
11. **跨文件一致性**: `coverage-baseline.md` 中的基线值与 `coverage/coverage-summary.json` 的 total 值在 1pp 容差内一致
12. **CI 集成**: ci.yml 中 `coverage:gate` 步骤在 `coverage regression check` 步骤之前执行（顺序正确）

**验证方式**: `npm run test:ci` 全部通过，新增用例数 ≥10。

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **零新依赖** | 不引入新的 npm 包或工具，仅修改配置和文档 |
| **向后兼容** | 门禁收紧不影响现有通过 CI 的 PR（当前实测 29.67% > 新阈值 28%） |
| **基线文档即真相** | `coverage-baseline.md` 是唯一可信的基线来源，`architecture-guard.sh` 从中解析 |
| **双层门禁保留** | 绝对阈值（`coverage:gate`）+ 回归检测（`architecture-guard.sh`）两层机制不变 |
| **门禁阈值 ≤ 基线** | 门禁阈值必须 ≤ 实测基线值，不允许设置高于实测值的阈值（R230 的教训） |
| **容差 ≤ 5pp** | 回归容差（基线 − 门禁）不超过 5 个百分点 |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R233 CoverageGateHardening | 前置 | 建立了双层门禁机制和基线文档框架，本迭代在其基础上收紧阈值 |
| R241 CoverageRealBreak30 | 前置 | 实际提升了行覆盖率至 ~29.67%，为收紧门禁提供了实测依据 |
| R240 VersionSyncFix | 前置 | 修复了版本断言，确保测试全绿作为基线前提 |
| `coverage/coverage-summary.json` | 运行时依赖 | 由 `npm run test:coverage` 生成，`architecture-guard.sh` 读取此文件进行回归检测 |
| `docs/reports/coverage-baseline.md` | 配置依赖 | `architecture-guard.sh` 解析此文件获取基线值 |
| c8 ≥ 10.x | 工具依赖 | `coverage:gate` 使用 `c8 check-coverage` 命令 |

---

## 6. 变更影响范围

| 文件 | 变更类型 | 变更内容 |
|------|---------|---------|
| `package.json` | 修改 | `coverage:gate` 脚本阈值：`--lines 23` → `28`，`--functions 48` → `50` |
| `docs/reports/coverage-baseline.md` | 修改 | 基线快照、阈值映射、回归容差、历史对比表更新 |
| `.github/workflows/ci.yml` | 可能修改 | 更新门禁步骤的注释文案（如 "lines >= 23%" → "lines >= 28%"），验证无 `continue-on-error` |
| `tests/test-r233-coverage-gate.js` | 扩展 | 更新现有用例中的硬编码阈值断言 + 新增 ≥10 用例 |

**不受影响的文件**: `scripts/architecture-guard.sh`（回归检测逻辑无需修改，它从 `coverage-baseline.md` 动态解析基线值）

---

## 7. 不在范围内

- 不提升覆盖率本身（那是 R241 及后续迭代的职责）
- 不改变测试执行策略（那是 R242 的职责）
- 不修改 `c8 check-coverage` 的命令格式或报告器配置
- 不引入覆盖率趋势图表或 Dashboard

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 收紧 `--lines` 至 28 后，下一次覆盖率运行因模块变化低于 28% 导致 CI 阻断 | 低 | 中 | 当前实测 29.67%，余量 1.67pp；回归检测层另有 2pp 容差（基线 29.67% − 2pp = 27.67%），双层保护 |
| `--functions 50` 过于接近实测 50.22%，浮点精度导致假阳性 | 低 | 低 | c8 check-coverage 对整数阈值做 `≥` 比较，50.22 ≥ 50 一定通过 |
| 更新基线文档后，`architecture-guard.sh` 解析失败 | 极低 | 高 | 维持文档格式不变（仅更新数值），回归测试验证解析结果 |

---

## 9. 验收检查清单

- [ ] `package.json` 中 `coverage:gate` 为 `c8 check-coverage --lines 28 --branches 75 --functions 50`
- [ ] `docs/reports/coverage-baseline.md` 基线快照更新为 R243 实测值
- [ ] `docs/reports/coverage-baseline.md` 门禁阈值映射更新为 28/75/50
- [ ] `docs/reports/coverage-baseline.md` 历史对比表包含 R241 行
- [ ] ci.yml 中门禁步骤注释更新，无 `continue-on-error` 或 `|| true`
- [ ] `bash scripts/architecture-guard.sh` 使用新基线值执行回归检测并通过
- [ ] `tests/test-r233-coverage-gate.js` 中旧阈值断言更新为新值
- [ ] 新增 ≥10 个验收测试用例
- [ ] `npm run test:ci` 全部通过（0 fail）
- [ ] `npm run coverage:gate` 全部通过

---

*需求文档由 Plan Agent 生成于 2026-05-21*
