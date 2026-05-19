# REQUIREMENTS — R134: 超大模块拆分三期 ModuleSplitPhase3

> 迭代: R31 (飞轮迭代)
> 日期: 2026-05-19
> 复杂度: Complex (跨文件重构)
> 关联: R133 (Lint 警告清零)

---

## 背景

PageWise 的 `lib/` 目录已积累 14 个超过 500 行的模块文件，最大达 643 行。这些超大文件导致：
- **可读性下降**：单文件承担多个职责（如 AI 请求 + 流式解析 + 提示词构建），阅读时上下文切换频繁
- **维护成本高**：修改一个功能需要在数百行中定位代码段
- **合并冲突**：多人协作时容易在同一文件中产生冲突
- **Lint 警告积累**：前序迭代 R133 暴露大量 `no-unused-vars` 警告即源于文件过大导致的冗余导入

前期迭代（R131/R132）已初步拆分部分文件但未完全达标，本次需完成剩余拆分并确保所有 14 个目标文件均 ≤ 400 行。

---

## 用户故事

作为 PageWise 开发者，我希望每个 `lib/` 模块文件不超过 400 行、职责单一且有清晰的子模块边界，以便快速定位代码、降低修改风险、提升团队协作效率。

作为 PageWise 用户，我希望本次重构不影响任何现有功能（书签管理、AI 问答、知识图谱、导出同步等），所有外部 API 行为完全不变。

---

## 目标文件清单

### 优先级 P0 — 前 8 个（> 570 行，必须拆分）

| # | 文件名 | 当前行数 | 拆分策略 |
|---|--------|----------|----------|
| 1 | `bookmark-visualizer.js` | 643 | 物理仿真引擎 → `bookmark-visualizer-physics.js`；Canvas 渲染 → `bookmark-visualizer-renderer.js` |
| 2 | `bookmark-knowledge-link.js` | 643 | 知识关联评分 → `bookmark-knowledge-link-scorer.js` |
| 3 | `bookmark-accessibility.js` | 636 | 对比度审计 → `bookmark-accessibility-contrast.js`；键盘导航 → `bookmark-accessibility-navigator.js` |
| 4 | `bookmark-migration.js` | 624 | 迁移执行器 → `bookmark-migration-runner.js` |
| 5 | `ai-client.js` | 609 | Token 估算 → `ai-client-tokens.js`；流式解析 → `ai-client-stream.js`；请求构建 → `ai-client-request.js`；提示词 → `ai-client-prompts.js` |
| 6 | `bookmark-exporter.js` | 601 | 导入功能 → `bookmark-exporter-import.js` |
| 7 | `contradiction-detector.js` | 589 | Prompt 构建 → `contradiction-detector-prompt.js`；UI 渲染 → `contradiction-detector-ui.js` |
| 8 | `bookmark-semantic-search.js` | 579 | 混合检索 → `bookmark-semantic-search-hybrid.js` |

### 优先级 P1 — 剩余 6 个（552–577 行，应拆分）

| # | 文件名 | 当前行数 | 拆分策略 |
|---|--------|----------|----------|
| 9 | `skill-validator.js` | 577 | 安全检查 → `skill-validator-security.js` |
| 10 | `git-repo.js` | 567 | Git 对象操作 → `git-repo-objects.js` |
| 11 | `bookmark-sync.js` | 561 | 冲突解决与分片 → `bookmark-sync-conflict.js` |
| 12 | `bookmark-ai-recommender.js` | 558 | 用户画像分析 → `bookmark-ai-recommender-profile.js` |
| 13 | `bookmark-final-polish.js` | 555 | 交互效果 → `bookmark-final-polish-interactions.js` |
| 14 | `compilation-report.js` | 552 | 报告格式化 → `compilation-report-format.js` |

---

## 验收标准

### AC1: 行数限制（硬性约束）

所有 14 个原始文件拆分后 **≤ 400 行**；所有新建子模块文件 **≤ 400 行**。

验证方式：
```bash
wc -l lib/bookmark-visualizer.js lib/bookmark-knowledge-link.js ... | awk '$1 > 400 {fail++} END {exit fail}'
```

### AC2: API 向后兼容（re-export 模式）

每个原始文件的 **所有 `export` 符号** 必须保持可导入。采用 re-export 模式：原始文件作为 facade，通过 `import { ... } from './sub-module.js'` 再 `export` 出去。

验证方式：测试文件逐个检查原始文件的每个 `export` 是否仍可导入。

```js
// 正确示例 — ai-client.js
import { buildClaudeRequest } from './ai-client-request.js'
export { buildClaudeRequest } // re-export，外部无感知
```

### AC3: 子模块可独立使用

每个新建子模块必须可以被独立 `import`，不依赖原始 facade 文件。即子模块拥有完整的 JSDoc 头部注释，标明来源和职责。

验证方式：测试文件直接 `import` 子模块并调用其导出函数/类。

### AC4: 功能回归零损失

现有测试套件（`tests/` 目录）全部通过，不得有新增失败。特别是：
- `bookmark-visualizer`：力仿真计算、节点渲染
- `ai-client`：Claude/OpenAI 双协议请求、流式解析
- `bookmark-sync`：冲突解决策略、数据分片
- `bookmark-exporter`：导出/导入格式
- `contradiction-detector`：矛盾检测 prompt 构建

### AC5: 专项测试文件

新增 `tests/test-r134-module-split-phase3.js`，覆盖：
1. 所有 14+16 个文件行数 ≤ 400 行
2. 原始文件 re-export 完整性（每个 export 符号可达）
3. 新建子模块独立可用性（直接 import 并调用）
4. 关键功能正确性回归（initSync、resolveConflict、analyzeProfile、generateReportMarkdown 等）

---

## 技术约束

### 编码规范
- **ES Module**：使用 `export` / `import`，不使用 CommonJS
- **JSDoc**：每个子模块头部包含 `@module` 标注，说明拆分来源和职责范围
- **零新依赖**：不引入任何第三方 npm 包
- **命名约定**：子模块命名格式 `{原文件名}-{职责}.js`，使用 kebab-case

### 拆分原则
1. **按职责拆分**：将原文件中逻辑内聚的功能块提取为独立子模块，不按行数机械切割
2. **最小接口**：子模块只导出必要的函数/类/常量，内部辅助函数不导出
3. **单向依赖**：原文件 → 子模块，子模块之间不互相依赖（无循环依赖）
4. **常量共享**：多个子模块需要的常量放在第一个被提取的子模块中，其他子模块 import 引用

### Re-export 模式

```js
/**
 * 原文件 — 作为 facade，只做 re-export
 * @module lib/xxx
 */
export { funcA, funcB } from './xxx-sub-module.js'
export { ClassC, CONSTANT_D } from './xxx-another-sub.js'
```

- 原文件保留一个简短的 JSDoc 头部注释（说明子模块列表）
- 原文件不再包含业务逻辑代码，仅做 import + re-export
- 如原文件仍需少量初始化逻辑（如 `class` 定义的 constructor），可保留

---

## 依赖关系

### 模块间依赖图（拆分后）

```
ai-client.js (facade)
├── ai-client-tokens.js      ← 无依赖
├── ai-client-stream.js      ← 无依赖
├── ai-client-request.js     ← ai-client-tokens
└── ai-client-prompts.js     ← 无依赖

bookmark-visualizer.js (facade)
├── bookmark-visualizer-physics.js   ← 无依赖
└── bookmark-visualizer-renderer.js  ← bookmark-visualizer-physics

bookmark-accessibility.js (facade)
├── bookmark-accessibility-contrast.js   ← 无依赖
└── bookmark-accessibility-navigator.js  ← 无依赖

bookmark-migration.js (facade)
└── bookmark-migration-runner.js  ← 无依赖

bookmark-exporter.js (facade)
└── bookmark-exporter-import.js   ← 无依赖

contradiction-detector.js (facade)
├── contradiction-detector-prompt.js  ← 无依赖
└── contradiction-detector-ui.js      ← 无依赖

bookmark-semantic-search.js (facade)
└── bookmark-semantic-search-hybrid.js  ← 无依赖

bookmark-knowledge-link.js (facade)
└── bookmark-knowledge-link-scorer.js   ← 无依赖

skill-validator.js (facade)
└── skill-validator-security.js  ← 无依赖

git-repo.js (facade)
└── git-repo-objects.js          ← 无依赖

bookmark-sync.js (facade)
└── bookmark-sync-conflict.js    ← 无依赖

bookmark-ai-recommender.js (facade)
└── bookmark-ai-recommender-profile.js  ← 无依赖

bookmark-final-polish.js (facade)
└── bookmark-final-polish-interactions.js  ← 无依赖

compilation-report.js (facade)
└── compilation-report-format.js  ← 无依赖
```

### 上游依赖（这些模块被谁引用）

| 被拆分文件 | 被引用方 |
|-----------|---------|
| `ai-client.js` | `agent-loop.js`, `sidebar.js`, `background.js` |
| `bookmark-visualizer.js` | `bookmark-panel.js`, `sidebar.js` |
| `bookmark-semantic-search.js` | `bookmark-search.js`, `knowledge-base.js` |
| `bookmark-exporter.js` | `sidebar.js`, `bookmark-panel.js` |
| `bookmark-sync.js` | `background.js`, `sidebar.js` |
| `compilation-report.js` | `sidebar.js`, `bookmark-panel.js` |
| 其他 | 各自对应的面板/服务模块 |

> **关键约束**：所有上游引用方 **无需修改** 任何代码，因为原始文件通过 re-export 模式保持了完全的 API 兼容性。

---

## 非功能需求

| 指标 | 要求 |
|------|------|
| 拆分后文件数增长 | +20 个子模块文件（14 个 facade + 20 个子模块） |
| 总代码量变化 | 不增加（仅移动代码 + 添加 re-export 语句 + JSDoc 头部） |
| 运行时性能影响 | 无（ES Module 的 tree-shaking 会优化，Chrome 扩展不受影响） |
| 内存影响 | 无新增（相同代码，不同文件组织） |

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 子模块之间意外产生循环依赖 | 中 | 构建失败 | 拆分前画依赖图；测试中加入循环依赖检测 |
| re-export 遗漏某个 export 符号 | 中 | 上游模块报错 | 测试中穷举原始文件的每个 export |
| 常量在多子模块中重复定义 | 低 | 数据不一致 | 共享常量只在一处定义，其他 import |
| Git diff 太大导致 CR 困难 | 中 | 合并延迟 | 按 P0→P1 分批提交，每批 ≤ 4 个文件 |

---

## 验收测试矩阵

| 测试类别 | 用例数 | 覆盖内容 |
|---------|--------|---------|
| 文件行数检查 | 30 | 14 个 facade + 16 个子模块 ≤ 400 行 |
| Re-export 完整性 | ~80 | 逐个检查每个 facade 文件的所有 export 符号 |
| 子模块独立可用性 | ~40 | 直接 import 子模块并调用核心函数 |
| 功能回归 | ~30 | 关键业务逻辑（同步/冲突、AI 请求、可视化、报告生成） |
| **合计** | **~180** | |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R134 | 新增：超大模块拆分三期需求，14 个文件 → ≤ 400 行，re-export 模式 |
