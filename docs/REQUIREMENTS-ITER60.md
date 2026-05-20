# 需求文档 R218: CHANGELOG [3.1.0] 区段补全与发布收尾 ChangelogV310Finalize

> **迭代**: R218 (飞轮迭代 #60)
> **日期**: 2026-05-20
> **复杂度**: Simple
> **分类**: 文档 / 发布收尾

---

## 1. 用户故事

作为 PageWise 项目的维护者，我希望 CHANGELOG.md 中包含完整的 `[3.1.0]` 区段，以便任何协作者（或自动化工具）能够快速了解 v3.0.0 → v3.1.0 之间 25+ 轮增量迭代（R190-R217）的全部变更，从而顺利执行 Chrome Web Store 发布。

---

## 2. 问题分析

### 2.1 现状

| 检查项 | 当前值 | 期望值 | 状态 |
|--------|--------|--------|------|
| CHANGELOG.md 最高版本区段 | `[3.0.0] - 2026-05-16` | `[3.1.0] - 2026-05-20` | ❌ 缺失 |
| CHANGELOG.md 次高版本区段 | `[2.3.0] - 2026-05-04` | — | ⚠️ 3.1.0 区段被跳过 |
| package.json `version` | `3.1.0` | `3.1.0` | ✅ 一致 |
| manifest.json `version` | `3.1.0` | `3.1.0` | ✅ 一致 |
| `RELEASE-NOTES-v3.1.md` | 存在（124 行），仅覆盖至 R208 | 覆盖至 R217 | ⚠️ 不完整 |
| `npm run test:ci` | 6 fail（E2E 书签面板/知识面板） | 0 fail | ❌ 阻塞 |
| `npm run lint` | 5 warnings（`no-unused-vars`） | 0 errors / 0 warnings | ❌ 阻塞 |

### 2.2 根因

- R197（飞轮迭代 #39）曾尝试补全 CHANGELOG `[3.1.0]` 区段，但后续 commit（R198-R217）的持续变更导致该区段从未落地或被覆盖。
- `RELEASE-NOTES-v3.1.md` 在 R208 生成后，R209-R217 的 9 轮迭代未追加。
- 6 个 E2E 测试失败为真实 Chrome 环境断言，可能因模块拆分（R203/R206/R217）改变了 DOM 结构而未同步更新测试。
- 5 个 lint 警告来自 `lib/` 下 5 处 `no-unused-vars` 违规（含 `MINIMAL_CSP` 等常量）。

---

## 3. 验收标准

### AC-1: CHANGELOG.md `[3.1.0]` 区段完整

CHANGELOG.md 在 `[3.0.0]` 区段**之前**插入 `[3.1.0] - 2026-05-20` 区段，按 [Keep a Changelog](https://keepachangelog.com/) 格式，涵盖以下 25+ 轮迭代的变更，按类别分组：

| 类别 | 涉及迭代 | 变更摘要 |
|------|----------|----------|
| **架构 — 模块拆分** | R193, R196, R203, R206, R217 | 5 期超大模块拆分，36 个 >400 行文件拆分至 ≤400 行（re-export 模式） |
| **架构 — 模块合并** | R207 | 合并 3 对功能重叠模块（-3 modules） |
| **质量 — 覆盖率** | R192, R205, R216 | 覆盖率基础设施修复 + 门禁从 20% → 35% |
| **质量 — 测试修复** | R190, R200, R215 | 修复 24 个失败用例（超时/断言/命名冲突） |
| **质量 — Lint 清零** | R191, R201 | ESLint 0 errors / 0 warnings |
| **质量 — 测试效率** | R198, R202 | 测试执行 45s → 24s（-47%） |
| **质量 — E2E** | R199, R211 | 学习闭环 E2E + 真实 Chrome Puppeteer 验证框架 |
| **发布 — 构建** | R208 | 标准化 build.sh + publish-check.sh |
| **发布 — 自动化** | R214 | GitHub Actions 发布 workflow + 版本号 bump 脚本 + CHANGELOG 自动生成 |
| **发布 — CWS 提交** | R210 | 隐私政策、Listing 资产、权限最小化审查 |
| **发布 — CI 门禁** | R213 | 性能回归 CI job（smoke test ≤5s） |
| **运营 — 遥测反馈** | R212 | 本地遥测 + NPS 反馈收集（纯本地，可关闭） |
| **文档** | R197, R209 | 版本号统一 + ROADMAP/README/CHANGELOG 全面更新 |

区段须包含以下子标题（仅列出有变更的）：

```markdown
## [3.1.0] - 2026-05-20

### 新增
### 变更
### 架构
### 测试
### 文档
### 修复
```

### AC-2: 版本号三处一致

验证以下三处版本号字段均为 `3.1.0`：

- `package.json` → `"version": "3.1.0"`
- `manifest.json` → `"version": "3.1.0"`
- `CHANGELOG.md` → `## [3.1.0]`

> **当前状态**: package.json 与 manifest.json 已为 `3.1.0`，无需修改。仅需确认 CHANGELOG 区段标题与前两者对齐。

### AC-3: RELEASE-NOTES-v3.1.md 生成/更新

生成（或更新已有的）`docs/RELEASE-NOTES-v3.1.md`，内容要求：

1. **Overview**: 概述 v3.0.0 → v3.1.0 的核心成就（模块架构瘦身、测试覆盖率提升、发布自动化）
2. **What's New**: 按功能域列出亮点（模块拆分、覆盖率门禁、E2E 框架、遥测反馈、发布流水线）
3. **Statistics Table**: v3.0.0 vs v3.1.0 关键指标对比表（迭代轮次、测试用例数、执行时间、覆盖率门禁、>400 行文件数、ESLint 警告数）
4. **Migration Guide**: 从 v3.0.0 升级说明（无需迁移，re-export 向后兼容）
5. **Known Limitations**: 已知限制

> **当前状态**: 已有 124 行版本，仅覆盖至 R208。需追加 R209-R217 变更并更新统计表。

### AC-4: 全量回归通过

```bash
npm run test:ci    # 0 fail
npm run lint       # 0 errors, 0 warnings
```

> **当前阻塞**:
> - `test:ci` 有 6 个 E2E 失败（书签面板 7 断言 / 知识面板 2 断言），需修复
> - `lint` 有 5 个 `no-unused-vars` 警告（含 `MINIMAL_CSP`），需清理

---

## 4. 技术约束

1. **CHANGELOG 格式**: 严格遵循 [Keep a Changelog v1.1.0](https://keepachangelog.com/) 规范，中英文均可（与现有 [3.0.0] 区段风格保持一致，使用中文）。
2. **变更来源**: 仅从 git log 提取 R190-R217 的 commit message，不编造未发生的变更。R215-R217 虽超出任务标题的 R190-R214 范围，但同属 v3.1.0 版本，应一并纳入。
3. **Re-export 兼容**: 模块拆分使用 re-export wrapper 模式，CHANGELOG 中须注明 "API 向后兼容"。
4. **RELEASE-NOTES 文件路径**: `docs/RELEASE-NOTES-v3.1.md`（已有文件就地更新，不创建新文件）。
5. **不修改功能代码**: 本任务仅涉及文档生成和测试/lint 修复，不新增功能。
6. **E2E 测试修复范围**: 6 个失败用例来自 `tests/e2e/` 目录下的真实 Chrome 环境测试，修复时需确认是断言过时（模块拆分后 DOM 结构变化）还是真实回归。

---

## 5. 依赖关系

### 5.1 前置依赖

| 依赖项 | 说明 | 状态 |
|--------|------|------|
| R217 (ModuleSplitPhase13) | 最后一轮模块拆分，影响 CHANGELOG 内容 | ✅ 已完成 (bb44917) |
| R216 (CoverageSprint40) | 覆盖率冲刺，影响 CHANGELOG 内容 | ✅ 已完成 (37b9be2) |
| R215 (TestFailureFixR215) | 测试修复，影响 CHANGELOG 内容 | ✅ 已完成 (7003ca2) |

### 5.2 后续依赖

| 依赖项 | 说明 |
|--------|------|
| Chrome Web Store 发布 | CHANGELOG 和 RELEASE-NOTES 完成后方可打 tag 并触发 R214 的发布 workflow |
| Git tag `v3.1.0` | 发布收尾的最终步骤，需在本任务验收通过后创建 |

### 5.3 阻塞风险

- **测试修复复杂度不确定**: 6 个 E2E 失败可能涉及 Puppeteer 环境配置或 DOM 结构变化，修复难度可能高于预期（任务复杂度从 Simple 上升为 Medium）。
- **Lint 修复简单但需确认影响面**: `MINIMAL_CSP` 等未使用变量可能是有意保留的常量（用于未来扩展），需判断是否加 `_` 前缀或删除。

---

## 6. 任务拆解

| # | 子任务 | 预估工时 | 备注 |
|---|--------|----------|------|
| 1 | 从 git log 提取 R190-R217 变更摘要，按类别分组 | 15 min | 参考 `git log --oneline` 输出 |
| 2 | 编写 CHANGELOG.md `[3.1.0]` 区段并插入 | 20 min | 插入到 `[3.0.0]` 之前 |
| 3 | 更新 `docs/RELEASE-NOTES-v3.1.md` | 15 min | 追加 R209-R217 + 更新统计表 |
| 4 | 修复 6 个 E2E 测试失败 | 30 min | 可能需要调整断言或修复 DOM 选择器 |
| 5 | 修复 5 个 lint warnings | 10 min | 加 `_` 前缀或移除未使用变量 |
| 6 | 运行全量回归验证 | 5 min | `test:ci` 0 fail + `lint` 0/0 |

**总预估**: ~95 min（约 1.5 小时）

---

## 7. CHANGELOG `[3.1.0]` 区段草稿结构

> 以下为结构指引，具体条目从 git log 提取后填充。

```markdown
## [3.1.0] - 2026-05-20

v3.0.0 之后的增量迭代（R190-R217），聚焦模块架构瘦身、测试覆盖率提升、发布自动化与 Chrome Web Store 提交准备。

### 新增

- **本地遥测模块** (R212): 功能使用频率统计、错误率追踪、性能指标，纯本地存储
- **NPS 反馈收集** (R212): 使用 7 天后弹出评分，支持导出 JSON
- **真实 Chrome E2E 框架** (R211): Puppeteer 测试框架，验证核心流程和书签流程
- **学习闭环 E2E** (R199): 间隔复习、学习目标、智能摘录、学习教练完整流程验证
- **发布自动化** (R214): GitHub Actions workflow + 版本号 bump + CHANGELOG 自动生成
- **性能回归 CI 门禁** (R213): smoke test ≤5s 性能基准

### 变更

- **模块拆分 5 期** (R193, R196, R203, R206, R217): 36 个 >400 行 lib 文件拆分至 ≤400 行，re-export 向后兼容
- **模块合并** (R207): 合并 3 对功能重叠模块，减少 lib/ 模块数
- **覆盖率门禁** (R205, R216): 从 20% → 35%
- **测试执行效率** (R198, R202): 全量测试 45s → 24s（-47%）
- **文档全面更新** (R209): ROADMAP/README/CHANGELOG 与项目现状对齐

### 修复

- **覆盖率基础设施** (R192): 修复 c8 报告生成 EACCES 权限错误
- **测试失败** (R190, R200, R215): 修复超时/断言/命名冲突共 24 个用例
- **ESLint 清零** (R191, R201): 0 errors / 0 warnings
- **版本号统一** (R197): package.json/manifest.json/CHANGELOG 对齐至 3.1.0

### 发布

- **构建产物** (R208): 标准化 build.sh + publish-check.sh + 截图指引
- **Chrome Web Store** (R210): 隐私政策、Listing 资产、权限审查、发布前自检
```

---

> **文档版本**: v1.0 | **作者**: Plan Agent | **日期**: 2026-05-20
