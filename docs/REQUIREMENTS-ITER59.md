# 需求文档 — R161: 超大 lib 文件拆分八期 ModuleSplitPhase8

> 迭代: R59 | 日期: 2026-05-19 | 复杂度: Complex

---

## 1. 用户故事

**作为** PageWise 项目维护者，**我希望** 将剩余 25 个超 400 行的 lib 文件中最大的 8 个（>474 行）拆分为职责单一的子模块（每文件 ≤400 行），**以便** 保持代码可维护性基线一致，防止"大文件堆积"导致的认知负荷过高和合并冲突频发。

---

## 2. 现状分析

### 2.1 文件行数分布

当前 `lib/` 目录共有 **25 个文件超过 400 行**上限，其中 11 个超过 460 行。本次迭代聚焦 **前 8 个**（按行数降序）：

| # | 文件 | 行数 | 职责域 | 前次迭代 | 测试文件 |
|---|------|------|--------|----------|----------|
| 1 | bookmark-knowledge-integration.js | 547 | 书签-知识库联动编排层 | R157 拆分声称完成但未生效 | ❌ 无测试 |
| 2 | message-renderer.js | 539 | 消息渲染系统（懒渲染 + 批量加载） | R157 拆分声称完成但未生效 | test-message-renderer-e2e.js |
| 3 | knowledge-panel.js | 528 | 知识库面板（列表/详情/搜索） | R120/R157 部分子模块已拆出 | test-knowledge-panel-e2e.js |
| 4 | bookmark-notifier.js | 493 | 书签通知系统（偏好/历史/类型） | — | test-bookmark-notifier-unit.js |
| 5 | batch-summary.js | 482 | 批量摘要引擎（分段/压缩/AI 摘要） | — | test-batch-summary.js |
| 6 | bookmark-search.js | 477 | 书签搜索（索引 + 图谱 + 语义 + AI 推荐合并） | — | test-bookmark-search.js |
| 7 | bookmark-batch.js | 476 | 批量操作（删除/标签/移动/导出） | — | test-bookmark-batch.js |
| 8 | bookmark-duplicate-detector.js | 474 | 重复检测器（精确/模糊/标题匹配） | — | test-bookmark-duplicate-detector.js |

**合计**: 3,916 行 → 拆分后预计 10-12 个子模块，每个 ≤400 行。

### 2.2 R157 历史遗留

R157（迭代 R55）声称完成 bookmark-knowledge-integration.js、message-renderer.js、knowledge-panel.js 的拆分，但 R158 实测这 3 个文件行数未变（547/539/528），拆分未落地。本次 R161 必须实际执行拆分并用 `wc -l` 验证。

### 2.3 Re-export 模式参考

R116 已建立成熟的 re-export 模式：

```javascript
// knowledge-base.js — 拆分后的薄门面层
/**
 * KnowledgeBase — 向后兼容门面模块
 * 委托给拆分后的子模块
 */
export { KnowledgeBaseExport as KnowledgeBase } from './knowledge-base-export.js';
export { bigrams, ... } from './knowledge-base-query.js';
// ... 其他 re-export
```

R161 所有拆分均遵循此模式：原文件变为薄门面层（re-export），实际逻辑拆入 `-sub1`、`-sub2` 等子模块。

---

## 3. 验收标准

### AC1：8 个目标文件全部 ≤400 行

- [ ] 拆分后对 8 个原文件执行 `wc -l`，每个文件 ≤400 行。
- [ ] 原文件保留为薄门面层（re-export），不删除。
- [ ] 新建的子模块文件每个 ≤400 行。

**验证命令**:
```bash
for f in bookmark-knowledge-integration message-renderer knowledge-panel \
         bookmark-notifier batch-summary bookmark-search \
         bookmark-batch bookmark-duplicate-detector; do
  wc -l lib/${f}.js
done
```

### AC2：API 向后兼容（零 Breaking Change）

- [ ] 所有从原文件导出的类、函数、常量，拆分后仍可通过原路径导入。
- [ ] 现有 `import { X } from './lib/xxx.js'` 调用无需修改。
- [ ] 子模块内部依赖通过相对路径引用，不引入循环依赖。

### AC3：全量回归 0 fail

- [ ] `npm run test:ci` 全量回归通过（当前基线 6157 pass / 0 fail）。
- [ ] 拆分后不引入新的 lint 警告（`npm run lint` 0 errors 0 warnings）。

### AC4：拆分后子模块职责单一

- [ ] 每个子模块有清晰的职责边界（按功能域拆分，如：通知生成 vs 通知偏好 vs 通知历史）。
- [ ] 子模块间无循环依赖。
- [ ] 子模块可独立测试（不依赖原门面文件）。

### AC5：拆分落地验证（防 R157 重演）

- [ ] 拆分完成后，对每个目标文件执行 `wc -l lib/xxx.js` 确认行数 ≤400。
- [ ] 对每个新建子模块执行 `wc -l lib/xxx-*.js` 确认行数 ≤400。
- [ ] 验证原文件中不再包含函数实现（仅 re-export 语句 + JSDoc 注释）。

---

## 4. 拆分方案概要

> 详细拆分方案在 DESIGN-ITER59.md 中输出，此处仅列方向性规划。

| 文件 | 原行数 | 预计子模块 | 拆分方向 |
|------|--------|-----------|----------|
| bookmark-knowledge-integration.js | 547 | 2-3 个 | 编排层 → 双向导航 + 仪表盘 + 增强 |
| message-renderer.js | 539 | 2 个 | 渲染核心 → 消息创建/更新 + 懒加载/滚动 |
| knowledge-panel.js | 528 | 2 个 | 已有 batch/virtual 子模块 → 进一步拆出列表/详情逻辑 |
| bookmark-notifier.js | 493 | 2 个 | 通知生成 → 通知引擎 + 偏好/历史管理 |
| batch-summary.js | 482 | 2 个 | 分段/压缩 + AI 摘要/结构化输出 |
| bookmark-search.js | 477 | 2 个 | 搜索核心 → 索引搜索 + 语义/AI 搜索 |
| bookmark-batch.js | 476 | 2 个 | 批量操作 → 删除/标签 + 移动/导出 |
| bookmark-duplicate-detector.js | 474 | 2 个 | 检测核心 → 精确/模糊检测 + 合并/清理 |

**预计新增子模块**: 10-16 个

---

## 5. 技术约束

### 5.1 Re-export 门面模式

- 原文件必须保留为可导入的门面层，所有现有 `import` 路径不变。
- 门面文件仅包含 `export { ... } from './xxx-sub.js'` 和 JSDoc 注释。
- 门面文件行数不计入 400 行上限（但应尽量精简）。

### 5.2 子模块命名规范

- 子模块文件名格式: `{原文件名}-{功能后缀}.js`
- 示例: `bookmark-notifier-engine.js`、`bookmark-notifier-prefs.js`
- 避免使用 `-sub1`/`-sub2` 等无语义命名。

### 5.3 依赖管理

- 子模块之间的依赖关系必须是单向 DAG（无循环）。
- 若原文件存在内部私有函数被多个子模块共享，提取到独立的 `-utils.js` 子模块。
- 外部依赖（import from other lib modules）保留在使用它的子模块中。

### 5.4 测试兼容

- 拆分不得破坏现有测试（测试导入路径不变，因为原文件是 re-export 门面）。
- 为 bookmark-knowledge-integration.js（当前无测试）补充基础冒烟测试（≥5 用例）。
- 新建子模块可选添加独立单元测试（非强制，但鼓励）。

### 5.5 禁止事项

- 禁止在拆分过程中修改任何函数的签名或行为。
- 禁止删除任何导出（即使认为该导出无用）。
- 禁止引入新的第三方依赖。
- 禁止修改测试文件（除非测试本身有 bug）。

---

## 6. 依赖关系

### 6.1 上游依赖

| 依赖项 | 说明 | 状态 |
|--------|------|------|
| R158: sidebar.js 拆分落地 | sidebar/ 目录结构已稳定 | ✅ 已完成 |
| R159: ESLint 警告清零 | 代码中无 lint 警告 | ✅ 已完成 |
| R160: 覆盖率基础设施修复 | c8 配置已修复、覆盖率可度量 | ✅ 已完成 |
| R157: 超大模块拆分七期 | 部分文件拆分未落地，本次需补完成 | ⚠️ 部分完成 |

### 6.2 下游影响

| 受影响项 | 说明 |
|----------|------|
| R162: 全量回归与发布收尾 | R161 完成后执行最终回归 |
| 覆盖率指标 | 拆分后文件数增加，覆盖率分母变大，需 R160 基础设施已就绪 |
| IDE / 开发者体验 | 小文件更易导航和并行编辑 |

### 6.3 并行可能性

8 个文件的拆分互不依赖，可并行执行：
- **批次 A（优先）**: bookmark-knowledge-integration (547) + message-renderer (539) + knowledge-panel (528) — R157 遗留，优先补完成
- **批次 B**: bookmark-notifier (493) + batch-summary (482)
- **批次 C**: bookmark-search (477) + bookmark-batch (476) + bookmark-duplicate-detector (474)

每个批次完成后立即运行 `npm run test:ci` 验证 0 fail。

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| R157 重演：声称完成但实际未拆分 | 代码质量无改善 | AC5 强制 `wc -l` 验证 + CI 门禁脚本 |
| 拆分引入循环依赖 | 运行时错误 / 构建失败 | 设计阶段画依赖图，实现后用 `scripts/health-check.sh` 检测 |
| bookmark-knowledge-integration 无测试 | 拆分后无法验证正确性 | AC3 要求补充 ≥5 个冒烟测试 |
| knowledge-panel.js 已有子模块 | 拆分边界可能与现有子模块冲突 | 设计阶段审查 knowledge-panel-batch.js / knowledge-panel-virtual.js，避免职责重叠 |
| 覆盖率分母增大 | 覆盖率百分比可能小幅下降 | 确保 R160 覆盖率基础设施已就绪，拆分后立即验证覆盖率不低于基线 |

---

## 8. 验证清单

拆分完成后逐文件执行：

```bash
# 1. 行数验证
for f in bookmark-knowledge-integration message-renderer knowledge-panel \
         bookmark-notifier batch-summary bookmark-search \
         bookmark-batch bookmark-duplicate-detector; do
  lines=$(wc -l < lib/${f}.js)
  if [ "$lines" -gt 400 ]; then echo "❌ ${f}.js = ${lines} lines (超过 400)"; fi
done

# 2. 全量回归
npm run test:ci

# 3. Lint 检查
npm run lint

# 4. 循环依赖检测
node scripts/health-check.sh
```

---

*文档生成于 2026-05-19*
*遵循飞轮迭代流程 (flywheel-iteration)*
