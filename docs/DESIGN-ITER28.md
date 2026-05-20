# 设计文档 — R185: EmbeddingEngine 性能断言收紧

> 迭代: R28 (飞轮迭代 R28)
> 日期: 2026-05-20
> 复杂度: Low (断言阈值调整，无功能变更)
> 设计人: Plan Agent (Hermes)

---

## 1. 架构概述

本次变更为**纯测试层修改**，不涉及任何源码（`lib/`）变更。

```
┌─────────────────────────────────────────────────────────────┐
│  变更范围 — 仅测试断言                                        │
│                                                             │
│  tests/test-embedding-engine.js                             │
│  ├── describe('EmbeddingEngine — 性能')                      │
│  │   └── it('1000 条数据搜索 < 100ms')                       │
│  │       ├── 当前: assert(elapsed < 500)  ← 断言宽松         │
│  │       └── 目标: assert(elapsed < 100)  ← 收紧到 100ms    │
│  │       └── 注意: 测试名称已是 '< 100ms'，与断言不一致！      │
│                                                             │
│  tests/test-embedding.js                                    │
│  ├── describe('EmbeddingEngine — 性能')                      │
│  │   ├── it('1000 条数据搜索 < 200ms')                       │
│  │   │   ├── 当前: assert(elapsed < 500)  ← 断言宽松         │
│  │   │   └── 目标: assert(elapsed < 100)  ← 收紧到 100ms    │
│  │   │   └── 注意: 测试名称是 '< 200ms'，需改为 '< 100ms'    │
│  │   └── it('向量生成 < 5ms')  ← 不变，不在范围内             │
│                                                             │
│  lib/embedding-engine.js  ← 不修改（零变更）                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 问题分析

### 2.1 现状不一致

两个测试文件中的性能断言存在**名称与阈值不一致**的问题：

| 文件 | 测试名称 | 断言阈值 | 问题 |
|------|----------|----------|------|
| `test-embedding-engine.js:421` | `'1000 条数据搜索 < 100ms'` | `elapsed < 500` | 名称已写 100ms，断言却是 500ms |
| `test-embedding.js:309` | `'1000 条数据搜索 < 200ms'` | `elapsed < 500` | 名称写 200ms，断言却是 500ms |

### 2.2 历史原因

commit `1b5d936` 实现了 `buildVocabulary` 预计算文档向量的优化，使搜索性能从 ~635ms 降至 ~3ms。但断言阈值（500ms）仅做了一次保守调整（可能从更高值降到 500ms），未同步收紧到与预计算优化后的实际性能匹配。

测试名称可能是后续手动编辑时提前写入了预期阈值，但断言数值未同步更新。

### 2.3 性能实测数据

在 `buildVocabulary` 预计算向量后，1000 条数据的搜索性能：

| 指标 | 值 |
|------|-----|
| 最小值 | 1.39 ms |
| 最大值 | 6.43 ms |
| 平均值 | 3.25 ms |
| 中位数 | 3.56 ms |

**100ms 阈值提供了 ~15x 安全余量**，覆盖 CI 环境资源受限的极端场景。

---

## 3. 设计决策记录

| ID | 日期 | 决策 | 原因 | 替代方案 |
|----|------|------|------|----------|
| D001 | 2026-05-20 | 收紧到 `< 100ms` 而非 `< 50ms` 或 `< 10ms` | 实测 1.4–6.4ms，100ms 提供 ~15x 余量；CI 环境（共享 CPU、低配 runner）可能有 10–30x 慢于本地，100ms 是安全的保守值 | `< 50ms`（可能在低端 CI runner 上 flaky）、`< 10ms`（过于激进）|
| D002 | 2026-05-20 | 统一两个测试文件的阈值和名称 | 两个文件测试同一核心功能（预计算向量后搜索），行为应一致；消除名称/断言不一致的技术债 | 保留差异（容易产生困惑）|
| D003 | 2026-05-20 | 测试名称统一为 `'1000 条数据搜索 < 100ms'` | 与 R185 需求标题一致；`test-embedding-engine.js` 的名称已是 `< 100ms`，保持不变；`test-embedding.js` 的 `< 200ms` 改为 `< 100ms` | 使用其他阈值命名（与需求标题不一致）|
| D004 | 2026-05-20 | 断言使用 `elapsed < 100` 数字而非变量 | 断言阈值是固定值，无需配置化；保持测试简洁可读 | 使用 `const PERF_THRESHOLD = 100` 常量（过度工程化）|
| D005 | 2026-05-20 | 不修改 `lib/embedding-engine.js` | 性能优化已在 commit `1b5d936` 完成（buildVocabulary 预计算向量）；本次仅为断言收紧 | 进一步优化源码（不需要，性能已足够好）|

---

## 4. 需要修改的文件列表

| 文件 | 操作 | 变更内容 | 行数影响 |
|------|------|----------|----------|
| `tests/test-embedding-engine.js` | 修改 | 断言阈值 `500` → `100`（第 446 行）；错误消息同步更新 | 0 行（原地修改）|
| `tests/test-embedding.js` | 修改 | 测试名称 `< 200ms` → `< 100ms`（第 309 行）；断言阈值 `500` → `100`（第 332 行）；错误消息同步更新 | 0 行（原地修改）|
| `docs/CHANGELOG.md` | 修改 | 新增 R185 条目 | +1 行 |
| `docs/TODO.md` | 修改 | 标记 R185 状态 | ~0 行 |

**不需要修改的文件：**

| 文件 | 原因 |
|------|------|
| `lib/embedding-engine.js` | 性能优化已完成（commit `1b5d936`），源码无需变更 |
| `lib/bookmark-semantic-search.js` | 不涉及搜索模块逻辑变更 |
| `lib/bookmark-advanced-search.js` | 不涉及 |

---

## 5. 新增的函数/类

**无。** 本次变更为纯断言阈值调整，不引入任何新的函数、类或接口。

---

## 6. 接口设计

**无接口变更。** `EmbeddingEngine` 的公共 API 完全不变：

```
EmbeddingEngine
  ├── constructor()
  ├── tokenize(text) → string[]
  ├── buildVocabulary(entries) → void
  ├── generateVector(text) → Map<term, weight>
  ├── generateDocumentVector(entry) → Map<term, weight>
  ├── cosineSimilarity(vec1, vec2) → number
  ├── search(query, entries, limit) → { entry, score }[]
  ├── invalidateCache(entryId) → void
  ├── static tokenize(text) → string[]
  ├── static calculateSimilarity(t1, t2) → number
  └── static semanticSearch(query, entries, limit) → { entry, score }[]
```

---

## 7. 变更细节

### 7.1 `tests/test-embedding-engine.js` — 行 446

```
当前 (第 446 行):
  assert.ok(elapsed < 500, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 500ms`);

目标:
  assert.ok(elapsed < 100, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 100ms`);
```

**说明：** 测试名称（第 421 行）已是 `'1000 条数据搜索 < 100ms'`，无需修改。仅需将断言从 500 收紧到 100，使名称与断言一致。

### 7.2 `tests/test-embedding.js` — 行 309 + 行 332

```
当前 (第 309 行):
  it('1000 条数据搜索 < 200ms', () => {

目标:
  it('1000 条数据搜索 < 100ms', () => {
```

```
当前 (第 332 行):
  assert.ok(elapsed < 500, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 500ms`);

目标:
  assert.ok(elapsed < 100, `搜索耗时 ${elapsed.toFixed(1)}ms 应 < 100ms`);
```

**说明：** 测试名称和断言均需更新，最终两个文件保持一致。

### 7.3 不变项 — `test-embedding.js` 第 335–343 行

```
it('向量生成 < 5ms', () => { ... assert(elapsed < 5000) ... })
```

此测试测量 1000 次 `generateVector` 调用的总耗时，与搜索性能断言无关，不在本次范围内。

---

## 8. 测试策略

### 8.1 验证方法

```bash
# 运行两个相关测试文件
node --test tests/test-embedding-engine.js
node --test tests/test-embedding.js

# 完整测试套件（确保零回归）
node --test tests/*.test.js tests/test-embedding*.js
```

### 8.2 通过标准

- `test-embedding-engine.js` 所有用例通过（含收紧后的性能断言）
- `test-embedding.js` 所有用例通过（含收紧后的性能断言）
- 全量测试套件零回归

### 8.3 Flaky 防护

100ms 阈值基于实测 1.4–6.4ms 的 ~15x 余量。即使在以下条件下仍应稳定通过：

| 条件 | 预期慢倍数 | 100ms 内通过？ |
|------|-----------|---------------|
| 本地开发 | 1x | ✅ (~3ms) |
| GitHub Actions (标准 runner) | 3–5x | ✅ (~15ms) |
| 低端 CI runner | 10–15x | ✅ (~45ms) |
| 极端资源竞争 (CPU 90%+) | 20–30x | ⚠️ 边界 (~90ms) |

若 CI 上出现偶发失败，可考虑将阈值放宽到 150ms（仍有 ~5x 余量）。但 100ms 在当前测试数据下是安全的。

---

## 9. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| CI 环境下 100ms 阈值 flaky | 低 | 中 | 实测仅 3ms，100ms 有 15x 余量；若出现 flaky 可放宽到 150ms |
| 名称/断言修改引入语法错误 | 极低 | 高 | 修改仅涉及数字常量和字符串字面量；node:test 运行即可验证 |
| 其他测试受断言变更影响 | 无 | — | 性能测试独立，不影响功能测试 |

---

## 10. 不在范围内 (Out of Scope)

| 项目 | 原因 |
|------|------|
| 进一步优化 `lib/embedding-engine.js` | 预计算向量优化已完成，搜索性能已足够好（~3ms）|
| 添加更多性能测试（如 10000 条数据） | R185 仅收紧现有断言，不扩展测试覆盖面 |
| `向量生成 < 5ms` 测试（test-embedding.js:335）| 测量向量生成而非搜索，不在范围内 |
| 性能回归 CI 检测机制 | 为独立任务（如有需要，可作为后续迭代）|

---

## 11. 总结

R185 是一个极简变更：修改 2 个测试文件中的 3 处代码（1 个测试名称 + 2 个断言阈值），使性能断言与实际表现（~3ms）匹配，并消除测试名称与断言不一致的技术债。无源码变更，无新接口，无功能影响。

---

*设计完成于 2026-05-20 (Plan Agent)*
