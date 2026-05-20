# REQUIREMENTS — R181: 测试覆盖率提升

> 迭代: R181
> 日期: 2026-05-20
> 复杂度: Complex（基础设施加固，跨模块影响）

---

## 背景与现状

### 当前覆盖率基线（2026-05-20 实测）

| 指标 | 当前值 | 目标值 | 差距 |
|------|--------|--------|------|
| **行覆盖率** | 84.80% | ≥85% | +0.20% |
| **分支覆盖率** | 85.43% | ≥85% | ✅ 已达标 |
| **函数覆盖率** | 88.51% | ≥90% | +1.49% |
| **测试用例** | 6,419 pass / 3 fail | 0 fail | 修复 3 个失败用例 |
| **测试文件** | 177 个 | — | — |
| **lib 模块** | 192 个 | — | — |

### 0% 覆盖率模块（15 个，共 4,797 行）

| # | 模块 | 行数 | 模块类型 | 测试难度 |
|---|------|------|----------|----------|
| 1 | `bookmark-highlight-archive.js` | 549 | 纯逻辑（依赖注入） | Medium |
| 2 | `bookmark-knowledge-integration.js` | 547 | 编排层（依赖注入） | Medium |
| 3 | `architecture-health-monitor.js` | 498 | 纯逻辑（零依赖） | Easy |
| 4 | `docmind-sync.js` | 414 | Chrome API 依赖 | Hard |
| 5 | `bookmark-tag-editor-v2.js` | 412 | 纯逻辑 | Easy |
| 6 | `core-flow-fix.js` | 384 | 纯逻辑（零依赖） | Easy |
| 7 | `bookmark-learning-progress.js` | 284 | DB 依赖 | Medium |
| 8 | `importer.js` | 297 | 文件 I/O 依赖 | Medium |
| 9 | `bookmark-knowledge-link.js` | 344 | 纯逻辑（依赖注入） | Medium |
| 10 | `bookmark-graph-visualizer.js` | 241 | Canvas/DOM 依赖 | Hard |
| 11 | `selection-toolbar-global.js` | 201 | IIFE（DOM 依赖） | Hard |
| 12 | `graph-export.js` | 197 | 纯逻辑（零依赖） | Easy |
| 13 | `architecture-health-report.js` | 153 | 纯逻辑（零依赖） | Easy |
| 14 | `bookmark-duplicate-detector-detect.js` | 181 | 纯逻辑（零依赖） | Easy |
| 15 | `architecture-health-deadcode.js` | 95 | 纯逻辑（零依赖） | Easy |

### 低覆盖率模块（13 个，行覆盖率 <80%）

| # | 模块 | 行覆盖率 | 目标 |
|---|------|----------|------|
| 1 | `skill-store-community.js` | 23.68% | ≥80% |
| 2 | `bookmark-learning-progress-db.js` | 34.55% | ≥80% |
| 3 | `skill-store.js` | 34.11% | ≥80% |
| 4 | `docmind-client.js` | 63.65% | ≥80% |
| 5 | `knowledge-panel.js` | 65.53% | ≥80% |
| 6 | `message-renderer.js` | 71.24% | ≥80% |
| 7 | `knowledge-panel-batch.js` | 72.53% | ≥80% |
| 8 | `knowledge-panel-virtual.js` | 73.46% | ≥80% |
| 9 | `ai-client-context-methods.js` | 74.46% | ≥80% |
| 10 | `bookmark-folder-suggestions.js` | 75.75% | ≥80% |
| 11 | `bookmark-accessibility-navigator.js` | 77.55% | ≥80% |
| 12 | `stats.js` | 78.69% | ≥80% |
| 13 | `i18n.js` | 79.18% | ≥80% |

---

## 用户故事

**作为** PageWise 项目维护者，**我希望** 所有 lib/ 模块的单元测试覆盖率达到 ≥80%，**以便**在重构或新增功能时有充分的安全网，避免回归缺陷悄无声息地引入生产环境。

**作为** 新加入项目的开发者，**我希望** 每个模块都有可读的测试文件作为"活文档"，**以便**快速理解模块的 API 边界、输入输出约定和异常行为。

---

## 验收标准

### AC1: 0% 模块全部补齐测试
- 15 个 0% 覆盖率模块中的 **至少 12 个** 行覆盖率提升至 ≥80%
- 剩余 ≤3 个因 Chrome API / Canvas / IIFE 限制无法纯单元测试的模块，须：
  - 补充 mock-based 集成测试，覆盖核心逻辑路径
  - 记录排除原因至 `docs/coverage-exclusions.md`
  - 该模块自身行覆盖率 ≥40%

### AC2: 低覆盖率模块全部提升至 ≥80%
- 13 个行覆盖率 <80% 的模块，**全部** 提升至 ≥80% 行覆盖率
- 函数覆盖率 ≥85%（对齐全项目函数覆盖率目标）

### AC3: 整体覆盖率达标
- lib/ 整体行覆盖率 ≥85%
- lib/ 整体函数覆盖率 ≥90%
- lib/ 整体分支覆盖率 ≥85%

### AC4: 测试质量基线
- `npm run test:ci` 返回 **0 fail**（修复当前 3 个失败用例）
- `npm run lint` 返回 **0 errors / 0 warnings**
- 新增测试文件遵循现有命名规范：`tests/test-<module-name>-unit.js`
- 每个新测试文件 ≥10 个测试用例（覆盖正常路径 + 边界条件 + 异常路径）

### AC5: 覆盖率报告可复现
- `npm run test:coverage` 正常生成 lcov + text-summary 报告
- CI 工作流覆盖率门禁（行覆盖率 <80% 则 pipeline fail）

---

## 技术约束

### 测试框架与规范
- **运行时**: Node.js 原生 `node:test` + `node:assert/strict`
- **覆盖率工具**: `c8`（V8 原生覆盖率）
- **风格**: ESM (`import/export`)，JSDoc 注释
- **Chrome API 模拟**: 使用现有 `globalThis.chrome` mock 模式（见 `tests/helpers/` 或现有测试文件中的 `resetChromeMock()` 模式）
- **不引入新的第三方测试依赖**

### 优先级排序策略
按"投入产出比"分三批执行：

| 批次 | 模块特征 | 预估模块数 | 预估新增用例 |
|------|----------|------------|------------|
| **P0 — 快速收益** | 纯逻辑/零依赖/0% 覆盖 | 8 个 | ~120 |
| **P1 — 中等投入** | 依赖注入/DB 模拟/0% + 低覆盖 | 12 个 | ~180 |
| **P2 — 高成本** | DOM/Canvas/Chrome API/IIFE | 8 个 | ~100 |

#### P0 快速收益（8 个纯逻辑模块，共 1,852 行）
1. `architecture-health-deadcode.js` (95行) — `getLineNumber()`, `detectDeadExports()` 纯字符串解析
2. `architecture-health-report.js` (153行) — `generateMetricsReport()` 纯数据格式化
3. `architecture-health-monitor.js` (498行) — `buildDependencyGraph()`, `detectCircularDependencies()`, `getFanInOut()`, `findOrphanModules()` 等 10 个纯函数
4. `bookmark-duplicate-detector-detect.js` (181行) — `normalizeUrl()`, `findExactDuplicates()`, `findSimilarDuplicates()` URL 规范化 + Jaccard
5. `graph-export.js` (197行) — `exportToJSONLD()`, `importFromJSONLD()`, `exportIncremental()` 纯 JSON 操作
6. `core-flow-fix.js` (384行) — `createSelectionRetry()`, `createTimeoutMonitor()`, `createWriteRetryQueue()`, `generateEmptyStateGuidance()` 纯逻辑
7. `bookmark-tag-editor-v2.js` (412行) — `batchAddTags()`, `batchRemoveTags()`, `mergeTags()`, `getTagSuggestions()`, `getUnusedTags()`, `getTagCooccurrence()`
8. `bookmark-learning-progress.js` (284行) — `startSession()`, `endSession()`, `getBookmarkProgress()`, `getGlobalStats()` — 需 mock `_openDB` 等 DB 函数

#### P1 中等投入（12 个模块，依赖注入/模拟 DB）
1. `bookmark-highlight-archive.js` (549行) — 注入 mock: highlightStore, tagger, knowledgeBase, knowledgeLink
2. `bookmark-knowledge-integration.js` (547行) — 注入 mock: correlationEngine, embeddingEngine
3. `bookmark-knowledge-link.js` (344行) — 注入 mock: EmbeddingEngine
4. `importer.js` (297行) — mock `readFile()` 函数
5. `skill-store-community.js` (304行) — mock chrome.storage
6. `skill-store.js` (被拆分为多个文件，需确认当前状态) — mock chrome.storage
7. `knowledge-base-export.js` (279行) — mock knowledge-base 数据
8. `docmind-client.js` (443行) — mock fetch API
9. `knowledge-panel.js` / `knowledge-panel-batch.js` / `knowledge-panel-virtual.js` — mock DOM 片段
10. `message-renderer.js` (539行) — mock DOM 片段
11. `stats.js` (253行) — mock chrome.storage
12. `i18n.js` (405行) — mock chrome.i18n

#### P2 高成本（需特殊处理）
1. `docmind-sync.js` (414行) — Chrome API + DocMindClient mock
2. `bookmark-graph-visualizer.js` (241行) — Canvas 2D Context mock
3. `selection-toolbar-global.js` (201行) — IIFE 架构限制，需特殊测试策略
4. `bookmark-learning-progress-db.js` (198行) — IndexedDB mock
5. `ai-client-context-methods.js` (188行) — AI API mock
6. `bookmark-accessibility-navigator.js` (147行) — DOM event mock
7. `bookmark-folder-suggestions.js` (33行) — Chrome bookmarks API mock
8. `docmind-sync.js` 的 Chrome storage 部分

### 失败用例修复（3 个）
当前 `npm run test:ci` 报告 3 个失败用例，需在补测试前先行修复，确保基线 0 fail。

---

## 依赖关系

### 前置依赖（本迭代无阻塞）
- ✅ R108: c8 覆盖率基础设施已就绪
- ✅ R109: ESLint 规则已配置
- ✅ R156: `npm run test:coverage` 命令已可用（需修复 `coverage/tmp/` 权限问题）

### 模块依赖图（补测试时需 mock 的上游模块）

```
bookmark-highlight-archive.js
  ├── highlight-store.js        (mock)
  ├── bookmark-tagger.js        (mock)
  ├── knowledge-base-crud.js    (mock)
  └── bookmark-knowledge-link.js (mock)

bookmark-knowledge-integration.js
  ├── bookmark-knowledge-link-scorer.js (mock)
  └── embedding-engine.js              (mock)

bookmark-knowledge-link.js
  └── embedding-engine.js (mock)

docmind-sync.js
  ├── docmind-client.js   (mock)
  └── storage-adapter.js  (mock chrome.storage)

bookmark-learning-progress.js
  ├── bookmark-learning-progress-db.js (mock IndexedDB)
  └── bookmark-learning-path.js        (mock)
```

### 后续影响
- 完成本迭代后，可安全推进 R155 sidebar.js 拆分（拆分后各子模块需独立测试）
- 为 Phase W (R182-R186) 新功能开发提供测试安全网
- 覆盖率门禁建立后，CI 可自动阻止覆盖率回退

---

## 非功能需求

### 性能
- 全量测试执行时间 ≤30s（当前 ~72s，含覆盖率开销 ~3min）
- 新增测试文件单独执行时间 ≤3s

### 可维护性
- 每个测试文件头部 JSDoc 说明被测模块和测试策略
- Mock 对象集中在测试文件顶部定义，避免深层嵌套
- 使用 `describe()` / `it()` 组织测试层级，命名清晰

### 风险与降级
- **风险**: 部分 0% 模块存在隐含的 Chrome API 依赖（如 `docmind-sync.js` 的 `chrome.storage`），mock 复杂度可能超预期
- **降级**: 对 P2 模块，行覆盖率目标可放宽至 ≥40%，但须在 `docs/coverage-exclusions.md` 记录原因

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-20 | 初始化 R181 需求文档 |
