# 需求文档 — R194: 全量回归与迭代收尾 IterationCloseR66

> 创建时间: 2026-05-20
> 复杂度: Simple
> 飞轮迭代: R36

---

## 1. 用户故事

作为 PageWise 项目维护者，我希望在 R190-R193 四轮迭代全部完成后执行一次完整的收尾验证，确保代码库处于可发布状态，所有回归测试通过、Lint 无警告、覆盖率达标、变更记录完整，从而信心十足地输出发布候选版本号。

---

## 2. 当前状态基线（R193 完成后）

| 指标 | 当前值 | 目标值 | 差距 |
|------|--------|--------|------|
| `npm run test:ci` pass | 6876 | ≥6887 | +11（含修复 2 个 fail） |
| `npm run test:ci` fail | 2 | 0 | 需修复 2 个失败用例 |
| `npm run lint` errors | 0 | 0 | ✅ 已达标 |
| `npm run lint` warnings | 1 | 0 | 需修复 1 个 warning |
| 行覆盖率 | 待确认（R192 门禁 ≥75%） | ≥75% | 待验证 |
| CHANGELOG R190-R193 | 未记录 | 已补充 | 需补写 |

### 已知失败详情

1. **`test-bookmark-weekly-digest.js`** — R193 模块拆分导致 `bookmark-weekly-digest.js` 中 re-export 的 `_WeeklyDigest` 在 `bookmark-weekly-digest-stats.js` 中不存在，引发 `SyntaxError`。需修复拆分后的导出链。
2. **`R159: ESLint 0 warnings` 测试** — `lib/bookmark-knowledge-packs-core.js:11` 存在未使用的 `Buffer` 变量（R193 模块拆分遗留），触发 `no-unused-vars` warning，导致 ESLint 0-warnings 断言失败。

---

## 3. 验收标准

### AC-1: 全量回归测试零失败
- **条件**: `npm run test:ci` 输出 `# fail 0`
- **目标**: `# pass ≥ 6887`（当前 6876 + 修复回归恢复）
- **说明**: 修复 R193 模块拆分遗留的 2 个失败用例（bookmark-weekly-digest 导出链断裂 + ESLint warning），其余用例无新增回归

### AC-2: Lint 零错误零警告
- **条件**: `npm run lint` 输出 `0 problems (0 errors, 0 warnings)`
- **说明**: 清除 `bookmark-knowledge-packs-core.js` 中未使用的 `Buffer` import

### AC-3: 行覆盖率 ≥75%
- **条件**: `npm run test:coverage` 的 c8 text-summary 显示行覆盖率 ≥75%
- **说明**: R192 已建立覆盖率门禁，本次验证门禁正常生效且基线达标

### AC-4: CHANGELOG 更新完成
- **条件**: `CHANGELOG.md` 中补充 `[3.1.0] - 2026-05-20` 区段
- **内容涵盖**:
  - **R190**: 覆盖率基础设施修复（CoverageInfraFix）
  - **R191**: 待确认（前一轮迭代变更）
  - **R192**: 覆盖率基础设施修复 CoverageInfraFixR190
  - **R193**: 超大模块拆分九期 ModuleSplitPhase9（14 个 lib 文件 >400 行，优先拆分前 6 个）
- **格式**: 遵循 Keep a Changelog 规范，分类为「新增 / 修复 / 架构 / 测试」

### AC-5: 输出发布候选版本号
- **条件**: 输出明确的 RC 版本号（如 `3.1.0-rc.1`）并记录在 CHANGELOG 和迭代报告中
- **说明**: 基于当前 `version: 1.0.0`（package.json）与 CHANGELOG 中 `3.0.0`（2026-05-16）的里程碑，下一个版本为 `3.1.0`

---

## 4. 技术约束

1. **不引入新功能**: 本轮纯收尾验证，仅修复回归、补文档、确认门禁
2. **re-export 向后兼容**: 修复 R193 模块拆分时保持所有公开 API 不变（re-export 模式），不得修改消费端（测试文件）的 import 路径，除非绝对必要
3. **Lint 修复最小化**: 仅移除未使用的 import 或变量，不做代码风格重构
4. **覆盖率工具链**: 使用 c8（已在 R192 配置），报告格式 lcov + text-summary + html
5. **零外部依赖**: 测试框架为 Node.js 内置 test runner，不得引入新的测试框架

---

## 5. 依赖关系

| 依赖项 | 状态 | 说明 |
|--------|------|------|
| R190: CoverageInfraFix | ✅ 已完成 | 覆盖率门禁基础设施已就绪 |
| R191: 前一轮迭代 | ✅ 已完成 | 待确认具体变更内容 |
| R192: CoverageInfraFixR190 | ✅ 已完成 | 覆盖率报告生成 + CI 门禁（<75% fail） |
| R193: ModuleSplitPhase9 | ⚠️ 已完成但有遗留 | 模块拆分导致 2 个测试失败 + 1 个 lint warning |
| CHANGELOG.md | 需更新 | R190-R193 变更记录缺失 |
| package.json version | 需确认 | 当前 `1.0.0`，CHANGELOG 已到 `3.0.0`，需统一 |

---

## 6. 执行步骤概览

| 步骤 | 动作 | 验证命令 |
|------|------|----------|
| 1 | 修复 `bookmark-weekly-digest.js` re-export 链 | `node --test tests/test-bookmark-weekly-digest.js` |
| 2 | 移除 `bookmark-knowledge-packs-core.js` 未使用 Buffer import | `npm run lint` |
| 3 | 执行全量回归 | `npm run test:ci` → `# fail 0, # pass ≥ 6887` |
| 4 | 执行覆盖率验证 | `npm run test:coverage` → 行覆盖率 ≥75% |
| 5 | 更新 CHANGELOG.md | 手工审查 |
| 6 | 更新 package.json version | `3.1.0-rc.1` |
| 7 | 输出迭代报告 | `docs/reports/2026-05-20-R36.md` |

---

## 7. 风险与缓解

| 风险 | 可能性 | 缓解措施 |
|------|--------|----------|
| R193 模块拆分还有其他隐藏回归 | 中 | 全量测试覆盖 6887+ 用例，一次跑通即可排除 |
| 覆盖率因模块拆分路径变化而低于 75% | 低 | R192 门禁已在 CI 中生效，不达标自动阻断 |
| CHANGELOG 版本号与 package.json 不一致 | 已知 | 本轮统一修正为 `3.1.0-rc.1` |
| coverage 目录权限问题（R192 遗留） | 低 | R192 已添加 clean 脚本排除 stale 目录 |

---

*本文档遵循飞轮迭代流程 (flywheel-iteration) Phase 1: 需求分析*
