# 需求文档 — R234: 全量回归与发布收尾 IterationCloseAF

> 文档编号: REQUIREMENTS-ITER6
> 日期: 2026-05-21
> 作者: Plan Agent
> 关联迭代: Phase AF 收尾 (R234)
> 前置依赖: R230 (行覆盖率突破尝试) · R231 (CHANGELOG 补全与 v3.2.0 版本号) · R232 (测试执行效率优化) · R233 (覆盖率 CI 门禁硬化与基线锁定)

---

## 1. 用户故事

**作为** PageWise 的发布管理者，
**我希望** 在 R230-R233 全部迭代完成后执行一次端到端的全量回归验证，并输出 v3.2.0 正式发布候选版本号，
**以便** 确认此轮质量治理飞轮（Phase AF）的全部产出可靠、CI 门禁生效、CHANGELOG 完整，满足 Chrome Web Store 提交和用户交付的质量底线。

---

## 2. 背景与现状

### 2.1 Phase AF (R230-R233) 迭代回顾

| 迭代 | 任务 | 核心目标 | 实现阶段结果 |
|------|------|---------|-------------|
| **R230** | CoverageRealBreak50 | 行覆盖率突破 50%（从 23.68%） | Phase 3 ❌ 失败 |
| **R231** | ChangelogV320Finalize | CHANGELOG 补全 + 版本号 3.2.0 | Phase 3 ❌ 失败，但有部分代码变更 |
| **R232** | TestExecutionFinalOpt | 测试执行 ≤30s（从 44.5s） | Phase 3 ❌ 失败 |
| **R233** | CoverageGateHardening | 覆盖率门禁硬化 + 基线锁定 | Phase 3 ❌ 失败，但有部分代码变更 |

> ⚠️ **关键风险**: R230-R233 四个迭代的实现阶段均标记为"失败"，但部分迭代产生了代码变更（R231 修改了 package.json / manifest.json / CHANGELOG / architecture-metrics，R233 修改了 ci.yml / coverage:gate / architecture-guard.sh）。R234 的全量回归是验证这些变更是否正确落地的 **唯一机会**。

### 2.2 当前项目状态快照

| 维度 | 当前值 | 来源 |
|------|--------|------|
| package.json 版本 | `3.2.0` | R231 设置 |
| manifest.json 版本 | `3.2.0` | R231 设置 |
| CHANGELOG 最高版本 | `[3.1.0] - 2026-05-20` | 尚无 `[3.2.0]` 区段 |
| coverage:gate 阈值 | `--lines 23 --branches 75 --functions 48` | R233 设置 |
| CI workflow | lint → test → package-check | R233 增强了 test job |
| 实测行覆盖率 | **23.68%** (12,048/50,872) | coverage-baseline.md |
| 实测分支覆盖率 | **75.97%** (1,970/2,593) | coverage-baseline.md |
| 实测函数覆盖率 | **48.85%** (449/919) | coverage-baseline.md |
| 测试用例数 | 7,484 (pass 7,470 / fail 14) | R233 基线 |
| 测试执行时间 | ~44.5s (目标 ≤30s) | R232 声称优化但未落地 |
| lint 状态 | 待验证 | — |
| architecture-guard.sh | 已创建（模块行数门禁 + 覆盖率回归检测） | R233 |

### 2.3 核心问题

1. **R230 覆盖率目标未达成**: 行覆盖率仍然为 23.68%，远低于声称的 50%。R234 不以覆盖率提升为目标，但需验证实测值不低于 R233 基线
2. **CHANGELOG 缺失 3.2.0 区段**: 当前文件中最高版本仍为 `[3.1.0]`，R231 的变更可能未被提交或被后续覆盖
3. **测试执行时间未达标**: 历史六次优化（R135/R152/R198/R202/R227/R232）均未将执行时间降至 ≤30s
4. **14 个测试失败**: 基线显示 7,470 pass / 14 fail，需确认这些 fail 是已知问题还是回归

---

## 3. 验收标准

### AC-1: 全量测试通过（0 fail）

- `npm run test:ci` 执行完成，**0 fail**
- 通过用例数 ≥ **7,564**（允许 R230-R233 新增用例的正常增长）
- 输出结果中无 `not ok` 行
- 如存在已知不可修复的失败（如无浏览器环境的 E2E 测试），需在回归报告中逐条记录并标注原因

### AC-2: Lint 零告警

- `npm run lint` 执行完成，输出 **0 errors / 0 warnings**
- 与 R218/R219 以来的零告警基线一致

### AC-3: 行覆盖率不低于基线（实测验证，非声称）

- 运行 `npm run test:coverage` 获取覆盖率报告
- 运行 `npm run coverage:gate` 进行门禁检查，exit code = 0
- 实测行覆盖率 ≥ **23%**（R233 锁定的门禁阈值）
- 实测分支覆盖率 ≥ **75%**
- 实测函数覆盖率 ≥ **48%**
- **关键约束**: 以 `npm run test:coverage` 实际输出为准，不接受声称值。报告中需附带 c8 text-summary 原始输出

### AC-4: 版本号一致性（3.2.0）

- `package.json` → `"version": "3.2.0"`
- `manifest.json` → `"version": "3.2.0"`
- 两文件版本号 **完全一致**，均为 `3.2.0`

### AC-5: CHANGELOG 包含 R230-R233 条目

- `CHANGELOG.md` 包含 `[3.2.0] - 2026-05-21` 区段
- 区段内涵盖以下迭代的变更记录：
  - **R230**: 行覆盖率突破尝试、零覆盖模块排查、测试补充
  - **R231**: CHANGELOG 补全、版本号统一至 3.2.0、RELEASE-NOTES 更新
  - **R232**: 测试执行效率优化、慢速用例改造、并行度提升
  - **R233**: 覆盖率门禁硬化、基线锁定、architecture-guard.sh 回归检测
- 条目格式符合 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 规范

### AC-6: CI 覆盖率门禁硬性生效

- `.github/workflows/ci.yml` 中 `test` job 包含以下步骤（按顺序）：
  1. `Generate coverage report` → `npm run test:coverage`
  2. `Coverage gate (hard block)` → `npm run coverage:gate`
  3. `Coverage regression check` → `bash scripts/architecture-guard.sh`
- `coverage:gate` 失败时，后续 `package-check` job 不执行（`needs: [lint, test]` 依赖保证）
- `architecture-guard.sh` 可正常执行（模块行数检查 + 覆盖率回归检测）

### AC-7: 输出发布候选版本号

- 最终输出 **v3.2.0** 作为发布候选版本号
- 版本号与 package.json / manifest.json 一致

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **验证性质** | R234 是回归验证迭代，不做新功能开发或覆盖率提升。如果发现回归问题，只做最小必要修复 |
| **测试执行时间** | 目标 ≤30s，但鉴于历史六次优化均未达标，如果 R233 基线仍为 ~44.5s，接受现状并记录实际值 |
| **覆盖率诚实** | 所有覆盖率数据必须来自 `npm run test:coverage` 实测输出，不允许声称值 |
| **14 个已知失败** | R233 基线显示 14 个测试失败。如果是已知的、已归档的失败，需在回归报告中明确记录；如果是回归，需修复 |
| **零新依赖** | 不引入新的 npm 依赖或工具链变更 |
| **CHANGELOG 补全** | 如果 R231 的 CHANGELOG 变更被后续迭代覆盖或丢失，R234 需补全 |
| **CI workflow 不主动修改** | R233 已设置好 CI workflow。R234 只验证其正确性，除非发现明确错误才修复 |

---

## 5. 依赖关系

```
R230 (CoverageRealBreak50) ─── 产出: 覆盖率提升尝试 + 实测基线数据 (23.68%)
     │
R231 (ChangelogV320Finalize) ─── 产出: 版本号 3.2.0 + CHANGELOG 补全尝试
     │
R232 (TestExecutionFinalOpt) ─── 产出: 测试执行效率优化尝试
     │
R233 (CoverageGateHardening) ─── 产出: 门禁硬化 + 基线锁定 + architecture-guard.sh
     │
     ▼
R234 (IterationCloseAF) ─── 全量回归验证 + 发布候选输出
     │
     ▼
v3.2.0 正式发布 (Chrome Web Store 提交)
```

| 依赖 | 类型 | 说明 |
|------|------|------|
| R230 | **上游** | 产出覆盖率数据基线（实测 23.68%），R234 以此为最低标准 |
| R231 | **上游** | 设置版本号 3.2.0、尝试补全 CHANGELOG，R234 验证并补全 |
| R232 | **上游** | 尝试优化测试执行效率，R234 验证实际效果 |
| R233 | **上游** | 硬化 CI 门禁、锁定基线、创建 architecture-guard.sh，R234 验证门禁生效 |
| `.github/workflows/ci.yml` | **输入** | R233 修改后的 CI 流水线配置 |
| `docs/reports/coverage-baseline.md` | **输入** | R233 创建的覆盖率基线文档 |
| `scripts/architecture-guard.sh` | **输入** | R233 创建的回归检测脚本 |

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| R230-R233 实现失败意味着代码变更可能不完整 | 高 | 高 | R234 逐项验证，发现缺失立即补全 |
| 14 个测试失败可能是回归而非已知问题 | 中 | 高 | 全量回归时逐一排查失败原因，区分"已知"与"回归" |
| CHANGELOG 3.2.0 区段仍未写入 | 高 | 中 | R234 作为收尾迭代，必须补全此区段 |
| 测试执行时间仍 >30s | 高 | 低 | 记录实际值，标记为已知限制，不阻断发布 |
| CI 门禁在实际 GitHub Actions 中行为与本地不同 | 中 | 中 | 通过 ci.yml 代码审查验证逻辑正确性 |

---

## 7. 验收检查清单

- [ ] `npm run test:ci` → 0 fail, ≥7564 pass
- [ ] `npm run lint` → 0 errors, 0 warnings
- [ ] `npm run test:coverage` 实测行覆盖率 ≥23%
- [ ] `npm run coverage:gate` exit code = 0
- [ ] `package.json` version = `3.2.0`
- [ ] `manifest.json` version = `3.2.0`
- [ ] `CHANGELOG.md` 含 `[3.2.0]` 区段 + R230-R233 条目
- [ ] `.github/workflows/ci.yml` 含 coverage → coverage:gate → architecture-guard.sh 三步
- [ ] `bash scripts/architecture-guard.sh` 正常执行（模块行数 + 覆盖率回归）
- [ ] 输出发布候选版本号: **v3.2.0**

---

## 8. 变更记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-05-21 | 初始版本（覆盖原 R109 内容） | Plan Agent |
