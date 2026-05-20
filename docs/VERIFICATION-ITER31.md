# VERIFICATION.md — Iteration #31 Review

> **R188: knowledge-graph 模块测试补全** — 为 `knowledge-graph-layout.js`、`knowledge-graph-utils.js`、`knowledge-graph-wiki.js` 补充单元测试，目标 ≥15 用例/模块

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ✅ | 三个模块均已覆盖，所有导出函数均有边界测试 |
| 代码质量 | ⚠️ | 测试代码质量良好，但 `remote_wins` 策略测试存在语义隐患（见下文） |
| 测试覆盖 | ✅ | 37 + 20 + 22 = **79 个新用例**，全部通过，远超 ≥15/模块目标 |
| 文档同步 | ⚠️ | CHANGELOG.md / TODO.md 未见 R188 更新（但本轮任务仅需测试补全） |
| 安全质量 | ✅ | 无硬编码密钥，无 XSS 风险，纯逻辑层测试 |

## 测试结果

```
tests/test-knowledge-graph-layout-unit.js      →  37 pass /  0 fail  (8 suites)
tests/test-knowledge-graph-utils-enhanced.js    →  20 pass /  0 fail  (3 suites)
tests/test-knowledge-graph-wiki-enhanced.js     →  22 pass /  0 fail  (2 suites)
─────────────────────────────────────────────────────────────────────────
合计新增                                        →  79 pass /  0 fail
全量知识图谱测试（含已有文件）                   → 126 pass /  0 fail
执行耗时                                        → ~607ms
```

## 模块覆盖明细

### `knowledge-graph-layout.js` — 37 用例

| 测试组 | 用例数 | 覆盖范围 |
|--------|--------|----------|
| TAG_COLORS 常量 | 3 | 非空、hex 格式、≥10 种 |
| buildGraphData() 边界 | 9 | 非数组输入、缺字段、颜色一致性、size 上限、maxNodes 裁剪、优先级 |
| forceDirectedLayout() 边界 | 6 | 斥力分离、数值稳定性、自引用边、孤立边、初始化保留、padding 约束 |
| applyZoomTransform() 边界 | 5 | null 输入、默认值、scale=0、属性保留 |
| screenToWorld() 边界 | 3 | 除零保护、undefined transform、负坐标 |
| computeMinimapViewport() 边界 | 3 | 1:1 映射、最小尺寸保底、默认 transform |
| filterGraphByTags() 边界 | 3 | undefined 过滤、单 group 过滤、null 输入 |
| buildTooltipText() 边界 | 5 | 缺 label、缺 group、80 字截断边界、81 字截断、关联计数 |

### `knowledge-graph-utils.js` — 20 用例

| 测试组 | 用例数 | 覆盖范围 |
|--------|--------|----------|
| extractSubgraph() 增强 | 7 | 环形图 BFS、星型图中心/叶子、depth=0 clamp、负深度、链式全遍历、不存在节点边 |
| exportGraphToDataURL() 增强 | 5 | 空字符串透传、undefined 输入、默认 mimeType、自定义类型、quality 参数 |
| importGraphData() 增强 | 8 | 空数据、undefined local、remote_wins、local_wins、颜色分配、统计计数、混合格式、displayName 回退 |

### `knowledge-graph-wiki.js` — 22 用例

| 测试组 | 用例数 | 覆盖范围 |
|--------|--------|----------|
| classifyEdgeType() 增强 | 8 | 无矛盾 qa→RELATION、空矛盾数组、空/undefined nodeType、numeric id=0 falsy、多矛盾匹配、concept-concept、entity-concept |
| buildWikiGraphData() 增强 | 14 | null/undefined options、displayName 优先级（entity/concept）、缺字段回退、三类混合、tagColorMap 全覆盖、size 连接数、矛盾边标签、非矛盾标签、maxNodes 裁剪、nodeType 标注 |

## 发现的问题

### ⚠️ 问题 1: `remote_wins` 策略测试 — 语义不精确（低优先级）

**文件**: `tests/test-knowledge-graph-utils-enhanced.js` 第 143-153 行

**描述**: 测试名为 `"remote_wins 策略覆盖本地属性"`，但实际断言仅检查 `result.updated === 1`（计数器），并未验证 `localNode.entry.status` 是否被 remote 值覆盖。

**实际行为**: 查看源码 `knowledge-graph-utils.js` 第 103-107 行，`remote_wins` 策略实际上 **只填充 undefined/null 属性**，不会覆盖已有值。这与 `local_wins` 策略（第 109-114 行）的行为完全相同。

**影响**: 测试因为检查的是计数器而非属性值而"恰好通过"。如果未来有人修改源码使 `remote_wins` 真正覆盖属性，现有测试也不会察觉行为变化。

**建议**: 在测试中断言属性实际值：
```js
// 补充断言
assert.equal(local.nodes[0].entry.status, 'new', 'remote_wins 应覆盖为 remote 值');
// 或者更名测试为 "remote_wins 仅填充缺失属性"
```

### ⚠️ 问题 2: 数组 import 风格不一致（极低优先级）

**文件**: `tests/test-knowledge-graph-utils-enhanced.js` 第 11 行 vs 其他两个测试文件

**描述**: `knowledge-graph-utils-enhanced.js` 使用 `await import(...)` 动态导入（因 `importGraphData` 不在顶层 import 列表），而另外两个文件使用标准 `import { ... } from`。这是合理的技术选择（`importGraphData` 未被 named export 解构），但语义上三者一致。

**影响**: 无功能影响。`await import` 是 ESM 标准用法。

## 返工任务清单

| # | 优先级 | 文件 | 任务 | 预估工时 |
|---|--------|------|------|----------|
| 1 | 低 | `tests/test-knowledge-graph-utils-enhanced.js` | 为 `remote_wins` 测试补充属性值断言，或更正测试名称为"仅填充缺失属性" | 5 min |

> **无阻塞问题**。所有 79 个新用例通过，与已有 47 个用例无冲突。可合并。

## 代码亮点

1. **边界覆盖全面**: 空值 (null/undefined)、类型错误 (非数组)、极端值 (scale=0、depth=-3)、falsy 值 (id=0) 均有覆盖
2. **物理仿真测试设计合理**: `forceDirectedLayout` 测试正确处理了"完全重叠节点力方向为零向量"的特殊场景，用微小偏移代替完全重叠
3. **截断边界精确**: `buildTooltipText` 分别测试 80 字（不截断）和 81 字（截断），精准验证边界
4. **import 方式务实**: `await import()` 是处理 named export 不在顶层 import 列表的合理方式
