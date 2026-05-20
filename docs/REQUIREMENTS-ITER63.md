# 需求文档 — R223: 超大模块拆分收尾 ModuleSplitFinal

> 版本: 1.0
> 日期: 2026-05-20
> 迭代: 质量收尾 (R63)
> 复杂度: Medium
> 前序迭代: R217 (ModuleSplitPhase13)

---

## 1. 背景与动机

### 1.1 现状分析

R217（ModuleSplitPhase13）声称完成了全部 13 个 >400 行 lib 文件的拆分，但实际验证发现 **仍有 7 个文件超过 ≤400 行的架构门禁阈值**：

| 文件 | 行数 | 超出 | 模块职责 |
|------|------|------|----------|
| `bookmark-learning-coach.js` | 416 | +16 | 学习教练：每日计划生成、执行追踪、回顾反馈 |
| `docmind-sync.js` | 414 | +14 | DocMind 同步管理：自动/增量同步、冲突处理、状态管理 |
| `bookmark-detail-panel.js` | 414 | +14 | 书签详情面板：元数据展示、相似推荐、标注交互 |
| `bookmark-tag-editor-v2.js` | 412 | +12 | 标签编辑器 v2：标签 CRUD、智能推荐、批量操作 |
| `bookmark-onboarding.js` | 406 | +6 | 引导向导：4 步引导流程、主题选择、自动采集开关、i18n |
| `chat-mode.js` | 403 | +3 | Chat 快捷模式：Ctrl+K 唤起、显示模式切换、消息渲染 |
| `bookmark-indexer.js` | 401 | +1 | 书签索引器：倒排索引、中英文分词、快速搜索 |

7 个文件共 2866 行，超出总额外 66 行。这些文件恰好处于 400 行门禁线上下，属于 R217 拆分不彻底的遗留问题。

### 1.2 架构约束违规

`docs/architecture-metrics.md` 明确声明：

> **单文件上限**: ≤400 行（scripts/architecture-guard.sh）

当前 230 个 lib 模块中，7 个违规文件占比 3%。虽然超出量不大（1-16 行），但会导致：

1. **CI 门禁不稳定** — 如果存在 architecture-guard 检查，当前状态会导致构建失败
2. **架构指标文档失真** — `docs/architecture-metrics.md` 声称"所有 lib 文件均 ≤400 行"，与事实不符
3. **技术债务累积** — 每轮迭代新增代码会继续叠加到这些文件上

### 1.3 目标

完成 R217 的收尾工作，将最后 7 个违规文件全部拆分至 ≤400 行，彻底消除架构违规，确保 `architecture-metrics.md` 的数据准确性。

---

## 2. 用户故事

> **作为** PageWise 项目的维护者 / CI 守门人，
> **我希望** 所有 lib 模块严格遵守 ≤400 行的架构约束，
> **以便** 架构指标文档准确反映项目状态，CI 门禁稳定通过，后续迭代不受历史遗留债务影响。

---

## 3. 验收标准

### AC-1: 全部 7 个文件拆分至 ≤400 行 ✅

每个文件拆分后，**原始入口文件** 行数 ≤400 行（不含空行和注释也应符合 400 行限制）。拆分子模块命名遵循已有约定：

| 原始文件 | 建议拆分方案 | 目标行数 |
|----------|-------------|---------|
| `bookmark-learning-coach.js` | 提取常量 + 计划生成逻辑 → `bookmark-learning-coach-planner.js` | ≤400 / ≤100 |
| `docmind-sync.js` | 提取冲突处理 + 同步状态 → `docmind-sync-conflict.js` | ≤400 / ≤50 |
| `bookmark-detail-panel.js` | 提取推荐逻辑 + 面板渲染 → `bookmark-detail-panel-recommend.js` | ≤400 / ≤50 |
| `bookmark-tag-editor-v2.js` | 提取标签推荐 + 批量操作 → `bookmark-tag-editor-v2-recommend.js` | ≤400 / ≤50 |
| `bookmark-onboarding.js` | 提取 locale 字符串 → `bookmark-onboarding-locales.js` | ≤400 / ≤50 |
| `chat-mode.js` | 提取消息渲染/存储逻辑 → `chat-mode-storage.js` | ≤400 / ≤30 |
| `bookmark-indexer.js` | 提取分词逻辑 → `bookmark-indexer-tokenizer.js` | ≤400 / ≤30 |

> ⚠️ 以上为建议方案，执行者可根据代码内聚性自行决定最佳拆分粒度，唯一硬约束是行数 ≤400。

### AC-2: API 向后兼容（re-export 模式）✅

拆分后的**原始入口文件**必须通过 `export { ... } from './xxx.js'` 或 `import + re-export` 保持所有现有公共 API 不变。验证方式：

- 所有现有 `import { X } from './bookmark-learning-coach.js'` 语句无需修改
- 所有现有 `import { Y } from './chat-mode.js'` 语句无需修改
- 其余 5 个文件同理

### AC-3: 全量回归测试 0 fail ✅

拆分完成后，执行全量测试：

```bash
node --test tests/
```

要求：**0 个测试失败**，测试通过数不低于当前基线（≥7088 用例）。

### AC-4: 更新架构指标文档 ✅

更新 `docs/architecture-metrics.md`：

1. **模块拆分历程** 表格新增 Phase 13 行，记录本轮 7 个文件的拆分
2. 确认"所有 lib 文件均 ≤400 行"的声明与实际一致
3. 更新迭代轮次和日期

### AC-5: Lint 零错误 ✅

拆分产生的新文件必须通过 ESLint 检查，0 errors / 0 warnings。

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **行数上限** | 每个 lib 文件 ≤400 行（含注释和空行），与 architecture-guard.sh 保持一致 |
| **拆分模式** | 必须使用 re-export 模式保持向后兼容（参考 `bookmark-io.js` → `bookmark-io-standalone.js` 的成功案例） |
| **命名约定** | 子模块命名：`{原文件名}-{功能}.js`（如 `-planner.js`、`-conflict.js`、`-locales.js`） |
| **零外部依赖** | 不引入新的 npm 包或外部依赖 |
| **纯前端** | 所有模块均为 ES Module，运行于 Chrome 扩展环境 |
| **无破坏性变更** | 不修改任何现有模块的函数签名、参数、返回值 |
| **测试文件** | 拆分不要求新增测试文件，但现有测试必须全部通过 |

---

## 5. 依赖关系

### 5.1 前置依赖

| 依赖项 | 状态 | 说明 |
|--------|------|------|
| R217 (ModuleSplitPhase13) | ✅ 已完成 | 本轮为 R217 的收尾修复，处理其遗留的 7 个未达标文件 |
| Phase 1-12 模块拆分 | ✅ 已完成 | 前 12 轮拆分建立了 re-export 模式和命名规范 |

### 5.2 下游影响

| 被影响方 | 影响 | 缓解措施 |
|----------|------|----------|
| `docs/architecture-metrics.md` | 需更新模块拆分历程 | AC-4 覆盖 |
| CI 门禁 (architecture-guard) | 拆分后应零违规通过 | AC-1 覆盖 |
| 所有 import 上游文件 | **零影响**（re-export 保证兼容） | AC-2 覆盖 |

### 5.3 不依赖项

- 不依赖覆盖率相关迭代（R222 等）
- 不依赖 E2E 测试相关迭代（R220 等）
- 不涉及新功能开发，纯技术债务清理

---

## 6. 风险评估

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 拆分后导入路径遗漏 | 低 | 高 — 测试失败 | AC-3 全量回归可检测 |
| 拆分粒度不足，子模块仍 >400 行 | 低 | 中 — 需二次拆分 | 拆分后立即 wc -l 验证 |
| 循环依赖引入 | 极低 | 高 — 运行时报错 | 拆分方向为单向依赖（子→父），不会产生循环 |
| 测试 mock 路径需更新 | 低 | 中 — 测试失败 | re-export 模式下测试无需修改 mock 路径 |

---

## 7. 工作量估算

| 阶段 | 工作量 |
|------|--------|
| 代码拆分 (7 文件) | 30 分钟 |
| re-export 验证 | 10 分钟 |
| 全量回归测试 | 5 分钟 |
| architecture-metrics.md 更新 | 10 分钟 |
| **合计** | **~55 分钟** |

---

## 附录 A: 成功案例参考

`bookmark-io.js`（94 行）通过 re-export `bookmark-io-standalone.js` 实现向后兼容：

```javascript
// bookmark-io.js — 入口文件 (94 行)
// 向后兼容 re-exports
export { exportToHTML, exportToJSON, exportToCSV, importFromHTML, importFromJSON, validateImportData } from './bookmark-io-standalone.js'

export class BookmarkImportExport { /* ... */ }
```

所有 7 个文件应遵循此模式。

---

## 附录 B: 当前违规文件行数基线

```
  416 lib/bookmark-learning-coach.js
  414 lib/docmind-sync.js
  414 lib/bookmark-detail-panel.js
  412 lib/bookmark-tag-editor-v2.js
  406 lib/bookmark-onboarding.js
  403 lib/chat-mode.js
  401 lib/bookmark-indexer.js
  ───
 2866 total (需削减 ≥66 行)
```

---

*文档遵循 PageWise 需求模板 v2*
*下一阶段: docs/DESIGN-ITER63.md (技术设计)*
