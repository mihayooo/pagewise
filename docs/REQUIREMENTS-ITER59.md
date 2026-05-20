# 需求文档 — R217: 超大模块拆分十三期 ModuleSplitPhase13

> 创建日期: 2026-05-20
> 迭代: R217 (Phase 13 模块拆分)
> 复杂度: Complex

---

## 1. 用户故事

**作为** PageWise 项目的维护者和贡献者，
**我希望** 所有 lib/ 源文件严格遵守 ≤400 行的架构门禁，
**以便** 代码可读性、可维护性和单模块职责清晰度始终保持在工程标准之上。

---

## 2. 背景与问题分析

### 2.1 现状

Phase 12 (R206) 完成后，`architecture-metrics.md` 第 91 行声明"所有 lib 文件均 ≤400 行"，但实际 `wc -l lib/*.js` 显示 **13 个文件超出 400 行门禁**：

| # | 文件 | 行数 | 超出行数 | 函数/类数 | 特征 |
|---|------|------|---------|----------|------|
| 1 | `bookmark-io.js` | 606 | +206 | 19 | R207 将 import-export-io 合并回来，职责膨胀最严重 |
| 2 | `docmind-client.js` | 443 | +43 | 2 | 大单体类（DocMindClient），含 API 调用 + 重试 + 缓存 |
| 3 | `bookmark-documentation.js` | 437 | +37 | 6 | 文档生成 + 模板渲染混合 |
| 4 | `bookmark-graph.js` | 432 | +32 | 1 | 单类，图引擎核心，方法密集 |
| 5 | `i18n.js` | 418 | +18 | 20 | 翻译键值 + 工具函数混合 |
| 6 | `bookmark-security-audit.js` | 417 | +17 | 5 | 安全扫描规则 + 报告生成混合 |
| 7 | `bookmark-learning-coach.js` | 416 | +16 | 1 | 学习教练核心类，建议生成 + 反馈分析 |
| 8 | `docmind-sync.js` | 414 | +14 | 1 | 文档同步逻辑 |
| 9 | `bookmark-detail-panel.js` | 414 | +14 | 2 | UI 面板渲染 + 数据绑定 |
| 10 | `bookmark-tag-editor-v2.js` | 412 | +12 | 1 | 标签编辑器组件 |
| 11 | `bookmark-onboarding.js` | 406 | +6 | 3 | 新手引导流程 |
| 12 | `chat-mode.js` | 403 | +3 | 1 | 聊天模式管理 |
| 13 | `bookmark-indexer.js` | 401 | +1 | 1 | 书签索引构建 |

### 2.2 根因

- **R207 回退效应**: `bookmark-io.js` 在 R207 合并了 `bookmark-import-export-io.js` 的独立函数（exportToHTML / exportToJSON / exportToCSV / importFromHTML / importFromJSON），导致原本 ~350 行的文件膨胀至 606 行。这是最严重的违规。
- **Phase 12 遗漏**: R206 拆分重点在 `page-sense.js`、`utils.js`、`docmind-client.js` 等，但后续迭代（R207-R216）新增代码将部分文件重新推过 400 行线。
- **架构门禁文档与现实脱节**: `architecture-metrics.md` 第 91 行声称"所有 lib 文件均 ≤400 行"，属于事实错误。

### 2.3 测试覆盖缺失

以下 2 个目标文件 **没有对应的测试文件**：
- `docmind-sync.js` — 无 `tests/test-docmind-sync.js`
- `bookmark-learning-coach.js` — 无 `tests/test-bookmark-learning-coach.js`

拆分时需同时补充测试，确保回归安全。

---

## 3. 验收标准

| # | 验收条件 | 验证方式 |
|---|---------|---------|
| **AC1** | 13 个目标文件拆分后，所有 `lib/*.js` 文件行数 ≤400 行 | `wc -l lib/*.js | sort -rn | head -20`，最大值 ≤400 |
| **AC2** | 拆分后的模块通过 re-export 模式保持 API 向后兼容，现有 `import { X } from './original.js'` 不需要修改 | `grep -rn "from './bookmark-io.js'" lib/ sidebar/ background/` 验证所有导入方未修改仍可正常解析 |
| **AC3** | `npm run test:ci` 全量回归 0 fail（≥7173 pass / 0 fail） | CI 输出确认 |
| **AC4** | `docs/architecture-metrics.md` 模块拆分历程表新增 Phase 13 行，模块数和行数统计更新为实际值 | 人工审阅 |
| **AC5** | 无测试覆盖的 2 个模块（docmind-sync、bookmark-learning-coach）拆分后补充 ≥5 个测试用例 | `npm run test:ci` 中包含新增测试文件且全部通过 |

---

## 4. 技术约束

### 4.1 拆分模式

沿用项目既有 **re-export 模式**（参见 `lib/bookmark-import-export-io.js`）：

```
lib/bookmark-io.js (拆分前 606 行)
  ├── lib/bookmark-io-core.js          ← 核心导出类 BookmarkImportExport
  ├── lib/bookmark-io-html.js          ← HTML 导入导出函数
  └── lib/bookmark-io-json.js          ← JSON/CSV 导入导出 + 校验

lib/bookmark-io.js (拆分后)            ← re-export 所有子模块，行数 ≤50
```

原文件 `bookmark-io.js` 变为纯 re-export 薄壳，所有消费方无需修改。

### 4.2 拆分策略（按文件类型）

| 文件类型 | 拆分策略 | 目标行数 |
|---------|---------|---------|
| **多函数型**（bookmark-io.js 19 函数、i18n.js 20 函数） | 按功能域分组提取到子模块 | 每个子模块 150-300 行 |
| **大类型**（docmind-client.js、bookmark-graph.js、chat-mode.js） | 将辅助方法 / 内部工具函数提取到 `-utils.js` | 主文件 ≤350 行 |
| **混合型**（bookmark-security-audit.js、bookmark-documentation.js） | 将"生成/渲染"逻辑与"核心逻辑"分离 | 各子模块 ≤300 行 |

### 4.3 不可违反的底线

- **零破坏变更**: 所有 `import` 路径必须保持不变（re-export 薄壳兜底）
- **零测试下降**: `npm run test:ci` 不能有任何 fail 增加
- **模块数预算**: 当前 222 个 lib 模块，门禁上限 220（已超标）。拆分约新增 13-20 个子模块，需同步将模块上限从 220 放宽至 240，或在 architecture-metrics.md 中更新实际值
- **lint 零回归**: 拆分后的文件必须通过 `npm run lint`（0 errors / 0 warnings）

### 4.4 工具链

| 工具 | 用途 |
|------|------|
| `wc -l lib/*.js` | 行数验证 |
| `npm run test:ci` | 全量回归 |
| `npm run lint` | lint 检查 |
| `node --test tests/test-*.js` | 单文件测试 |
| `grep -rn` | API 兼容性验证（导入路径未变） |

---

## 5. 依赖关系

### 5.1 上游依赖

| 依赖 | 说明 |
|------|------|
| R206 (Phase 12) | 上一轮拆分的基线，部分文件在 R207-R216 期间被重新膨胀 |
| R207 | 直接导致 `bookmark-io.js` 膨胀至 606 行的合并操作 |
| R210-R216 | 最近 7 轮迭代可能向目标文件追加了代码 |

### 5.2 下游影响

| 影响范围 | 说明 |
|---------|------|
| `sidebar/sidebar.js` | 导入 `bookmark-graph.js`、`bookmark-io.js`，需验证 re-export 链完整 |
| `options/options.js` | 导入 `docmind-client.js` |
| `lib/docmind-sync.js` | 导入 `docmind-client.js`（本身也是拆分目标） |
| `tests/test-bookmark-io.js` | 核心回归验证，拆分后必须 0 fail |
| `tests/test-bookmark-graph.js` | 图引擎回归验证 |
| 190+ 测试文件 | 全量 `test:ci` 回归 |

### 5.3 与当前迭代的关系

- **R216**（CoverageSprint40，行覆盖率冲刺 40%）与本迭代并行不冲突：R216 补充测试用例，R217 调整源文件结构。建议 **R217 先于或同步于 R216 执行**，避免 R216 的测试依赖的 import 路径变动。
- 本迭代完成后，`architecture-metrics.md` 需同步更新，与 R216 的覆盖率数据共同刷新文档。

---

## 6. 工作量估算

| 阶段 | 工作项 | 预估耗时 |
|------|--------|---------|
| 分析 | 逐一审查 13 个文件，确定拆分点 | 30 min |
| 拆分 | 按文件类型执行拆分 + re-export 薄壳 | 2-3h |
| 测试 | 为 docmind-sync、bookmark-learning-coach 补充测试 | 1h |
| 验证 | 全量回归 + lint + 行数扫描 | 30 min |
| 文档 | 更新 architecture-metrics.md | 15 min |

**总预估**: 约 4-5 小时，复杂度 **Complex**。

---

## 7. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 循环依赖：拆分子模块引入新的循环引用 | 中 | 高 | 拆分前检查依赖图，确保子模块 → 原模块的 re-export 单向 |
| 测试覆盖盲区：无测试模块拆分后引入 bug | 中 | 中 | AC5 要求补充测试，最低 5 用例 |
| 模块数超限：拆分后 lib/ 模块数可能达到 240+ | 高 | 低 | 同步更新 architecture-metrics.md 中的模块上限或实际值 |
| R216 并行冲突：覆盖率测试覆盖拆分后的文件路径 | 低 | 中 | 拆分后立即运行 test:ci 确认兼容，re-export 保证路径不变 |

---

## 8. 里程碑

| 里程碑 | 完成标准 |
|--------|---------|
| **M1: 分析完成** | 13 个文件的拆分方案确定，写入任务清单 |
| **M2: 拆分完成** | 所有 `lib/*.js` ≤400 行，re-export 薄壳就位 |
| **M3: 测试通过** | `npm run test:ci` 0 fail，新增测试全部 green |
| **M4: 文档更新** | `architecture-metrics.md` Phase 13 行 + 模块数更新 |

---

*本文档由 Plan Agent (R217) 生成，作为 ModuleSplitPhase13 的需求基线。*
