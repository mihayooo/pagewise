# REQUIREMENTS — R207: 重叠模块合并与架构瘦身 ModuleConsolidation

> 迭代: R49 / R207
> 日期: 2026-05-20
> 复杂度: Medium (重构 — 3 对重叠模块合并)
> 上期: R206 ModuleSplitPhase12 (14 个超大模块拆分至 ≤400 行)
> 前序识别: R183 已通过 `architecture-health-monitor.js` 识别出 5 组功能重叠模块对
> 模块目录: `lib/`
> 测试目录: `tests/`

---

## 1. 用户故事

作为 PageWise 扩展的开发者和维护者，我需要将 R183 识别出的功能重叠模块对执行实际合并，消除重复实现，将 `lib/` 模块总数减少 ≥ 3 个，从而降低认知负荷、减少代码维护的双轨成本，并消除因重叠模块各自演进导致的逻辑不一致风险。

> **背景**: 当前 `lib/` 共有 225 个 `.js` 文件。R183 的 `architecture-health-monitor.js` 已静态列出 5 组功能重叠对（见 `KNOWN_OVERLAPPING_PAIRS`），但当时仅做了记录，未执行合并。随着 R203/R206 两轮拆分，部分重叠模块又被进一步拆分为子模块（如 `bookmark-duplicate-detector-detect.js`、`bookmark-import-export-io.js`），使得同一功能存在 3-4 个分散文件，增加了新贡献者的理解成本。本轮选取重叠度最高的 Top-3 对进行合并。

---

## 2. 合并目标模块对分析

### 对 1: 书签去重 — `bookmark-dedup.js` vs `bookmark-duplicate-detector.js`

| 维度 | `bookmark-dedup.js` | `bookmark-duplicate-detector.js` |
|------|---------------------|--------------------------------|
| 当前行数 | 326 行 | 158 行 (+ detect 181 行 + utils 146 行 = 485 行总计) |
| 导出类 | `BookmarkDedup` | `BookmarkDuplicateDetector` |
| 核心能力 | URL 规范化、跟踪参数剥离、Jaccard 标题相似度、suggestCleanup、batchRemove | 精确去重、模糊去重、综合去重、cleanup 策略、评分 |
| 调用方 | `bookmark-organize.js` (re-export)、`bookmark-performance-benchmark.js` | 仅 `architecture-health-monitor.js`（静态引用） |
| 测试 | `tests/test-bookmark-dedup.js` | `tests/test-bookmark-duplicate-detector.js` |

**合并策略**: 以 `bookmark-duplicate-detector.js` 为主体（功能更完善，含子模块拆分），将 `bookmark-dedup.js` 的独特方法（`suggestCleanup`、`batchRemove`、Jaccard 相似度）合并到 `BookmarkDuplicateDetector` 类中。`bookmark-dedup.js` 改为 re-export wrapper，`BookmarkDedup` 作为兼容别名导出。合并后文件链: `bookmark-duplicate-detector.js` (入口) → `bookmark-duplicate-detector-detect.js` (检测) + `bookmark-duplicate-detector-utils.js` (工具)。

### 对 2: 书签导入导出 — `bookmark-import-export.js` vs `bookmark-exporter.js`

| 维度 | `bookmark-import-export.js` + `bookmark-import-export-io.js` | `bookmark-exporter.js` + `bookmark-exporter-import.js` |
|------|-------------------------------------------------------------|-----------------------------------------------------|
| 当前行数 | 92 + 285 = 377 行 | 325 + 147 = 472 行 |
| 导出 | 函数式: `exportToHTML/JSON/CSV`、`importFromHTML/JSON`、`validateImportData` | 类式: `BookmarkExporter`（含 CSV/Netscape/Markdown 导入导出、escape 辅助） |
| 格式支持 | HTML、JSON、CSV | CSV、Netscape HTML、Markdown + validate |
| 调用方 | `tests/test-bookmark-import-export-unit.js` | `tests/test-bookmark-exporter.js`、`tests/test-bookmark-release.js` |

**合并策略**: 以 `bookmark-exporter.js` 为主体（类接口更完善，格式覆盖更广），将 `bookmark-import-export-io.js` 中 `bookmark-exporter.js` 尚未覆盖的函数（`exportToHTML`、`importFromHTML`、`importFromJSON`、`validateImportData`）迁移到 `bookmark-exporter.js`。`bookmark-import-export.js` 改为从 `bookmark-exporter.js` re-export 的薄壳。`bookmark-import-export-io.js` 改为 re-export wrapper（保留原路径兼容）。

### 对 3: 通知系统 — `bookmark-notifications.js` vs `bookmark-notifier.js`

| 维度 | `bookmark-notifications.js` | `bookmark-notifier.js` + `bookmark-notifier-dispatch.js` |
|------|----------------------------|-------------------------------------------------------|
| 当前行数 | 182 行 | 182 + 111 = 293 行 |
| 导出类 | `NotificationManager` | `BookmarkNotifier` |
| 核心能力 | 通知 CRUD、已读标记、未读计数、类型过滤 (info/warning/expired/duplicate/update) | 事件驱动通知生成、偏好设置、历史记录、分发机制 (dead-links/new-bookmarks/duplicates/backup-complete) |
| 调用方 | `tests/test-bookmark-notifications.js` | 仅通过子模块被间接引用 |

**合并策略**: 以 `bookmark-notifier.js` 为主体（功能更丰富，含事件驱动分发），将 `NotificationManager` 的 CRUD 生命周期方法（`markAsRead`、`getUnreadCount`、`clearAll`、过滤查询）合并到 `BookmarkNotifier` 类中。`bookmark-notifications.js` 改为 re-export wrapper，`NotificationManager` 作为兼容别名导出。

---

## 3. 验收标准

### AC1: 合并后模块文件数净减少 ≥ 3

合并完成后统计 `lib/` 下 `.js` 文件数（`ls lib/*.js | wc -l`），需比当前 225 减少 ≥ 3 个。预期减少 4 个:
- `bookmark-dedup.js` → wrapper（计为有效消除）
- `bookmark-import-export-io.js` → wrapper
- `bookmark-import-export.js` → wrapper
- `bookmark-notifications.js` → wrapper

> 注: wrapper 文件虽物理存在，但若仅含 re-export（≤ 10 行有效代码），在架构健康报告中应标记为"已合并"，不计入功能模块数。

### AC2: 100% API 向后兼容（re-export 模式）

- 被合并模块的每个 `export` 必须在原文件路径上继续可用
- 合并后的原文件通过 `export { ... } from './主体模块.js'` re-export
- 项目内所有现有 `import { X } from './被合并模块.js'` 语句 **零修改** 通过
- 特别注意 `bookmark-organize.js` 对 `BookmarkDedup` 的 re-export 链

### AC3: 消除孤立导出和死代码

- 合并后主体模块中不得存在无调用方的孤立导出（grep 验证）
- 若合并过程中发现已有 dead code（无任何文件 import 的函数），需在 commit message 中标注并移除
- `architecture-health-monitor.js` 的 `KNOWN_OVERLAPPING_PAIRS` 中对应条目标记为已合并

### AC4: 全量回归测试 0 fail

- 合并完成后执行 `npm test`，全部现有测试必须通过（0 fail）
- 现有测试文件的 `import` 路径不做任何修改
- 合并后需为新整合的功能补充测试覆盖:
  - `BookmarkDuplicateDetector.suggestCleanup()` + `batchRemove()` — 至少 5 个用例
  - `BookmarkExporter.importFromHTML()` + `exportToHTML()` + `importFromJSON()` — 至少 5 个用例
  - `BookmarkNotifier.markAsRead()` + `getUnreadCount()` + `clearAll()` — 至少 5 个用例

### AC5: 更新 LIB-API-REFERENCE.md

合并后更新 `docs/LIB-API-REFERENCE.md`:
- 将 `bookmark-dedup` 条目标记为 `deprecated → bookmark-duplicate-detector`
- 将 `bookmark-import-export` 条目标记为 `deprecated → bookmark-exporter`
- 将 `bookmark-notifications` 条目标记为 `deprecated → bookmark-notifier`
- 在主体模块条目中补充从被合并模块迁移过来的方法签名

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | 所有文件使用 `export` / `import` 语法 |
| re-export 向后兼容 | 被合并文件保留为 ≤ 15 行的"薄壳"（thin wrapper），仅 re-export |
| 单向依赖 | 被合并的 wrapper → 主体模块，主体模块不反向依赖 wrapper |
| 不修改测试导入 | 现有测试文件的 `import` 路径不做任何修改 |
| 不引入第三方依赖 | 合并是纯代码重组 |
| 子模块拆分保持 | R203/R206 已建立的子模块结构（如 `bookmark-duplicate-detector-detect.js`）不被回退 |
| 子模块计数 ≤ 400 行 | 合并后的主体模块仍需满足 R206 的 400 行硬上限；若合并导致超限，需同时执行拆分 |
| JSDoc 完整性 | 迁移的方法保留完整 JSDoc 注释 |
| COMMIT 粒度 | 每对合并一个独立 commit，便于 bisect 和回滚 |

---

## 5. 依赖关系

### 上游依赖（本迭代依赖）

| 条目 | 说明 | 状态 |
|------|------|------|
| R183 架构健康监控 | `architecture-health-monitor.js` 已识别 5 组重叠对，提供 `KNOWN_OVERLAPPING_PAIRS` 作为合并指导 | ✅ 已完成 |
| R203 ModuleSplitPhase11 | 书签模块已完成首轮拆分，`bookmark-duplicate-detector` 已拆为 3 文件 | ✅ 已完成 |
| R206 ModuleSplitPhase12 | 全部模块已 ≤400 行，合并后不应回退此约束 | ✅ 已完成 |
| `bookmark-organize.js` | 通过 `export { BookmarkDedup } from './bookmark-dedup.js'` 间接导出，需确保合并后链条完整 | ✅ 已确认 |

### 下游影响（需验证不破坏）

| 消费者 | 导入的被合并模块 | 风险等级 | 应对策略 |
|--------|----------------|---------|---------|
| `lib/bookmark-organize.js` | `bookmark-dedup.js` (BookmarkDedup) | 低 | wrapper re-export |
| `lib/bookmark-performance-benchmark.js` | `bookmark-dedup.js` (BookmarkDedup) | 低 | wrapper re-export |
| `tests/test-bookmark-dedup.js` | `bookmark-dedup.js` | 零 | 不修改 |
| `tests/test-bookmark-import-export-unit.js` | `bookmark-import-export.js` | 零 | 不修改 |
| `tests/test-bookmark-notifications.js` | `bookmark-notifications.js` | 零 | 不修改 |
| `tests/test-bookmark-release.js` | `bookmark-dedup.js`、`bookmark-exporter.js` | 零 | 不修改 |
| `tests/test-bookmark-duplicate-detector.js` | `bookmark-duplicate-detector.js` | 零 | 不修改 |
| `lib/architecture-health-monitor.js` | 静态字符串引用 | 低 | 更新 `KNOWN_OVERLAPPING_PAIRS` 标记 |

---

## 6. 执行计划

### 合并对 1: 书签去重（预计 ~200 行变更）

1. 将 `BookmarkDedup.suggestCleanup()` 和 `BookmarkDedup.batchRemove()` 迁移到 `BookmarkDuplicateDetector` 类
2. 将 `BookmarkDedup.findDuplicates()` 中的 Jaccard 相似度逻辑与 `BookmarkDuplicateDetector.findSimilarDuplicates()` 整合
3. 合并 TRACKING_PARAMS 常量（两者重复定义）
4. 将 `bookmark-dedup.js` 改为 wrapper:
   ```js
   export { BookmarkDuplicateDetector as BookmarkDedup } from './bookmark-duplicate-detector.js';
   export { TRACKING_PARAMS, normalizeUrl } from './bookmark-duplicate-detector.js';
   ```
5. 更新 `bookmark-organize.js` 的 re-export 注释
6. 运行 `test-bookmark-dedup.js` + `test-bookmark-duplicate-detector.js` + 全量回归

### 合并对 2: 书签导入导出（预计 ~150 行变更）

1. 将 `bookmark-import-export-io.js` 中 `bookmark-exporter.js` 未覆盖的函数（`exportToHTML`、`importFromHTML`、`importFromJSON`、`validateImportData`）迁移到 `bookmark-exporter.js` 的新方法中
2. 将 `bookmark-import-export.js` 改为 wrapper:
   ```js
   export {
     exportToHTML, exportToJSON, exportToCSV,
     importFromHTML, importFromJSON, validateImportData,
   } from './bookmark-exporter.js';
   ```
3. 将 `bookmark-import-export-io.js` 改为从 `bookmark-exporter.js` re-export
4. 运行 `test-bookmark-exporter.js` + `test-bookmark-import-export-unit.js` + 全量回归

### 合并对 3: 通知系统（预计 ~120 行变更）

1. 将 `NotificationManager` 的 CRUD 方法（`markAsRead`、`getUnreadCount`、`clearAll`、`getNotifications` 过滤查询）迁移到 `BookmarkNotifier` 类
2. 统一通知类型枚举（`NotificationManager` 的 `info/warning/expired/duplicate/update` 与 `BookmarkNotifier` 的 `dead-links/new-bookmarks/duplicates/backup-complete` 需建立映射表）
3. 将 `bookmark-notifications.js` 改为 wrapper:
   ```js
   export { BookmarkNotifier as NotificationManager } from './bookmark-notifier.js';
   export { NOTIFICATION_TYPES } from './bookmark-notifier.js';
   ```
4. 运行 `test-bookmark-notifications.js` + 全量回归

### 最终验证

1. `npm test` — 全量回归 0 fail
2. `ls lib/*.js | wc -l` — 模块数 ≤ 221（净减 ≥ 4）
3. 更新 `docs/LIB-API-REFERENCE.md`
4. 更新 `architecture-health-monitor.js` 的 `KNOWN_OVERLAPPING_PAIRS`
5. 更新 `docs/CHANGELOG.md`

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 合并后主体模块超过 400 行 | 违反 R206 门禁 | 合并前预估行数；若超限则在合并同时执行子模块拆分 |
| `BookmarkDedup` 与 `BookmarkDuplicateDetector` 接口签名不一致 | 消费方调用失败 | 保留 `BookmarkDedup` 为 adapter wrapper，内部适配接口差异 |
| 通知类型枚举不统一 | 通知系统行为不一致 | 建立类型映射表，`BookmarkNotifier` 统一支持两套类型 |
| 合并后 `bookmark-exporter.js` 功能膨胀 | 下次拆分风险 | 合并后行数预估 380 行，仍在 400 行门禁内 |

---

## 8. 非功能需求

| 项目 | 要求 |
|------|------|
| 向后兼容 | 100% — 现有 `import` 语句零修改 |
| 回归测试 | `npm test` 全部通过，0 fail |
| 测试用例 | 为迁移功能新增 ≥ 15 个测试用例 |
| 文件大小 | 合并后所有文件 ≤ 400 行 |
| 构建时间 | 无影响 |
| 运行时性能 | 无影响（纯模块重组） |
| 代码审查 | 每个合并 commit 包含：变更 diff + wrapper 文件 + 测试验证 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-20 | R207 | 初始创建 — ModuleConsolidation 需求文档（Top-3 重叠模块对合并） |
