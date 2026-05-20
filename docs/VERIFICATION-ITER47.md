# VERIFICATION.md — Iteration #47 Review

> 审查对象: R205: 行覆盖率冲刺 50% CoverageSprint50
> 审查日期: 2026-05-20
> 审查人: Guard Agent
> 变更文件: `docs/TODO.md`, `package.json`, `docs/reports/2026-05-20-R45.md`, `docs/reports/2026-05-20-R46.md`

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 5 项验收标准仅完成 AC4（门禁阈值修改），AC1/AC2/AC3/AC5 全部未实现 |
| 代码质量 | ⚠️ | `package.json` 改动本身无语法错误，但门禁收紧导致 CI 必定失败 |
| 测试覆盖 | ❌ | 未新增任何测试文件，未增强任何已有测试；当前 2 个测试因门禁阈值不一致而失败 |
| 文档同步 | ⚠️ | TODO.md 已更新 Phase AA 计划，R205 仍标记未完成 `[ ]`，符合实际情况；但缺少迭代报告 |

---

## 测试验证结果

```
测试总计: 6993 (1104 suites)
通过:     6991
失败:     2 ❌
耗时:     ~66s
```

### 失败用例详情

| # | 测试文件 | 失败用例 | 原因 |
|---|----------|----------|------|
| 1 | `tests/test-coverage-infra.js:186` | "ci.yml Coverage gate 步骤名与阈值一致" | ci.yml 步骤名仍为 `>= 20%`，但 package.json 已改为 `--lines 50`，测试读取阈值 50 后在 ci.yml 中找不到 `>= 50%` |
| 2 | `tests/test-r156-coverage-infra.js:106` | "coverage:gate 脚本行覆盖率门槛为 80" | 测试硬编码断言 `--lines 20`，package.json 已改为 `--lines 50` |

### 覆盖率实际值

| 指标 | 当前值 | 目标值 | 差距 | 状态 |
|------|--------|--------|------|------|
| 行覆盖率 | **21.36%** (10,717/50,153) | ≥50% | **-28.64pp** | ❌ |
| 函数覆盖率 | **47.59%** (396/832) | ≥60% | **-12.41pp** | ❌ |
| 分支覆盖率 | **77.99%** (1,818/2,331) | ≥78.35% | **-0.36pp** | ⚠️ 轻微退步 |

**`npm run coverage:gate` 必定失败**：行覆盖率 21.36% < 门禁要求 50%。

---

## 发现的问题

### 问题 1（P0 严重）：核心交付完全缺失 — 未新增任何测试

**AC2 要求**为 10 个 Tier 1 零覆盖模块补充单元测试（memory.js、conversation-store.js、bookmark-graph-engine.js 等），每个模块 ≥10 个用例。

**AC3 要求**为 5 个已有测试但覆盖不足的模块补充缺失用例（utils.js、cache-manager.js、i18n.js、ai-client.js、cost-estimator.js）。

**实际结果**：Git diff 中 `tests/` 目录无任何变更。188 个测试文件无一新增、无一修改。覆盖率缺口 28.64 个百分点（需额外覆盖 ~14,317 行），完全未开始。

### 问题 2（P0 严重）：门禁收紧但无对应覆盖支撑 — CI 必然红灯

`coverage:gate` 从 `--lines 20` 改为 `--lines 50 --functions 60`，但覆盖率仅 21.36%。此变更将导致所有 CI 流水线立即失败。同时：

- `.github/workflows/ci.yml` 步骤名仍为 `Coverage gate (lines >= 20%)`，与 package.json 的 `--lines 50` 不一致
- `tests/test-r156-coverage-infra.js:108` 硬编码断言 `--lines 20` 未更新
- `tests/test-coverage-infra.js:186` 动态读取阈值后在 ci.yml 中找不到匹配

这导致 **2 个已有测试失败**，违反 AC4 "全量回归 0 失败"的硬性要求。

### 问题 3（P1 中）：`test:ci` 脚本分裂 — 新增 `test:ci:coverage` 副本

新增了 `test:ci:coverage` 脚本，是 `test:ci` 的近似副本，使用 `--test-concurrency=1` 并排除部分测试文件。问题：

- 与原有 `test:ci` 脚本存在歧义——何时用哪个？
- 使用 `$(find ... | sort)` 的 shell 替换在 Windows 环境或 CI 不同 OS 上可能不兼容
- 排除 `test-lint-r159.js` 和 `test-r201-lint-warning-final.js` 的原因未在注释中说明
- 未同步更新 `.github/workflows/ci.yml` 使用新的脚本

### 问题 4（P1 中）：覆盖率缺口分析文档缺失

AC1 要求输出覆盖缺口分析文档（Top-20 模块列表、分层策略），实际未产出。虽然后续迭代（Phase AA）的 TODO 已规划，但 R205 本身应交付分析结果。

### 问题 5（P2 低）：迭代报告无实质内容

测试结果统计为 "通过: 0, 失败: 0"，表明测试可能未执行即提交。迭代报告缺少代码变更统计和覆盖率数据快照。

---

## 返工任务清单

| 优先级 | 任务 | 验收标准 | 关联 AC |
|--------|------|----------|---------|
| **P0** | 为 `test-r156-coverage-infra.js` 更新断言，匹配新阈值 `--lines 50 --functions 60` | 测试通过 | AC4 |
| **P0** | 更新 `.github/workflows/ci.yml` 步骤名为 `Coverage gate (lines >= 50%)` | `test-coverage-infra.js` 测试通过 | AC4 |
| **P0** | 为 Tier 1 模块新增单元测试文件（目标：≥10 个模块 × ≥10 用例） | 新测试文件存在且通过 | AC2 |
| **P0** | 为 Tier 2 模块增强已有测试（≥5 个模块，覆盖率提升至 ≥80%） | 覆盖率报告验证 | AC3 |
| **P0** | 验证 `npm run coverage:gate` 退出码为 0（行覆盖率 ≥50%、函数覆盖率 ≥60%） | c8 check-coverage 通过 | AC5 |
| **P0** | 验证 `npm run test:ci` 全量回归 0 失败 | `# fail 0` | AC4 |
| **P1** | 统一 `test:ci` 与 `test:ci:coverage`，避免脚本副本漂移 | 单一脚本，ci.yml 同步更新 | 代码质量 |
| **P1** | 输出覆盖缺口分析文档（Top-20 模块 + 分层策略） | 文档存在 | AC1 |

---

## 总结判定

**❌ 不通过 — 需要返工**

本次提交仅完成了"规划"和"门禁阈值调整"两件事，但核心交付物（新增测试用例）完全缺失。门禁收紧至 50% 在覆盖率仍为 21.36% 的情况下必然导致 CI 失败，属于**破坏性变更**。已有 2 个基础设施测试因此失败。

**建议**：将 `coverage:gate` 暂时回退至 `--lines 20`，先完成 AC2/AC3 的测试补充，待覆盖率达标后再收紧门禁。或者将本次提交标记为"中间态"，在下一轮迭代中补齐测试后再合并。

