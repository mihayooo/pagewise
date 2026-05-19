# 需求文档 — 迭代 34: 测试覆盖率提升 TestCoverageBoost

> 需求编号: R137  
> 日期: 2026-05-19  
> 复杂度: Medium  
> 状态: 📋 待开发

---

## 1. 用户故事

**作为** PageWise 项目的维护者，  
**我希望** 了解代码的真实测试覆盖率基线，并将覆盖率低的关键模块补充到 ≥80%，  
**以便** 在后续迭代中有信心安全地重构和扩展代码，减少回归风险。

---

## 2. 背景与问题分析

### 2.1 覆盖率基线失真

| 指标 | 报告值 | 实际值 | 问题 |
|------|--------|--------|------|
| R108 报告行覆盖率 | 92.15% | — | 基线来自历史快照 |
| R33 报告测试数 | 0 pass / 0 fail | — | 迭代报告流水线未正确采集 `node --test` 输出 |
| 当前测试结果 | — | **5496 pass / 21 fail** (5517 total) | 通过 `npm run test:ci` 实测 |
| 全局语句覆盖率 | — | **93.51%** (37827/40452) | c8 text-summary 实测 (2026-05-19) |
| lib/ 模块语句覆盖率 | — | **91.6%** (35640/38890) | 但存在两个盲区 |

**核心问题**: `lib/agent-loop.js` (231 行) 和 `lib/evolution.js` (547 行) **未出现在 c8 覆盖率数据中**——c8 没有对这两个文件进行插桩，导致整体覆盖率虚高。

### 2.2 低覆盖率模块清单 (lib/ < 80%)

| 覆盖率 | 模块 | 行数 | 风险等级 |
|--------|------|------|----------|
| **10.0%** | `bookmark-tag-editor.js` | 209 stmts | 🔴 严重 |
| **10.2%** | `knowledge-graph-utils.js` | 147 stmts | 🔴 严重 |
| **10.9%** | `knowledge-graph-wiki.js` | 128 stmts | 🔴 严重 |
| **24.2%** | `skill-store-community.js` | 306 stmts | 🔴 严重 |
| **34.1%** | `skill-store.js` | 255 stmts | 🔴 严重 |
| **47.5%** | `compilation-report-format.js` | 255 stmts | 🟡 中等 |
| **52.3%** | `knowledge-base-export.js` | 279 stmts | 🟡 中等 |
| **63.7%** | `docmind-client.js` | 443 stmts | 🟡 中等 |
| **65.5%** | `knowledge-panel.js` | 528 stmts | 🟡 中等 |
| **66.5%** | `bookmark-store-prep-checks.js` | 316 stmts | 🟡 中等 |
| **71.2%** | `message-renderer.js` | 539 stmts | 🟠 偏低 |
| **72.5%** | `knowledge-panel-batch.js` | 193 stmts | 🟠 偏低 |
| **73.5%** | `knowledge-panel-virtual.js` | 260 stmts | 🟠 偏低 |
| **75.8%** | `bookmark-folder-suggestions.js` | 33 stmts | 🟠 偏低 |
| **77.6%** | `bookmark-accessibility-navigator.js` | 147 stmts | 🟠 偏低 |
| **78.7%** | `stats.js` | 338 stmts | 🟠 偏低 |
| **79.2%** | `i18n.js` | 418 stmts | 🟠 偏低 |
| **79.4%** | `bookmark-store-prep.js` | 218 stmts | 🟠 偏低 |

共计 **18 个模块**低于 80% 阈值。

### 2.3 21 个失败用例分布

| 测试文件 | 失败数 | 模块 |
|----------|--------|------|
| `test-ai-client.js` | 7 | AIClient vision 消息格式 |
| `test-bookmark-semantic-search.js` | 1 | _mergeResults 合并去重 |
| `test-bookmark-tag-editor-unit.js` | 2 | 构造函数 / 标签规范化 |
| `test-bookmark-visualizer.js` | 1 | 节点半径缩放 |
| `test-evolution.js` | 5 | evolve / batchEvolve / reset |
| `test-r137-coverage-boost.js` | 1 | data URL 图片处理 |
| 其他 | 4 | 待定位 |

---

## 3. 验收标准

### AC1: 建立准确覆盖率基线
- 运行 `npm run test:coverage`，输出完整的 lcov + text-summary 报告
- 确认 `lib/agent-loop.js` 和 `lib/evolution.js` 出现在 c8 覆盖率数据中（若 c8 无法覆盖则使用 `--all` 或手动标注排除原因）
- 将基线数据记录到 `docs/reports/2026-05-19-R34-coverage-baseline.md`

### AC2: 修复现有失败用例
- `npm run test:ci` 结果: **0 fail**（当前 21 fail）
- 每个修复需记录失败原因和修复策略

### AC3: 低覆盖率模块达标
- **18 个 <80% 的 lib/ 模块**中，至少 **12 个**达到 ≥80% 行覆盖率
- **红色区域**（<40%）的 5 个模块**全部**达到 ≥80%
- 特别关注: `bookmark-tag-editor.js`、`knowledge-graph-utils.js`、`knowledge-graph-wiki.js`、`skill-store-community.js`、`skill-store.js`

### AC4: lib/ 整体覆盖率提升
- `lib/` 模块整体行覆盖率 **≥ 85%**（包含 agent-loop 和 evolution 的真实数据）
- 覆盖率报告可通过 `npm run test:coverage` 一键生成并验证

### AC5: 测试基础设施修复
- 修复迭代报告采集流程，确保 R34 报告正确记录 pass/fail 数量（不再出现 0/0）
- 新增测试文件遵循 `tests/test-{module-name}.js` 命名规范

---

## 4. 技术约束

1. **不修改生产代码逻辑** — 本次迭代仅补充测试，不变更 lib/ 模块的功能行为。修复 21 个失败用例时，优先修正测试代码而非生产代码；若确认生产代码有 bug，需单独标注并记录到 TODO.md
2. **测试框架** — 使用 Node.js 内置 `node --test`（已有 153 个测试文件、5517 个用例），不引入 Jest/Mocha 等外部框架
3. **覆盖率工具** — 使用 c8（已在 devDependencies），配置 lcov + text-summary 输出
4. **Chrome API Mock** — 测试中使用已有的 `tests/helpers/` 和 `tests/e2e/chrome-mock-inject.js` 中的 stub；新增测试需遵循相同模式
5. **测试隔离** — 每个测试文件独立可运行（`node tests/test-xxx.js`），不依赖测试执行顺序
6. **c8 插桩问题** — `agent-loop.js` 和 `evolution.js` 可能因 ESM 动态 import 或 Chrome API 全局依赖导致 c8 无法插桩，需排查根因（优先），或在 c8 配置中用 `--include` 显式包含

---

## 5. 依赖关系

| 依赖 | 说明 |
|------|------|
| R108 (覆盖率基线) | 历史基线数据 (92.15%)，本次迭代需验证并修正 |
| R136 (E2E 测试) | 上一迭代产出的 E2E 测试文件（R33），但报告采集流程有 bug |
| R134 (模块拆分三期) | 多个模块已拆分为子文件（如 `ai-client-stream.js`、`bookmark-accessibility-navigator.js`），测试需覆盖拆分后的子模块 |
| R133 (Lint 警告清零) | 新增测试代码需通过 lint 检查（`--max-warnings 0`） |
| `tests/test-agent-loop.js` | 已存在 (406 行)，但 evolution 测试有 5 个失败 |
| `tests/test-evolution.js` | 已存在 (650 行)，需修复失败用例后提升覆盖率 |
| `tests/test-bookmark-tag-editor-unit.js` | 已存在 (248 行)，2 个失败且覆盖率仅 10% |
| `tests/test-knowledge-graph-utils-unit.js` | 已存在 (249 行)，覆盖率仅 10.2% |
| `tests/test-knowledge-graph-wiki-unit.js` | 已存在 (208 行)，覆盖率仅 10.9% |

---

## 6. 建议执行顺序

### Phase 1: 基线建立与修复 (Day 1)
1. 运行 `npm run test:coverage`，生成准确基线报告
2. 排查 `agent-loop.js` 和 `evolution.js` 未被 c8 插桩的原因
3. 修复 21 个失败用例（分模块逐一修复）

### Phase 2: 红色区域补测试 (Day 1-2)
4. `bookmark-tag-editor.js` — 补充构造函数、标签操作、批量编辑用例
5. `knowledge-graph-utils.js` — 补充图遍历、路径计算、异常处理用例
6. `knowledge-graph-wiki.js` — 补充 wiki 查询、缓存、降级用例
7. `skill-store-community.js` — 补充社区技能 CRUD、搜索、导入用例
8. `skill-store.js` — 补充技能存储、分类、激活用例

### Phase 3: 黄色区域提升 (Day 2-3)
9. `compilation-report-format.js` — 补充格式化、边界值用例
10. `knowledge-base-export.js` — 补充导出格式、大数据量用例
11. `knowledge-panel.js` — 补充面板渲染、交互用例
12. `message-renderer.js` — 补充消息渲染、Markdown 解析用例
13. `stats.js` — 补充统计计算、边界值用例
14. 其余 <80% 模块按优先级补充

### Phase 4: 验证与报告 (Day 3)
15. 运行 `npm run test:coverage`，验证 lib/ ≥85%
16. 生成 `docs/reports/2026-05-19-R34.md`
17. 修复迭代报告采集，确保 pass/fail 正确记录

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| c8 无法插桩 agent-loop/evolution | 中 | 基线失真 | 排查 ESM/import 原因；最坏情况用 `--all` 或手动排除并记录 |
| 21 个失败用例涉及生产代码 bug | 低 | 需跨迭代修复 | 先记录，仅修正测试；生产 bug 另开需求 |
| 新增测试代码本身引入 lint 错误 | 低 | CI 不通过 | 每个文件提交前运行 `npm run lint` |
| 大型模块 (knowledge-panel 528 stmts) 测试编写耗时 | 中 | 迭代超时 | 优先覆盖核心路径，非核心路径标记 `// TODO: R138` |

---

*文档遵循飞轮迭代流程，迭代 34*  
*生成于 2026-05-19*
