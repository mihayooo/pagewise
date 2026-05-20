# 需求文档 — R184: 探索性改进

> 迭代: R184（飞轮迭代 R26）
> 日期: 2026-05-20
> 复杂度: Medium
> 阶段: 技术债务清偿 + 代码质量修复
> 状态: 📋 待开发

---

## 0. 背景与现状审计

### 项目快照（2026-05-20 实测）

| 指标 | 当前值 | 目标值 | 差距 |
|------|--------|--------|------|
| **测试通过** | 6,548 | 6,551+ | 修复 3 个失败用例 |
| **测试失败** | 3 | 0 | ← 全部在 `test-r156-coverage-infra.js` |
| **Lint 错误/警告** | 0 / 0 | 0 / 0 | ✅ 已达标 |
| **lib 模块数** | 196 | ≤220 | ✅ 未超限 |
| **lib 文件总行数** | 50,885 | — | 14 个文件 >400 行 |
| **最大文件** | 624 行 | ≤400 行 | 224 行超限 |

### 历史迭代失败分析

R24（R182）和 R25（R183）**全部阶段失败**（需求、设计、实现均 ❌），零代码变更产出。根因分析：

| 问题 | 影响 | 本次改进策略 |
|------|------|-------------|
| R182 需求范围过大（UX 整合 + 20+ 幽灵模块验证） | 无法在单轮迭代内完成 | 本次聚焦可量化、可验证的小范围目标 |
| R183 "稳定性提升"定义模糊 | 实现 Agent 无法确定具体任务 | 本次每条验收标准都有精确的度量指标 |
| 幽灵模块问题：20+ 个 TODO 标记为 ✅ 但源文件不存在 | R182 审计暴露严重的真实 vs. 标记脱节 | 本次不新建模块，专注修复已有代码 |
| 测试基础设施的 3 个失败用例连续 3 轮未修复 | 阻塞 CI 门禁 | 本次优先修复 |

---

## 一、用户故事

### US-1: 开发者希望 CI 流水线全绿

> 作为一名 PageWise 开发者，我希望每次提交代码后 CI 都能顺利通过（0 fail / 0 error），这样我可以自信地进行下一次迭代，而不是每次都忽略测试失败。

### US-2: 维护者希望大型文件得到拆分

> 作为一名代码维护者，我希望每个 lib 文件不超过 400 行，这样我可以在不滚动数百行的情况下理解和修改任何一个模块。

---

## 二、验收标准

### AC-1: 测试失败清零 — 修复 3 个测试用例

**目标**: `npm run test:ci` 输出 `# fail 0`

- [ ] 修复 `tests/test-r156-coverage-infra.js` 中 "Preflight 清理机制验证" 的 3 个子测试：
  - `rm -rf coverage/tmp 可清理不存在的目录（静默跳过）` — 断言错误或环境权限问题
  - `rm -rf coverage/tmp 可清理普通用户创建的 tmp 目录` — 同上
  - `清理后可创建新的 tmp 目录` — 同上
- [ ] 修复方式应理解根因而非注释掉测试：检查是权限问题、路径问题还是 mock 缺失
- [ ] 全量回归 6,551+ pass / 0 fail

### AC-2: 超大文件拆分 — 14 个 >400 行文件全部合规

**目标**: `wc -l lib/*.js` 最大值 ≤400 行

按优先级拆分以下 14 个文件（当前行数 → 目标 ≤400 行）：

| # | 文件 | 当前行数 | 超出 | 拆分策略 |
|---|------|---------|------|----------|
| 1 | `bookmark-knowledge-packs.js` | 624 | +224 | 拆出 pack-creation.js + pack-import.js + pack-market.js |
| 2 | `bookmark-weekly-digest.js` | 580 | +180 | 拆出 digest-statistics.js + digest-generator.js |
| 3 | `bookmark-highlight-archive.js` | 549 | +149 | 拆出 archive-batch.js + archive-context.js |
| 4 | `bookmark-knowledge-integration.js` | 547 | +147 | 拆出 integration-nav.js + integration-enrich.js |
| 5 | `message-renderer.js` | 539 | +139 | 拆出 renderer-markdown.js + renderer-code.js |
| 6 | `bookmark-user-profile.js` | 535 | +135 | 拆出 profile-vector.js + profile-inference.js |
| 7 | `knowledge-panel.js` | 528 | +128 | 拆出 panel-renderer.js + panel-actions.js |
| 8 | `bookmark-spaced-repetition.js` | 528 | +128 | 拆出 sr-scheduler.js + sr-stats.js |
| 9 | `architecture-health-monitor.js` | 498 | +98 | 拆出 health-deps.js + health-metrics.js |
| 10 | `bookmark-notifier.js` | 493 | +93 | 拆出 notifier-channels.js |
| 11 | `bookmark-duplicate-detector.js` | 474 | +74 | 拆出 dedup-url.js + dedup-title.js |
| 12 | `bookmark-smart-collections.js` | 473 | +73 | 拆出 collections-engine.js |
| 13 | `page-summarizer.js` | 469 | +69 | 拆出 summarizer-prompts.js |
| 14 | `bookmark-performance.js` | 464 | +64 | 拆出 perf-batch.js |

**拆分约束**：
- 保持原有公共 API 签名不变（re-export 模式：原文件导入子模块并 re-export）
- 拆分后每个子模块 ≤400 行
- 拆分后所有现有测试不需修改即可通过（向后兼容）
- 每个新文件职责单一，命名体现拆分边界

### AC-3: 全量回归与质量门禁

- [ ] `npm run test:ci` → 6,551+ pass / 0 fail
- [ ] `npm run lint` → 0 errors / 0 warnings
- [ ] `wc -l lib/*.js | sort -rn | head -1` → 最大值 ≤400 行
- [ ] 无新增文件引入循环依赖（`scripts/architecture-guard.sh` 通过）

### AC-4: 幽灵模块审计与清理

基于 R182 审计发现的 TODO.md 脱节问题：

- [ ] 审计所有 Phase S-W（R163-R186）中标记为 ✅ 的需求
- [ ] 对源文件不存在的项目：将 TODO.md 中的 `[x]` 改为 `[ ]`，并在条目末尾标注 `⚠️ 文件不存在`
- [ ] 对源文件存在但未接入 UI 的项目：保持 `[x]`，不做变更（属后续迭代范畴）
- [ ] 输出审计报告：`docs/reports/ghost-modules-audit.md`，列出每个模块的实际状态

### AC-5: 文档同步更新

- [ ] `docs/CHANGELOG.md` 补充 R184 变更记录
- [ ] `docs/TODO.md` 幽灵模块状态修正（AC-4）
- [ ] 拆分的新模块记录到 `docs/IMPLEMENTATION.md`

---

## 三、技术约束

### TC-1: 不新建功能模块

本轮迭代只做以下操作：
- **修复**：修复测试文件断言
- **拆分**：将大文件拆为多个小文件（re-export 模式）
- **审计**：清理 TODO.md 虚假标记

不创建任何新的 `lib/` 功能模块。

### TC-2: Re-export 模式保持向后兼容

拆分后原文件必须保持相同的导出：

```js
// bookmark-knowledge-packs.js（拆分后）
export { createKnowledgePack, sanitizePack } from './knowledge-packs-creation.js';
export { importKnowledgePack } from './knowledge-packs-import.js';
export { listCommunityPacks, searchPacks } from './knowledge-packs-market.js';
```

所有现有 `import` 语句无需修改。

### TC-3: 测试修复必须理解根因

不接受以下修复方式：
- ❌ 注释掉测试用例
- ❌ 跳过测试（`skip`/`todo`）
- ❌ 删除测试文件

必须分析断言失败的根因并正确修复。

### TC-4: 拆分粒度指导原则

- 每个子模块 ≥100 行（避免碎片化）
- 每个子模块有明确的单一职责
- 命名规范：`原模块名-功能.js`（如 `sr-scheduler.js`、`digest-statistics.js`）
- 如果原模块有内部共享状态，共享部分留在主文件中

---

## 四、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| `npm run test:ci` 基础设施 | 强依赖 | 需要能正常运行全量测试并获得 pass/fail 统计 |
| `npm run lint` 基础设施 | 强依赖 | 需要能正常运行 ESLint 检查 |
| `scripts/architecture-guard.sh` | 弱依赖 | 用于验证循环依赖和文件行数约束 |
| 14 个待拆分 lib 文件的现有测试 | 数据依赖 | 拆分后这些测试必须不修改即可通过 |

### 无外部依赖

本轮迭代不引入任何新的 npm 包、Chrome API 或外部服务。

---

## 五、文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `tests/test-r156-coverage-infra.js` | 修复 3 个失败断言 |
| 修改 | `lib/bookmark-knowledge-packs.js` | 拆分 + re-export |
| 新增 | `lib/knowledge-packs-creation.js` | 从上述文件拆出 |
| 新增 | `lib/knowledge-packs-import.js` | 从上述文件拆出 |
| 新增 | `lib/knowledge-packs-market.js` | 从上述文件拆出 |
| 修改 | `lib/bookmark-weekly-digest.js` | 拆分 + re-export |
| 新增 | `lib/digest-statistics.js` | 从上述文件拆出 |
| 新增 | `lib/digest-generator.js` | 从上述文件拆出 |
| 修改 | 11 个其余 >400 行文件 | 同上模式拆分 |
| 修改 | `docs/TODO.md` | 幽灵模块状态修正 |
| 修改 | `docs/CHANGELOG.md` | R184 变更记录 |
| 修改 | `docs/IMPLEMENTATION.md` | 拆分模块记录 |
| 新增 | `docs/reports/ghost-modules-audit.md` | 幽灵模块审计报告 |

预计新增文件: ~28 个拆分子模块
预计修改文件: 14 个原文件 + 3 个文档 + 1 个测试

---

## 六、不在范围内 (Out of Scope)

| 项目 | 原因 | 归属 |
|------|------|------|
| 实现幽灵模块（源文件不存在的功能） | 需要完整的功能设计，超出单轮迭代 | 后续迭代 |
| 将已实现模块接入侧边栏 UI | 属于 UX 整合，需要独立需求 | 后续迭代 |
| 新功能开发 | 本轮聚焦质量修复 | 后续迭代 |
| 覆盖率提升 | 本轮不补充新测试，只修复已有失败测试 | 后续迭代 |
| sidebar.js 拆分 | 7705 行，拆分复杂度极高，需独立迭代 | 独立需求 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 拆分后 re-export 遗漏某些导出 | 中 | 高 | 拆分后运行全量回归，比对导出列表 |
| 测试修复引入新失败 | 低 | 高 | 每修复一个测试立即运行 `npm run test:ci` 验证 |
| 拆分子模块产生循环依赖 | 中 | 中 | 拆分前绘制依赖图，运行 architecture-guard.sh 验证 |
| 14 个文件拆分工作量大 | 低 | 中 | 按优先级排序，先拆最大的 5 个，验证模式后再批量处理 |

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 测试失败数 | 0 | `npm run test:ci` 输出 `# fail 0` |
| 最大文件行数 | ≤400 | `wc -l lib/*.js \| sort -rn \| head -1` |
| >400 行文件数 | 0 | `wc -l lib/*.js \| awk '$1 > 400' \| wc -l` |
| Lint 问题 | 0 errors / 0 warnings | `npm run lint` |
| 现有测试不回归 | 6,551+ pass | 全量回归 |
| 幽灵模块已标记 | 100% 审计完成 | ghost-modules-audit.md |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-20 | 初始化 R184 探索性改进需求文档 |