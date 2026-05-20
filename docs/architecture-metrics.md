# 架构指标 — 智阅 PageWise

> 最后更新: 2026-05-20 (R209)

---

## 📊 项目概况

| 指标 | 数值 |
|------|------|
| 版本 | v3.1.0 |
| 迭代轮次 | R209 |
| lib 模块数 | 222 |
| 核心代码行数 | ~50,215 行 |
| 测试文件数 | 190 |
| 测试用例数 | 7088 |
| 测试通过率 | 100% |
| Lint | 0 errors / 0 warnings |
| 测试执行时间 | ~24s |

---

## 📈 模块增长趋势

| 阶段 | 迭代范围 | lib 模块数 | 测试用例数 | 备注 |
|------|----------|-----------|-----------|------|
| v1.0.0 | R1-R42 | ~20 | 2111 | 核心功能（AI 问答 + 知识库） |
| v2.0.0 | R43-R72 | ~55 | 4000+ | BookmarkGraph Phase A-C |
| v3.0.0 | R73-R92 | ~80 | 5705 | 集成打磨 + 发布准备 |
| Phase F | R93-R102 | ~95 | 5857 | 性能优化 + 数据同步 + 通知 |
| Phase G-H | R103-R112 | ~100 | 5887 | 测试基础设施 + ESLint + 安全 |
| Phase I-K | R113-R127 | ~130 | 5040 | CI 修复 + 模块拆分开始 |
| Phase L-M | R128-R137 | ~150 | 5517 | 模块拆分二期三期 + 覆盖率提升 |
| Phase N-O | R138-R147 | ~165 | 5553 | 覆盖率冲刺 + 函数覆盖率 |
| Phase P-R | R148-R162 | ~180 | 6157 | sidebar.js 拆分 + 覆盖率回升 |
| Phase S-T | R163-R171 | ~190 | 6350+ | 产品体验 + 知识沉淀 |
| Phase U-W | R172-R186 | ~205 | 6369 | 深度学习闭环 + 隐私合规 |
| Phase X-AA | R190-R209 | 222 | 7088 | 质量收尾 + 架构治理 + 发布 |

---

## 📁 模块分布

### 按目录统计

| 目录 | 模块数 | 说明 |
|------|--------|------|
| `lib/` | 222 | 核心库模块 |
| `sidebar/` | 5+ | 侧边栏子模块 |
| `options/` | 2 | 选项页 |
| `popup/` | 2 | 弹窗 |
| `content/` | 2 | 内容脚本 |
| `background/` | 1 | Service Worker |
| `skills/` | 1 | 内置技能 |
| `tests/` | 190 | 测试文件 |

### lib/ 模块功能分类

| 分类 | 模块数 | 代表模块 |
|------|--------|---------|
| AI 与模型 | 8 | ai-client, ai-client-stream, ai-client-request, ai-client-tokens, ai-cache, ai-client-context |
| 知识库 | 12 | knowledge-base, knowledge-base-crud, knowledge-base-query, knowledge-base-export, knowledge-graph, embedding-engine |
| 书签核心 | 15 | bookmark-collector, bookmark-indexer, bookmark-graph, bookmark-search, bookmark-visualizer, bookmark-detail-panel |
| 书签智能 | 20 | bookmark-semantic-search, bookmark-ai-recommender, bookmark-clusterer, bookmark-learning-path, bookmark-gap-detector |
| 书签数据 | 12 | bookmark-io, bookmark-import-export, bookmark-backup, bookmark-migration, bookmark-sync, bookmark-sharing |
| 学习闭环 | 18 | bookmark-spaced-repetition, bookmark-learning-goals, bookmark-highlight-archive, bookmark-annotations, bookmark-learning-coach |
| 智能分析 | 12 | bookmark-insight-engine, bookmark-predictive-engine, bookmark-learning-analytics, bookmark-cross-domain-map, bookmark-learning-journey |
| 用户体验 | 15 | bookmark-dark-theme, bookmark-keyboard-shortcuts, bookmark-accessibility, bookmark-i18n, bookmark-onboarding |
| 基础设施 | 15 | storage-adapter, cache-manager, error-handler, sanitize, browser-compat, utils, i18n, logger |
| 其他 | ~105 | 拆分子模块、Wiki 系统、插件系统、编译报告等 |

---

## 🔧 模块拆分历程

| 轮次 | 迭代 | 拆分文件数 | 关键变更 |
|------|------|-----------|---------|
| Phase 1 | R125 | 5 | knowledge-base.js(1866行) → core/crud/query/export |
| Phase 2 | R130 | 5 | wiki-store.js、skill-store.js、plugin-system.js 等 |
| Phase 3 | R134 | 14 | bookmark-visualizer.js、ai-client.js 等 14 个 >500 行文件 |
| Phase 4 | R140 | 6 | bookmark-learning-progress.js、wiki-query.js 等 |
| Phase 5 | R145 | 5 | bookmark-learning-progress.js、message-renderer.js 等 |
| Phase 6 | R150 | 9 | wiki-query.js、bookmark-tag-editor-v2.js 等 |
| Phase 7 | R157 | 6 | bookmark-knowledge-integration.js、entity-extractor.js 等 |
| Phase 8 | R161 | 8 | bookmark-notifier.js、bookmark-search.js 等 |
| Phase 9 | R193 | 6 | bookmark-knowledge-packs.js、bookmark-weekly-digest.js 等 |
| Phase 10 | R196 | 8 | bookmark-user-profile.js、knowledge-panel.js 等 |
| Phase 11 | R203 | 8 | bookmark-spaced-repetition.js、architecture-health-monitor.js 等 |
| Phase 12 | R206 | 14 | page-sense.js、utils.js、docmind-client.js 等 |

**总计**: 12 轮拆分，所有 lib 文件均 ≤400 行，re-export 模式保证 API 向后兼容。

---

## 🧪 测试覆盖

| 指标 | 值 |
|------|-----|
| 行覆盖率 (Lines) | ≥50% |
| 函数覆盖率 (Functions) | ≥60% |
| 覆盖率工具 | c8 (V8 native) |
| 覆盖率门禁 | `coverage:gate --lines 50 --functions 60` |

---

## 📋 代码质量基线

| 指标 | 值 | 工具 |
|------|-----|------|
| Lint | 0 errors / 0 warnings | ESLint 9 flat config |
| 测试通过率 | 100% (7088/7088) | Node.js test runner |
| 单文件上限 | ≤400 行 | scripts/architecture-guard.sh |
| 模块上限 | ≤220 个 | scripts/architecture-guard.sh |
| 技术债务 | TD001-TD004 全部关闭 | docs/DESIGN.md |
