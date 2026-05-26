# REQUIREMENTS — R334: ReleaseV350 全量回归与 v3.5.0 发布

> 迭代: R334
> 日期: 2026-05-26
> 复杂度: Simple（发布收尾，无新功能模块）
> 阶段: v3.5.0 版本发布
> 前置条件: R330 (TestFailureFlushR330)、R331 (SearchHistoryPersist)、R332 (SidebarPerfOpt)、R333 (KnowledgeGraphInteraction) 全部完成

---

## 1. 用户故事

作为 PageWise 用户，我希望在 R330-R333 带来的新功能（测试红灯清零、搜索历史持久化、SidePanel 性能优化、知识图谱交互增强）全部稳定可用后，项目以正式版本号 v3.5.0 发布，拥有完整的变更记录、质量门禁通过、发布产物就绪，确保升级无回归。

作为 PageWise 开发者，我希望在 v3.5.0 发布前通过全量回归测试确认零失败，覆盖率、Lint、E2E、执行时间四项质量门禁全部达标，CHANGELOG 与 ROADMAP 文档同步更新，为后续迭代建立干净的发布基线。

---

## 2. 验收标准

### AC1: 全量单元测试通过
- 执行 `npm run test:ci` 结果为 **0 fail**
- 目标通过用例数 **≥ 7700 pass**（基于 R330-R333 累计新增用例：R330 无新增，R331 ≥ 25，R332 ≥ 20，R333 ≥ 30）
- 若存在 flaky test（偶发失败），需修复根因而非重试掩盖
- 输出完整测试摘要（总数 / 通过 / 失败 / 跳过）

### AC2: Lint 零告警
- 执行 `npm run lint` 结果为 **0 errors, 0 warnings**
- 现有 `--max-warnings 0` 配置不变
- 若 R330-R333 新增代码引入 Lint 问题，在本迭代一次性修复

### AC3: 覆盖率门禁通过
- 执行 `npm run test:coverage && npm run coverage:gate`，三项指标全部通过
- 当前门禁阈值（`package.json` → `coverage:gate`）：
  - Lines ≥ **28%**（基线 24.89%，目标 30%）
  - Functions ≥ **50%**（基线 49.79%，目标 52%）
  - Branches ≥ **75%**（基线 75.83%，已达标）
- R334 目标：R330-R333 新增代码（30+ 新测试用例）将行覆盖率和函数覆盖率推高至门禁阈值以上
- 若覆盖率门禁未通过，需分析未覆盖模块并补充测试用例（最多补充 10 个用例，超出则标记为已知差距并放宽门禁）
- 更新 `docs/reports/coverage-baseline.md` 中的基线快照数据

### AC4: 测试执行时间 ≤ 35s
- `npm run test:ci:gate` 使用 `scripts/check-test-time.sh` 验证
- 当前默认阈值 37s，本次发布收紧至 **35s**（更新 `TEST_TIME_THRESHOLD` 环境变量或脚本默认值）
- 若超时，排查 R330-R333 新增测试中的慢用例（sleep/大循环/IO 阻塞），优化至 35s 以内
- 不可为了时间而删除测试用例

### AC5: 版本号 bump 至 3.5.0
- `package.json` → `"version": "3.5.0"`
- `manifest.json` → `"version": "3.5.0"`
- 两个文件版本号严格一致（`scripts/publish-check.sh` 检查项之一）
- Minor 版本 bump（3.4.3 → 3.5.0）标志 R330-R333 带来的功能增强（搜索历史持久化、SidePanel 性能优化、知识图谱交互增强）

### AC6: CHANGELOG.md 补充 [3.5.0] 区段
- 在 CHANGELOG.md 最顶部新增 `## [3.5.0] - 2026-05-26` 区段
- 涵盖 R330-R333 变更摘要，按 Keep a Changelog 格式分类：
  - **新增**：搜索历史持久化 (R331)、SidePanel 性能基准与虚拟滚动 (R332)、知识图谱交互增强 (R333)
  - **修复**：3 个测试红灯清零 (R330)
  - **测试**：新增用例数、测试总数、覆盖率基线更新
  - **架构**：新模块列表（`lib/search-history.js`、`lib/virtual-scroll.js`、`lib/graph-interaction.js` 等）
- `[Unreleased]` 区段必须为空（无待发布内容残留）
- 格式与 `[3.1.0]`、`[3.0.0]` 等已有区段保持一致

### AC7: E2E 测试 ≥ 9 条路径通过
- 执行 `npm run test:e2e`，通过路径数 ≥ 9
- 覆盖核心场景：Smoke + 核心场景（SidePanel 书签、知识库、搜索、图谱等）
- 若 R331/R332/R333 影响 E2E 路径（如 SidePanel 加载流程变更），需同步更新 E2E 脚本
- E2E 失败不阻塞发布，但需在 CHANGELOG 中记录已知 E2E 差距

### AC8: 发布产物就绪
- 执行 `bash scripts/publish-check.sh`，全部检查项通过（exit code 0）
- 检查项包括：
  1. manifest.json 与 package.json 版本一致性（= 3.5.0）
  2. 权限最小化审计
  3. 必需图标存在性（16/48/128 px）
  4. `_locales` 完整性（zh_CN 与 en key 一致）
  5. 无残留开发文件
  6. 安全审计（eval/内联脚本/HTTPS）
- 若有 FAIL 项，逐一修复后重新执行至全部通过

### AC9: 文档同步更新
- **`docs/reports/coverage-baseline.md`**：更新基线快照（日期、实测覆盖率值、门禁阈值对齐状态、测试用例数）
- **`docs/ROADMAP.md`**：
  - 更新"当前状态"表格（版本 → v3.5.0、测试总数、迭代轮次 → R334）
  - 新增 Phase 行：`Phase AX: v3.5.0 版本发布 (R330-R334)`
  - 更新"已完成里程碑"区段
- **`docs/REQUIREMENTS.md`**：新增 R330-R333 需求条目（若缺失）

### AC10: [Unreleased] 区段为空
- CHANGELOG.md 中 `## [Unreleased]` 区段内容必须为空（仅保留标题）
- 确认无遗漏变更未被归入正式版本区段

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 零新功能代码 | R334 不新增任何 lib 模块或功能代码，仅版本号/文档/质量门禁操作 |
| 版本号同步 | package.json 和 manifest.json 必须同时更新，不得出现版本不一致 |
| CHANGELOG 格式 | 严格遵循 Keep a Changelog 规范，与已有 [3.1.0] / [3.0.0] 区段风格一致 |
| 测试门禁收紧 | `check-test-time.sh` 默认阈值从 37s 收紧至 35s |
| 覆盖率阈值 | 使用 `package.json` → `coverage:gate` 中的当前阈值（lines 28% / functions 50% / branches 75%），不盲目使用未经实测确认的更高阈值 |
| 不回退质量 | 任何单项门禁未通过时，需修复根因，不得通过跳过测试/删除用例/放宽阈值掩盖 |
| 发布产物 | `scripts/publish-check.sh` 验证通过后方可视为发布就绪 |
| Git 标签 | 发布完成后打 `v3.5.0` 标签 |
| 依赖 R330-R333 | 前置迭代的代码已合入 master 分支，无冲突 |

---

## 4. 依赖关系

### 上游依赖（输入）

| 迭代 | 名称 | 状态 | 提供物 |
|------|------|------|--------|
| R330 | TestFailureFlushR330 | ✅ 已完成 | 3 个测试红灯清零，`test:ci` 0 fail |
| R331 | SearchHistoryPersist | ✅ 已完成 | `lib/search-history.js` + 25 个测试用例 |
| R332 | SidebarPerfOpt | ✅ 已完成 | `lib/virtual-scroll.js` + `scripts/sidepanel-perf-benchmark.js` + 20 个测试用例 |
| R333 | KnowledgeGraphInteraction | ✅ 已完成 | `lib/graph-interaction.js` + 30 个测试用例 |

### 工具/脚本依赖

| 工具 | 文件 | 用途 |
|------|------|------|
| 发布自检脚本 | `scripts/publish-check.sh` | 验证发布产物就绪（版本一致性/权限/图标/locales/安全） |
| 版本 bump 脚本 | `scripts/bump-version.sh` | 自动同步更新 package.json / manifest.json / CHANGELOG |
| 测试时间门禁 | `scripts/check-test-time.sh` | 测试执行时间回归防火墙（阈值收紧至 35s） |
| 覆盖率门禁 | `npm run coverage:gate` (c8) | 覆盖率三项指标门禁检查 |
| E2E 框架 | `tests/e2e-chrome/` | Puppeteer 端到端测试 |

### 下游影响（输出）

| 消费者 | 影响 |
|--------|------|
| Chrome Web Store | v3.5.0 产物（.zip）上传至商店 |
| 用户 | 自动更新至 v3.5.0，获得 R331-R333 新功能 |
| 开发团队 | 干净的发布基线，后续迭代从此版本继续 |
| ROADMAP.md | 里程碑记录更新 |
| git tag | `v3.5.0` 标记发布节点 |

### 无隐式依赖

R334 为纯收尾迭代，不引入新的运行时依赖或外部服务依赖。

---

## 5. 执行计划

```
R334 执行流程
  │
  ├─ Step 1: 前置确认
  │     ├─ 确认 R330-R333 代码已合入 master
  │     └─ 确认 git status 干净（无未提交变更）
  │
  ├─ Step 2: 全量回归
  │     ├─ npm run test:ci         → 0 fail, ≥ 7700 pass
  │     ├─ npm run lint            → 0 errors, 0 warnings
  │     ├─ npm run test:coverage   → 生成覆盖率报告
  │     ├─ npm run coverage:gate   → lines/functions/branches 全部通过
  │     └─ bash scripts/check-test-time.sh  → ≤ 35s
  │
  ├─ Step 3: E2E 验证
  │     └─ npm run test:e2e        → ≥ 9 条路径通过
  │
  ├─ Step 4: 版本 bump
  │     ├─ package.json  → 3.5.0
  │     └─ manifest.json → 3.5.0
  │
  ├─ Step 5: 文档更新
  │     ├─ CHANGELOG.md   → [3.5.0] 区段 + [Unreleased] 清空
  │     ├─ ROADMAP.md     → 当前状态 + Phase AX 里程碑
  │     ├─ coverage-baseline.md → 更新基线快照
  │     └─ REQUIREMENTS.md → R330-R333 条目
  │
  ├─ Step 6: 发布检查
  │     └─ bash scripts/publish-check.sh → exit 0
  │
  └─ Step 7: 打标签发布
        ├─ git add + commit
        └─ git tag v3.5.0
```

---

## 6. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| R331-R333 新增用例导致测试执行时间 > 35s | 中 | 排查慢用例（sleep/IO），优化后再收紧阈值；极端情况下保留 37s 阈值 |
| 覆盖率门禁未通过（新代码覆盖率低于基线） | 低 | 补充 ≤ 10 个边界用例至达标；若差距过大则暂缓收紧阈值 |
| E2E 因 R332/R333 改动导致路径失败 | 低 | 修复 E2E 脚本适配新逻辑；非阻塞项记录至 CHANGELOG |
| CHANGELOG 遗漏 R330-R333 某项变更 | 低 | 对照 git log (commit 6589935 ~ f0c5818) 逐条核对 |

---

## 7. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | **修改** | version → 3.5.0 |
| `manifest.json` | **修改** | version → 3.5.0 |
| `CHANGELOG.md` | **修改** | 新增 [3.5.0] 区段，清空 [Unreleased] |
| `docs/ROADMAP.md` | **修改** | 更新当前状态 + 新增 Phase AX |
| `docs/reports/coverage-baseline.md` | **修改** | 更新基线快照数据 |
| `docs/REQUIREMENTS.md` | **修改** | 新增 R330-R333 条目 |
| `scripts/check-test-time.sh` | **可能修改** | 默认阈值从 37s 收紧至 35s |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-26 | R334 | 初始创建 — ReleaseV350 全量回归与 v3.5.0 发布需求文档 |
