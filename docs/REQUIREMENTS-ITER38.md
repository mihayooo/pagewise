# REQUIREMENTS — R141: CoverageYellowZone

> 迭代: R141
> 日期: 2026-05-19
> 复杂度: Medium
> 阶段: 飞轮迭代 R38 — 黄色区域测试补全覆盖率提升
> 前序迭代: R137 (CoverageBoost)、R139 (CoverageRedZone)

---

## 1. 用户故事

作为 PageWise 项目维护者，我发现有 13 个模块的单元测试覆盖率处于 40%-80% 的"黄色区域"——虽然不至于不可用，但存在测试盲区导致潜在回归风险。我希望通过系统性地补充测试用例，将其中至少 9 个模块提升到 ≥80% 覆盖率，从而在后续重构（如 R140 模块拆分）时拥有更可靠的安全网。

**背景**：R139 已完成红色区域（<40%）的覆盖冲刺，本次聚焦黄色区域，延续相同的测试补充模式（`node:test` + `node:assert/strict` + 依赖 mock）。

---

## 2. 验收标准

### AC1: 优先级分组与覆盖率目标

| 优先级 | 模块 | 当前覆盖率 | 目标覆盖率 | 源文件行数 | 已有测试文件 |
|--------|------|-----------|-----------|-----------|-------------|
| **P0** | `lib/compilation-report-format.js` | 47.5% | ≥80% | 255 | `tests/test-compilation-report-format.js` (382L) |
| **P0** | `lib/knowledge-base-export.js` | 52.3% | ≥80% | 279 | ❌ 无 |
| **P0** | `lib/docmind-client.js` | 63.7% | ≥80% | 443 | ❌ 无 |
| **P0** | `lib/knowledge-panel.js` | 65.5% | ≥80% | 528 | `tests/test-knowledge-panel-e2e.js` (469L) |
| **P0** | `lib/bookmark-store-prep-checks.js` | 66.5% | ≥80% | 316 | `tests/test-bookmark-store-prep-checks-unit.js` (391L) |
| **P0** | `lib/message-renderer.js` | 71.2% | ≥80% | 539 | `tests/test-message-renderer-e2e.js` (652L) + `lazy`(387L) |
| **P1** | `lib/knowledge-panel-batch.js` | 72.5% | ≥80% | 193 | ❌ 无 |
| **P1** | `lib/knowledge-panel-virtual.js` | 73.5% | ≥80% | 260 | ❌ 无 |
| **P1** | `lib/bookmark-folder-suggestions.js` | 75.8% | ≥80% | 33 | ❌ 无 |
| **P1** | `lib/bookmark-accessibility-navigator.js` | 77.6% | ≥80% | 147 | ❌ 无 |
| **P2** | `lib/stats.js` | 78.7% | ≥80% | 338 | `tests/test-stats.js` (381L) |
| **P2** | `lib/i18n.js` | 79.2% | ≥80% | 418 | `tests/test-i18n.js` (221L) |
| **P2** | `lib/bookmark-store-prep.js` | 79.4% | ≥80% | 218 | ❌ 无 |

- **必须完成**：P0 组全部 ≥80%（6 个模块）
- **期望完成**：总计至少 9 个模块 ≥80%（P0 全部 + P1 至少 3 个）
- **加分完成**：全部 13 个模块 ≥80%

### AC2: 测试质量要求
- 测试使用 `node:test` + `node:assert/strict`，与项目现有测试风格一致
- 每个模块至少覆盖以下场景：
  - **正常路径（Happy Path）**：核心公共 API 在标准输入下的正确行为
  - **边界条件（Edge Cases）**：空输入、null/undefined、空数组/对象、极长字符串、特殊字符
  - **异常路径（Error Handling）**：依赖抛出异常、网络错误模拟、JSON 解析失败、Chrome API 不可用
- 不允许引入 flaky 测试：所有 mock 必须显式控制返回值，不依赖时序或真实 I/O

### AC3: Mock 策略
- Chrome API：使用 `globalThis.chrome` mock（参考 R137 模式）
- DOM 操作：使用轻量 `MockElement` 类（参考 R137 模式），不依赖 jsdom
- AI 调用：通过构造函数注入 mock 的 `AIClient`（`{ chat: async () => '...' }`）
- IndexedDB：使用内存 mock 或 `mock.fn()` 替代
- 依赖模块：通过动态 import + mock.fn() 替代硬编码依赖

### AC4: 不破坏现有测试
- 运行 `npm run test:ci` 全部通过（0 failures）
- 运行 `npm run test:coverage` 后目标模块覆盖率报告 ≥80%
- 新增测试文件命名遵循 `tests/test-{module-name}.js` 或 `tests/test-{module-name}-unit.js` 规范

### AC5: 测试文件行数约束
- 单个测试文件 ≤ 500 行
- 如果某个模块需要的测试超过 500 行，拆分为多个文件（如 `test-module-unit.js` + `test-module-edge-cases.js`）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 测试框架 | `node:test`（Node.js 内置，项目已全面使用） |
| 断言库 | `node:assert/strict` |
| 零外部依赖 | 不新增任何 npm devDependencies |
| 覆盖率工具 | `c8`（项目已配置于 `test:coverage` 脚本） |
| 文件编码 | UTF-8，LF 换行符 |
| ESM 模块 | 测试文件使用 ESM import/export，与源文件一致 |
| 不修改源文件 | 本次迭代**仅补充测试**，不修改 `lib/` 下任何源文件 |
| Chrome API mock | 统一使用 `globalThis.chrome` 挂载，测试结束后清理 |
| 无 DOM 依赖 | 测试在 Node.js 环境运行，DOM 相关代码通过 MockElement 模拟 |

---

## 4. 依赖关系

### 前序依赖
| 依赖 | 说明 |
|------|------|
| R137 (CoverageBoost) | 已建立测试模式：Chrome mock、MockElement、依赖注入模板 |
| R139 (CoverageRedZone) | 已完成 <40% 模块覆盖，本次聚焦 40%-80% 区间 |
| R140 (ModuleSplitPhase4) | 已拆分部分大模块（如 `bookmark-scheduler.js`、`evolution.js`），确保测试针对拆分后的最新代码 |

### 后续影响
| 影响 | 说明 |
|------|------|
| R142+ 继续拆分 | 高覆盖率是模块拆分的安全前提，本次完成后可放心推进剩余 >500 行模块的拆分 |
| CI/CD 流水线 | `test:ci` 和 `test:coverage` 作为门禁检查，本次完成后绿色区域（≥80%）模块数增加 |
| 技术债务指标 | 模块平均覆盖率预期从 ~60% 提升至 ~80%+ |

### 模块间依赖（测试时需 mock 的关键依赖）

| 目标模块 | 主要依赖（需 mock） |
|----------|---------------------|
| `compilation-report-format.js` | 无外部依赖（纯函数格式化） |
| `knowledge-base-export.js` | IndexedDB/Chrome Storage、FileSaver |
| `docmind-client.js` | `fetch` API、Chrome API |
| `knowledge-panel.js` | DOM 操作、`knowledge-panel-types.js`、Chrome API |
| `bookmark-store-prep-checks.js` | `bookmark-store-prep.js`、Chrome Storage |
| `message-renderer.js` | DOM 操作、AI Client、Sanitize 模块 |
| `knowledge-panel-batch.js` | `knowledge-panel.js`、`knowledge-panel-virtual.js` |
| `knowledge-panel-virtual.js` | DOM 操作、虚拟滚动逻辑 |
| `bookmark-folder-suggestions.js` | 书签数据输入 |
| `bookmark-accessibility-navigator.js` | DOM 操作、键盘事件 |
| `stats.js` | IndexedDB/Chrome Storage |
| `i18n.js` | Chrome API、locale 数据 |
| `bookmark-store-prep.js` | IndexedDB/Chrome Storage、BookmarkCollector |

---

## 5. 实施策略（建议）

### 阶段一：P0 — 深度补缺（前 6 个，覆盖率 <71%）
1. **新建测试**：`knowledge-base-export.js`、`docmind-client.js`（目前无测试文件）
2. **扩展现有测试**：`compilation-report-format.js`、`knowledge-panel.js`、`bookmark-store-prep-checks.js`、`message-renderer.js`
3. 优先使用已有测试文件作为骨架，在此基础上补充未覆盖的分支和异常路径

### 阶段二：P1 — 快速提升（4 个，71%-78%）
1. **新建测试**：`knowledge-panel-batch.js`、`knowledge-panel-virtual.js`、`bookmark-folder-suggestions.js`、`bookmark-accessibility-navigator.js`
2. 这些模块源文件较小（33-260 行），新增测试成本低，快速达成 ≥80% 目标

### 阶段三：P2 — 收尾微调（3 个，78%-80%）
1. **扩展现有测试**：`stats.js`、`i18n.js`
2. **新建测试**：`bookmark-store-prep.js`
3. 距 80% 最近，通常只需补充 3-5 个边界用例即可达标

---

*文档生成于 2026-05-19*
*飞轮迭代流程 — Plan Agent 产出*
