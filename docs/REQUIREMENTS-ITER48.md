# REQUIREMENTS — R206: 超大模块拆分十二期 ModuleSplitPhase12

> 迭代: R48 / R206
> 日期: 2026-05-20
> 复杂度: Complex (重构 — 14 个模块拆分)
> 上期: R203 ModuleSplitPhase11 (前 8 个 >460 行模块已拆)
> 模块目录: `lib/`
> 测试目录: `tests/`

---

## 1. 用户故事

作为 PageWise 扩展的开发者和维护者，我需要将剩余 14 个超过 400 行的 lib 模块拆分为更小的、职责单一的子模块，使每个文件 ≤ 400 行、可读性更强、可测试性更好，从而降低长期维护成本和新贡献者的上手门槛。

> **背景**: 经过 R203 前 8 个超大模块（>460 行）的成功拆分后，当前仍有 14 个 lib 文件处于 401–447 行区间。虽然超出 400 行门禁的幅度不大，但持续积累会导致代码审查困难、合并冲突频繁、新功能定位成本增加。本轮目标是彻底清除 >400 行模块，将 400 行作为硬性上限。

---

## 2. 验收标准

### AC1: 所有 14 个模块行数 ≤ 400
拆分后的每个源文件（含注释、空行、JSDoc）行数必须 ≤ 400 行。

| 序号 | 原文件 | 当前行数 | 预计拆分策略 |
|------|--------|----------|-------------|
| 1 | `lib/page-sense.js` | 447 | 提取页面分析器注册表 → `page-sense-analyzers.js`；主类保留检测/提取调度 |
| 2 | `lib/utils.js` | 444 | 提取渲染函数（renderMarkdown 等）→ `utils-renderer.js`；保留设置/截断/格式化 |
| 3 | `lib/docmind-client.js` | 443 | 提取知识/图谱/配置相关 API 方法 → `docmind-api.js`；保留连接/同步/健康检查 |
| 4 | `lib/bookmark-documentation.js` | 437 | 提取 `DOC_MODULES` 数据常量 → `bookmark-doc-data.js`；保留查询/搜索/统计逻辑 |
| 5 | `lib/bookmark-graph.js` | 432 | 提取相似度计算核心 → `bookmark-graph-similarity.js`；保留图构建/布局/Top-K |
| 6 | `lib/i18n.js` | 418 | 提取内置语言包（BUILTIN_ZH / BUILTIN_EN + 扩展）→ `i18n-locales.js`；保留加载/切换/翻译核心 |
| 7 | `lib/bookmark-security-audit.js` | 417 | 提取常量定义（权限列表、CSP 规则）+ CSP 审计 → `bookmark-security-constants.js`；保留权限/脚本/报告 |
| 8 | `lib/bookmark-learning-coach.js` | 416 | 提取周回顾 / 统计 / 序列化方法 → `bookmark-coach-analytics.js`；保留日计划/任务生命周期 |
| 9 | `lib/docmind-sync.js` | 414 | 提取冲突处理逻辑 → `docmind-conflict-resolver.js`；保留同步调度/配置管理 |
| 10 | `lib/bookmark-detail-panel.js` | 414 | 提取标签自动补全逻辑 + 渲染数据生成 → `bookmark-detail-renderer.js`；保留面板生命周期/状态管理 |
| 11 | `lib/bookmark-tag-editor-v2.js` | 412 | 提取共现分析 + 未使用标签检测 → `bookmark-tag-analytics.js`；保留增删改查/合并/建议 |
| 12 | `lib/bookmark-onboarding.js` | 406 | 提取 i18n 语言包数据（ONBOARDING_LOCALES）→ `bookmark-onboarding-locales.js`；保留步骤导航/状态管理 |
| 13 | `lib/chat-mode.js` | 403 | 提取浮窗 DOM 创建/渲染 + 快捷键绑定 → `chat-mode-ui.js`；保留 ChatMode 生命周期/状态 |
| 14 | `lib/bookmark-indexer.js` | 401 | 提取搜索排序逻辑（评分/高亮/过滤）→ `bookmark-indexer-search.js`；保留索引构建/CRUD |

### AC2: 100% API 向后兼容（re-export 模式）
- 原文件的每个 `export` 必须在原文件路径上继续可用
- 拆分后原文件通过 `export { ... } from './new-file.js'` re-export 所有导出的类/函数/常量
- 项目内所有现有 `import { X } from './原文件.js'` 语句 **零修改** 通过

### AC3: 全量回归测试 0 fail
- 拆分完成后执行 `npm test`，全部现有测试必须通过
- 4 个无测试文件的模块（`docmind-client`、`docmind-sync`、`bookmark-learning-coach`、`bookmark-tag-editor-v2`）需在拆分同时补充基础冒烟测试（每模块 ≥ 10 用例），确保拆分后子模块的导出完整性
- 测试使用 `node:test` + `node:assert/strict`，与项目风格一致

### AC4: 无循环依赖
- 拆分出的子模块不得反向依赖原文件（单向依赖树：子模块 → 无依赖或依赖更底层模块）
- 使用 `grep -r "from.*'./原文件'" lib/新子模块.js` 验证无循环引入

### AC5: 代码行数门禁收窄
- `package.json` 中 `coverage:gate` 的 `--lines` 参数保持 R205 调整后的值（≥ 20%）
- 新增 `size:gate` 脚本：`lib/` 目录下不得存在 > 400 行的 `.js` 文件（`wc -l` 验证）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | 所有新文件使用 `export` / `import` 语法，不使用 `require` |
| 无构建工具 | 不引入 Rollup/Webpack/esbuild，文件拆分是纯物理切割 |
| re-export 向后兼容 | 原文件保留为"薄壳"（thin wrapper），仅 re-export 子模块导出 |
| 子模块命名约定 | `{原模块名}-{功能}.js`，如 `page-sense-analyzers.js` |
| 单向依赖 | 子模块不 import 原文件，避免循环依赖 |
| 不修改测试导入 | 现有测试文件的 `import` 路径不做任何修改 |
| 不改变运行时行为 | 拆分是纯重构，不增加/删除/修改任何功能逻辑 |
| JSDoc 完整性 | 新文件头部保留模块级 JSDoc 注释，类型定义随功能移动 |
| 400 行硬上限 | 任何文件（含新建子模块）超过 400 行视为拆分不充分 |
| 零外部依赖 | 不引入任何第三方 npm 包 |

---

## 4. 依赖关系

### 上游依赖（本迭代依赖）

| 条目 | 说明 | 状态 |
|------|------|------|
| R203 ModuleSplitPhase11 | 前 8 个 >460 行模块已拆分完毕，建立了 re-export 模式先例 | ✅ 已完成 |
| R205 CoverageSprint50 | 测试覆盖率门禁已从 20% 调整，确保拆分后回归可验证 | ✅ 已完成 |
| `tag-editor-constants.js` | R203 已提取的标签编辑器常量，`bookmark-tag-editor-v2.js` 已依赖 | ✅ 存在 |
| `bookmark-visualizer.js` / `bookmark-visualizer-physics.js` | R120 已拆分的图谱可视化子模块，`bookmark-graph.js` 已 re-export | ✅ 存在 |

### 下游影响（需验证不破坏）

| 消费者 | 导入的模块 | 风险等级 |
|--------|-----------|---------|
| `lib/knowledge-panel.js` | `utils.js` (formatTime) | 低 — re-export 保证兼容 |
| `lib/knowledge-panel-search.js` | `utils.js` (renderMarkdown, formatTime) | 低 — re-export |
| `lib/knowledge-panel-virtual.js` | `utils.js` (formatTime) | 低 — re-export |
| `lib/message-renderer-dom.js` | `utils.js` (renderMarkdown) | 低 — re-export |
| `lib/bookmark-i18n.js` | `i18n.js` | 低 — re-export |
| `lib/bookmark-smart-collections.js` | `i18n.js` (t, registerLocale) | 低 — re-export |
| `lib/docmind-sync.js` | `docmind-client.js` (DocMindClient) | 低 — re-export |
| `lib/bookmark-performance.js` | `bookmark-graph.js`, `bookmark-indexer.js` | 低 — re-export |
| `lib/bookmark-performance-benchmark.js` | `bookmark-indexer.js` | 低 — re-export |
| 10 个已有测试文件 | 各对应模块 | 零风险 — 不修改测试导入路径 |

### 无测试覆盖的模块（本轮需补充冒烟测试）

| 模块 | 行数 | 需新建测试 |
|------|------|-----------|
| `docmind-client.js` | 443 | `tests/test-docmind-client.js` (≥ 10 用例) |
| `docmind-sync.js` | 414 | `tests/test-docmind-sync.js` (≥ 10 用例) |
| `bookmark-learning-coach.js` | 416 | `tests/test-bookmark-learning-coach.js` (≥ 10 用例) |
| `bookmark-tag-editor-v2.js` | 412 | `tests/test-bookmark-tag-editor-v2.js` (≥ 10 用例) |

### 建议拆分批次

为降低单次变更风险，建议分 3 批执行：

**批次 A（核心基础设施，4 个模块）**：
1. `utils.js` → `utils-renderer.js`
2. `i18n.js` → `i18n-locales.js`
3. `page-sense.js` → `page-sense-analyzers.js`
4. `chat-mode.js` → `chat-mode-ui.js`

**批次 B（书签子系统，6 个模块）**：
5. `bookmark-graph.js` → `bookmark-graph-similarity.js`
6. `bookmark-documentation.js` → `bookmark-doc-data.js`
7. `bookmark-detail-panel.js` → `bookmark-detail-renderer.js`
8. `bookmark-tag-editor-v2.js` → `bookmark-tag-analytics.js`
9. `bookmark-indexer.js` → `bookmark-indexer-search.js`
10. `bookmark-onboarding.js` → `bookmark-onboarding-locales.js`

**批次 C（DocMind + 安全 + 学习，4 个模块）**：
11. `docmind-client.js` → `docmind-api.js`
12. `docmind-sync.js` → `docmind-conflict-resolver.js`
13. `bookmark-security-audit.js` → `bookmark-security-constants.js`
14. `bookmark-learning-coach.js` → `bookmark-coach-analytics.js`

---

## 5. 拆分后文件清单（预估）

| 新建子模块 | 预估行数 | 来源 | 主要职责 |
|-----------|---------|------|---------|
| `lib/page-sense-analyzers.js` | ~250 | 12+ analyzer 对象 + extract 辅助方法 | 分析器注册表 |
| `lib/utils-renderer.js` | ~200 | renderMarkdown, sanitizeHtml, 消息格式化 | 渲染/HTML 处理 |
| `lib/docmind-api.js` | ~220 | knowledge CRUD, graph API, aiConfig, aiUsage | DocMind 业务 API |
| `lib/bookmark-doc-data.js` | ~230 | DOC_MODULES 数组, DOC_CATEGORIES 枚举 | 文档数据常量 |
| `lib/bookmark-graph-similarity.js` | ~200 | 相似度算法, Jaccard, 域名匹配, 倒排索引 | 相似度计算 |
| `lib/i18n-locales.js` | ~180 | BUILTIN_ZH, BUILTIN_EN, 扩展 locale 数据 | 语言包数据 |
| `lib/bookmark-security-constants.js` | ~180 | 权限列表, CSP 规则常量, 审计规则定义 | 安全常量 |
| `lib/bookmark-coach-analytics.js` | ~180 | getWeeklyReview, getStats, exportData, importData | 统计与序列化 |
| `lib/docmind-conflict-resolver.js` | ~150 | 冲突检测, 合并策略 (local_wins/remote_wins/skip) | 冲突处理 |
| `lib/bookmark-detail-renderer.js` | ~180 | 标签自动补全, 渲染数据组装, 状态徽章逻辑 | 渲染数据生成 |
| `lib/bookmark-tag-analytics.js` | ~170 | getTagCooccurrence, getUnusedTags, 批量统计 | 标签统计分析 |
| `lib/bookmark-onboarding-locales.js` | ~130 | ONBOARDING_LOCALES 双语数据 (22 key × 2 locale) | 语言包数据 |
| `lib/chat-mode-ui.js` | ~150 | 浮窗 DOM 创建, 快捷键注册, 面板渲染模板 | UI 交互层 |
| `lib/bookmark-indexer-search.js` | ~160 | 搜索评分, 结果排序, 高亮, 多维过滤 | 搜索与排序 |

**新建测试文件**（4 个）：

| 测试文件 | 预估用例数 | 覆盖范围 |
|----------|-----------|---------|
| `tests/test-docmind-client.js` | 12 | connect, status, sync, timeout, error handling |
| `tests/test-docmind-sync.js` | 12 | sync lifecycle, conflict resolution, config persistence |
| `tests/test-bookmark-learning-coach.js` | 15 | daily plan, task lifecycle, weekly review, stats |
| `tests/test-bookmark-tag-editor-v2.js` | 12 | batch ops, cooccurrence, unused tags, merge |

---

## 6. 非功能需求

| 项目 | 要求 |
|------|------|
| 向后兼容 | 100% — 现有 `import` 语句零修改 |
| 回归测试 | `npm test` 全部通过，0 fail |
| 文件大小 | 拆分后所有文件 ≤ 400 行（含子模块本身） |
| 构建时间 | 无影响（无构建工具，ES Module 原生加载） |
| 运行时性能 | 无影响（纯模块重组，不改变逻辑） |
| 代码审查 | 每个拆分 commit 包含：原文件 diff + 新文件 + re-export 验证 |
| 新增门禁 | `size:gate` 脚本：`find lib -name "*.js" -exec awk 'END{if(NR>400) print FILENAME, NR}' {} \;` |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-20 | R206 | 初始创建 — ModuleSplitPhase12 需求文档（14 个 401–447 行模块拆分至 ≤ 400 行） |
