# 需求文档 — R326: v3.4.3 版本发布真正落地 ReleaseV343Landing

> 版本: 1.0
> 日期: 2026-05-26
> 迭代: Phase AY 第 2 轮 (R326)
> 复杂度: Simple
> 前序迭代: R324 (ReleaseV343)、R325 (TestFailureFlushR325)

---

## 1. 背景与动机

### 1.1 现状分析

R324（全量回归与 v3.4.3 发布收尾）在 TODO.md 中标记为 `[x]` 完成，但**实际执行阶段失败**（R9 迭代报告确认 Phase 2 & Phase 3 失败）。具体表现为：

| 维度 | R324 目标 | 当前实际 | 差距 |
|------|----------|---------|------|
| 版本号 | 3.4.3 | **3.4.2**（package.json + manifest.json） | 未 bump |
| CHANGELOG [3.4.3] 区段 | 包含 R320-R325 摘要 | **不存在** | 未创建 |
| `[Unreleased]` 区段 | 为空 | 仍含 R295/R298/R288/R287/R325 等条目 | 未清理 |
| test:ci | 0 fail (≥7800 pass) | R325 修复后 7513 pass / 0 fail | ✅ 已达成 |
| ROADMAP 状态表 | v3.4.3 / R325 | 仍为 v3.4.1 / R309 | 未更新 |
| coverage-baseline.md | 最新数据 | 仍为 R256/R319 基线 | 未更新 |
| publish-check.sh | 全部通过 | 未运行（版本不一致必失败） | 未执行 |

**根因**: R324 试图在一次迭代中完成全部发布收尾工作，但 Phase 2（版本 bump + CHANGELOG）和 Phase 3（文档更新 + 发布检查）均未执行。R325 成功修复了阻塞发布的 3 个测试红灯，但未涉及版本发布流程本身。

### 1.2 问题清单

1. **版本号停留在 3.4.2** — `package.json` 和 `manifest.json` 均为 3.4.3 未生效
2. **CHANGELOG 缺 [3.4.3] 区段** — R320-R325 的变更（书签内容预览/CHANGELOG 卫生/覆盖率安全裕量/统计仪表盘/测试红灯清零）未归档到版本区段
3. **`[Unreleased]` 区段未清空** — R295/R298/R288/R287/R325 等条目仍留在 Unreleased 中
4. **ROADMAP 状态表过期** — 版本仍显示 v3.4.1，迭代轮次仍为 R309
5. **覆盖率基线文档未更新** — R322 覆盖率安全裕量工作完成后基线数据未同步
6. **发布产物未验证** — `publish-check.sh` 未运行，版本一致性检查必然失败

### 1.3 目标

在 R325 已清零测试红灯的基础上，**完成 R324 未完成的发布收尾步骤**：版本 bump、CHANGELOG 归档、文档同步、发布产物验证，使 v3.4.3 真正具备发布条件。

---

## 2. 用户故事

> **作为** PageWise 的维护者，
> **我希望** v3.4.3 的版本号、变更日志、路线图文档与实际代码状态完全一致，发布产物通过自动化自检，
> **以便** 能自信地将 v3.4.3 推送到 Chrome Web Store，不因文档不一致或发布检查失败而回滚。

---

## 3. 验收标准

### AC-1: 测试与 Lint 全绿

- `npm run test:ci` — **0 fail**，通过数 ≥ 7477（R325 达成 7513，允许合理波动）
- `npm run lint` — **0 errors / 0 warnings**
- 验证命令:
  ```bash
  npm run test:ci   # 期望: X pass, 0 fail
  npm run lint      # 期望: 0 errors, 0 warnings
  ```

### AC-2: 覆盖率门禁三项通过

- `npm run test:coverage && npm run coverage:gate` 三项均通过:
  - Lines ≥ 28%
  - Functions ≥ 50%
  - Branches ≥ 75%
- 验证命令:
  ```bash
  npm run test:coverage && npm run coverage:gate
  ```

### AC-3: 版本号 bump 至 3.4.3 且双文件同步

- `package.json` version = `"3.4.3"`
- `manifest.json` version = `"3.4.3"`
- 使用 `bash scripts/bump-version.sh 3.4.3` 执行（该脚本同时更新两个文件并验证一致性）
- 验证命令:
  ```bash
  node -e "console.log(require('./package.json').version)"   # 期望: 3.4.3
  node -e "console.log(require('./manifest.json').version)"  # 期望: 3.4.3
  ```

### AC-4: CHANGELOG.md 补充 [3.4.3] 区段且 [Unreleased] 清空

- 新增 `## [3.4.3] - 2026-05-26` 区段，位于 `[3.4.0]` 之前，内容包含 R320-R325 六项变更摘要:
  - **R320: 书签内容预览 BookmarkContentPreview** — 新建 `lib/bookmark-content-preview.js`，OG/meta 提取 + IndexedDB 缓存 + 详情面板集成
  - **R321: CHANGELOG 版本归档与文档卫生 ChangelogHygiene** — R295/R298 归入已发布版本区段，[3.4.2] 区段补全 R310-R319
  - **R322: 行覆盖率安全裕量至 32% CoverageSafetyMargin32** — Top-15 零覆盖模块补充用例 ≥50，行覆盖率 ≥32%
  - **R323: 书签统计仪表盘 BookmarkStatisticsDashboard** — 新建 `lib/bookmark-statistics.js`，全景统计 + 健康度评分 + 导出
  - **R324: 全量回归与 v3.4.3 发布收尾 ReleaseV343** — R320-R323 全量回归验证
  - **R325: 3 个测试红灯清零 TestFailureFlushR325** — 修复 bookmark-statistics 测试 + R310 断言 + 过期文档清理
- `[Unreleased]` 区段**为空**（所有条目已归入版本区段）
- `[3.4.3]` 区段位于 `[3.4.0]` 之前（时间倒序）
- 验证命令:
  ```bash
  grep -c "## \[3\.4\.3\]" docs/CHANGELOG.md   # 期望: 1
  # [Unreleased] 区段内无 "- **" 开头的条目
  ```

### AC-5: ROADMAP.md 状态表更新至 v3.4.3 / R325

- `docs/ROADMAP.md` 状态表更新:
  - 版本: v3.4.3
  - 迭代轮次: R325
  - 测试总数: 更新为 R325 实测值（7513 pass / 0 fail）
  - Lint: 0 errors / 0 warnings
  - 最后更新日期: 2026-05-26
- 验证: 状态表中「版本」行数值为 `v3.4.3`

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 使用现有 bump 脚本 | 版本号变更必须通过 `scripts/bump-version.sh 3.4.3` 执行，不手动编辑 version 字段 |
| CHANGELOG 格式 | 遵循 Keep a Changelog 规范，与现有 `[3.4.0]`/`[3.2.0]` 等区段格式一致 |
| 不修改功能代码 | 本轮仅为发布收尾，不涉及 lib/ 或 UI 代码变更；测试修复仅限于断言对齐 |
| 不新增测试用例 | R325 已修复 3 个红灯，本轮不新增用例；仅运行验证 |
| bump-version.sh 行为 | 该脚本会自动插入 `## [3.4.3]` 区段骨架到 CHANGELOG.md，但内容为模板文本，需人工替换为 R320-R325 实际摘要 |
| publish-check.sh 严格模式 | 该脚本含 7 项检查（版本一致性/权限审计/图标/locales/安全），任一 FAIL 则 exit 1 |
| E2E 测试依赖 Chrome | `npm run test:e2e` 需要 headless Chrome 环境；若 CI 无 Chrome 则降级为跳过（记录原因） |
| 覆盖率基线沿用 R256 数据 | 除非 `npm run test:coverage` 产出新数据且差异 ≥1pp，否则沿用现有基线值 |

---

## 5. 依赖关系

```
R324 (ReleaseV343)        ──→ R326 (ReleaseV343Landing) ──→ R327 (CoverageSafetyMargin30)
       │ (失败)                    │
R325 (TestFailureFlushR325) ──────┘ (测试红灯已清零)
```

| 方向 | 依赖 | 说明 |
|------|------|------|
| **前置** | R325 | TestFailureFlushR325 — 测试红灯已清零 (7513 pass / 0 fail)，为版本发布扫除阻塞 |
| **前置** | R324 失败分析 | 理解 R324 Phase 2/3 失败原因，避免重复失败（bump-version.sh 依赖 CHANGELOG 存在正确分隔符） |
| **并行** | scripts/bump-version.sh | 自动化版本 bump 脚本 (R214)，更新 package.json + manifest.json + CHANGELOG.md |
| **并行** | scripts/publish-check.sh | 发布前自检脚本 (R208)，7 项检查全部需 PASS |
| **后续** | R327 | CoverageSafetyMargin30 — 在 v3.4.3 发布后继续提升覆盖率安全裕量 |
| **后续** | R329 | IterationCloseAY — Phase AY 收尾迭代 |

---

## 6. 非功能需求

| 维度 | 当前值 | 目标值 |
|------|-------|--------|
| 版本号一致性 | package.json ≠ manifest.json (均为 3.4.2) | 两文件均为 3.4.3 |
| CHANGELOG [3.4.3] | 不存在 | 包含 R320-R325 六项摘要 |
| [Unreleased] 条目数 | ≥5 条 | 0 条 |
| ROADMAP 版本 | v3.4.1 / R309 | v3.4.3 / R325 |
| publish-check.sh | 未运行 | 0 FAIL |
| test:e2e 路径数 | 未验证 | ≥9 条通过 |

---

## 7. 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| bump-version.sh 在已有 Unreleased 条目时插入位置错误 | CHANGELOG 格式破坏，release 测试失败 | 先手动整理 Unreleased 区段，再运行 bump 脚本；或先 bump 再手动调整 CHANGELOG 内容 |
| R325 后新增代码导致 test:ci 回归 | 发布前测试不通过 | 在 bump 之前先运行 test:ci 确认基线；bump 后再次全量回归 |
| publish-check.sh 的安全审计发现新问题 | 发布阻塞 | 在 bump 后立即运行 publish-check.sh，提前发现问题 |
| E2E 测试在无 Chrome 环境下跳过 | 发布验证不完整 | 记录跳过原因，将 E2E 结果标注为"条件通过" |
| 覆盖率因版本 bump 的 CHANGELOG 变更产生微小波动 | 门禁临界值失败 | R322 已将行覆盖率提升至 ~32%，4pp 安全裕量可覆盖波动 |

---

## 8. 实施策略（概要）

### Phase 1: 基线验证 (≤0.5 轮)
- 运行 `npm run test:ci` 确认 0 fail（预期 ≥7513 pass）
- 运行 `npm run lint` 确认 0/0
- 运行 `npm run test:coverage && npm run coverage:gate` 确认三项门禁通过

### Phase 2: 版本 Bump + CHANGELOG (≤0.5 轮)
- 运行 `bash scripts/bump-version.sh 3.4.3`
- 手动编辑 `docs/CHANGELOG.md`:
  - 将 `## [3.4.3] - 2026-05-26` 区段的模板内容替换为 R320-R325 实际摘要
  - 清空 `## [Unreleased]` 区段内容（删除 R295/R298/R288/R287/R325 条目，保留空区段头）
- 确认 `[3.4.3]` 区段位于 `[3.4.0]` 之前

### Phase 3: 文档同步 + 发布验证 (≤0.5 轮)
- 更新 `docs/ROADMAP.md` 状态表（版本 v3.4.3 / 迭代 R325 / 测试数 7513 / 日期 2026-05-26）
- 更新 `docs/reports/coverage-baseline.md`（如有新覆盖率数据）
- 运行 `npm run test:ci` 全量回归（bump 后二次验证）
- 运行 `scripts/publish-check.sh` 验证发布产物就绪
- 运行 `npm run test:e2e` 验证 E2E 路径（≥9 条通过）

---

*文档生成于 2026-05-26，遵循飞轮迭代流程 (flywheel-iteration)*
