# VERIFICATION.md — Iteration #10 Review

> R277: 运行时性能优化与内存治理 RuntimePerfOpt
> 审查时间: 2026-05-25
> 审查维度: 功能完整性 · 代码质量 · 测试覆盖 · 文档同步 · 安全质量

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 6 项子任务仅完成 3 项，3 项关键交付缺失 |
| 代码质量 | ⚠️ | 已实现部分质量尚可，但存在 API 命名不一致和死代码 |
| 测试覆盖 | ⚠️ | performance-monitor 测试 32 用例达标，但 CRUD 新增功能和视觉器降级均无测试 |
| 文档同步 | ❌ | TODO.md 未勾选、CHANGELOG 无 R277 条目、performance-baseline.md 未创建 |
| 安全质量 | ✅ | 无硬编码密钥、无 XSS 风险、IndexedDB 使用安全 |

---

## 逐项功能验收

### (1) 性能监控模块 `lib/performance-monitor.js` — ✅ 已完成

- 新建 `lib/performance-monitor.js`（328 行），覆盖 4 个核心指标:
  - `SIDEPANEL_RENDER` (阈值 300ms)
  - `KNOWLEDGE_QUERY` (阈值 50ms)
  - `AI_RESPONSE` (阈值 5000ms)
  - `INDEXEDDB_TXN` (阈值 100ms)
- API: `start/end/measure/measureAsync/getStats/getAllStats/getReport/getAlerts/snapshot/reset`
- FIFO 采样淘汰（默认 maxSamples=200）
- 线性插值百分位计算（p50/p95/p99）
- 阈值告警分级: warning / error / critical
- 内存快照（Node.js `process.memoryUsage`）
- 全局单例模式 `getMonitor()` / `resetMonitor()`
- **问题**: `PerformanceMonitor` 仅自包含，未被任何业务模块 import/集成（sidepanel、knowledge-base、ai-client 均未使用）

### (2) 书签图谱渲染优化 — ⚠️ 部分完成

**已完成:**
- `bookmark-visualizer.js`: 新增 `_degraded` / `_degradeFrameSkip` / `_tickCount` 字段
- 大图谱降级策略: `graphData.nodes.length > 500` 时激活，每 3 tick 渲染一次（帧率降为 ~20fps）
- `bookmark-visualizer-renderer.js`: `renderFrame` 接收 `degraded` 参数，降级模式下非高亮节点标签隐藏
- `destroy()` 清理 `_dirtyNodes` 和 `_degraded` 状态

**未完成:**
- ❌ **脏区域检测（仅重绘变化节点）**: `_dirtyNodes = new Set()` 已声明，但从未被写入任何值，`renderFrame` 也未使用脏区域做增量渲染。当前仍是每帧全量 `clearRect` + 全量重绘，`_dirtyNodes` 为死代码
- ❌ 边标签隐藏策略未实现 — 需求说"隐藏边标签"但代码仅隐藏了非高亮节点标签，边本身仍全部绘制

### (3) 知识库 IndexedDB 查询优化 — ✅ 已完成（有隐患）

**已完成:**
- `knowledge-base-core.js`: DB version 2→3，升级路径添加 `(type+updatedAt)` 复合索引
- `knowledge-base-crud.js`: 新增 `getEntriesCursorPaged()` 方法（101 行），支持:
  - 按 `category` 过滤（利用复合索引 `type_updatedAt`）
  - 按 `updatedAfter` 时间过滤
  - 游标分页遍历（替代 `getAll()`），降低内存峰值
  - `count()` + `cursor` 两阶段查询

**隐患:**
- ⚠️ **索引命名不一致**: 复合索引名 `type_updatedAt` 实际对应字段 `['category', 'updatedAt']`，`type` 与 `category` 混淆，未来维护易误读
- ⚠️ **`updatedAt` 独立索引不存在**: `getEntriesCursorPaged` 当 `category` 为 null 时回退到 `indexName = 'updatedAt'`，但数据库 schema 未创建 `updatedAt` 独立索引（仅有 `createdAt`），运行时将抛出 `NotFoundError`
- ⚠️ **DB version 升级风险**: version 2→3 会影响所有现有用户的数据库，触发 `onupgradeneeded`，需确保旧数据无 `updatedAt` 字段时复合索引不报错

### (4) 内存泄漏排查 — ❌ 未完成

- ❌ **service-worker AI 响应缓存 LRU**: `background/service-worker.js` 无任何修改，未添加 LRU 淘汰（上限 200 条）
- ❌ **SidePanel 关闭时释放 Canvas/DOM**: `sidebar/sidebar.js` 无任何修改，未添加关闭时的 Canvas/DOM 引用释放逻辑

### (5) 性能基线文档 — ❌ 未完成

- ❌ `docs/reports/performance-baseline.md` 文件不存在
- 需记录: SidePanel 打开 <300ms / 知识库搜索 <50ms / 图谱渲染 <1s for 200 nodes

### (6) 性能监控模块测试 — ✅ 已完成

- `tests/test-performance-monitor.js`: 32 个 `it()` 用例（≥20 达标）
- 覆盖: 构造/配置(6) + 计时器操作(7) + 指标统计(5) + 阈值告警(4) + 快照与导出(4) + 常量验证(2) + 百分位计算(3) + 全局单例(1)
- 测试质量良好，边界场景覆盖合理

---

## 跨文件一致性问题

| # | 文件 | 问题 | 严重度 |
|---|------|------|--------|
| 1 | `knowledge-base-crud.js:320` | `getEntriesCursorPaged` 回退 `indexName='updatedAt'` 但该索引不存在 | 🔴 高 — 运行时崩溃 |
| 2 | `knowledge-base-core.js:87` | 复合索引 `(type+updatedAt)` 实际使用字段 `category` 而非 `type` | 🟡 中 — 命名误导 |
| 3 | `bookmark-visualizer.js:67` | `_dirtyNodes` 声明但从未使用（死代码） | 🟡 中 — ESLint no-unused-vars |
| 4 | `bookmark-visualizer.js` | 性能监控模块未集成到任何业务代码 | 🟡 中 — 功能孤立 |
| 5 | `lib/` 全局 | `performance-monitor.js` 未被任何其他 lib 模块 import | 🟡 中 — 模块孤岛 |

---

## 测试覆盖缺口

| 新增功能 | 测试状态 | 缺失测试 |
|----------|----------|----------|
| `performance-monitor.js` | ✅ 32 用例 | — |
| `getEntriesCursorPaged()` | ❌ 无测试 | cursor 分页、category 过滤、updatedAfter 过滤、空数据、分页边界 |
| 复合索引 `type_updatedAt` | ❌ 无测试 | 索引创建、升级路径、查询使用复合索引 |
| 图谱降级模式 (>500 节点) | ❌ 无测试 | 降级激活、帧率跳过、标签隐藏、恢复正常 |
| `_dirtyNodes` 脏区域 | ❌ 无测试 | （实现未完成，无可测代码） |

---

## 文档同步状态

| 文档 | 预期变更 | 实际状态 |
|------|----------|----------|
| `docs/TODO.md` | R277 行改为 `- [x]` | ❌ 仍为 `- [ ]` |
| `CHANGELOG.md` | 添加 R277 条目到对应版本区段 | ❌ 无任何 R277 相关内容 |
| `docs/reports/performance-baseline.md` | 新建文件记录性能基线 | ❌ 文件不存在 |
| `docs/reports/2026-05-25-R10.md` | 迭代报告反映 R277 | ❌ 报告内容为 R276 的数据 |

---

## 安全质量

| 检查项 | 结果 |
|--------|------|
| 硬编码密钥 | ✅ 无 |
| XSS 风险 | ✅ 无（IndexedDB 纯数据操作） |
| 注入攻击 | ✅ 无（IDBKeyRange 参数化） |
| 权限提升 | ✅ 无 |
| 敏感数据泄露 | ✅ 无（performance-monitor 仅记录耗时） |

---

## 返工任务清单

### P0 — 阻塞发布（必须修复）

| # | 任务 | 说明 | 涉及文件 |
|---|------|------|----------|
| 1 | **修复 `updatedAt` 索引缺失** | `getEntriesCursorPaged` 在无 category 时回退到 `indexName='updatedAt'`，但 DB schema 未创建该索引。需在 `onupgradeneeded` v3 路径中添加 `store.createIndex('updatedAt', 'updatedAt', { unique: false })`，或修改回退逻辑使用 `createdAt` | `knowledge-base-core.js` |
| 2 | **Service-worker AI 缓存 LRU** | R277 明确要求 "service-worker 中 AI 响应缓存增加 LRU 淘汰（上限 200 条）"，当前未实现 | `background/service-worker.js` |
| 3 | **SidePanel 关闭释放引用** | R277 明确要求 "关闭 SidePanel 时释放 Canvas/DOM 引用"，当前未实现 | `sidebar/sidebar.js` |

### P1 — 应修复（功能完整性）

| # | 任务 | 说明 | 涉及文件 |
|---|------|------|----------|
| 4 | **性能基线文档** | 创建 `docs/reports/performance-baseline.md`，记录 SidePanel 打开 <300ms / 知识库搜索 <50ms / 图谱渲染 <1s for 200 nodes 基线指标 | 新建文件 |
| 5 | **脏区域检测实现或移除** | `_dirtyNodes` 仅声明未使用，要么实现完整的脏区域增量渲染，要么移除死代码避免 lint 警告 | `bookmark-visualizer.js` |
| 6 | **PerformanceMonitor 集成** | 监控模块创建后未被任何业务代码使用，需在 sidepanel / knowledge-base / ai-client 中实际集成 `start/end` 调用 | 多个文件 |
| 7 | **补全 CRUD 测试** | 为 `getEntriesCursorPaged` 补充单元测试（cursor 分页、category 过滤、索引选择、空数据、边界） | 新建测试文件 |
| 8 | **补全图谱降级测试** | 为 >500 节点降级策略补充测试（降级激活、帧率跳过、标签隐藏条件、destroy 清理） | 测试文件 |

### P2 — 文档同步

| # | 任务 | 说明 |
|---|------|------|
| 9 | TODO.md R277 行改为 `- [x]` | 标记任务完成 |
| 10 | CHANGELOG.md 补充 R277 条目 | 记录性能监控模块、图谱降级、索引优化等变更 |
| 11 | 迭代报告 R10 更新 | 反映 R277 实际变更（当前报告内容为 R276） |

---

## 总结

R277 迭代实现了约 **40%** 的需求。新增的 `performance-monitor.js` 模块和 32 个测试质量良好，IndexedDB 游标分页查询设计合理，图谱降级策略方向正确。但存在 **3 项关键交付完全缺失**（service-worker LRU 缓存、SidePanel Canvas 释放、性能基线文档），**1 个高风险 bug**（`updatedAt` 索引不存在导致运行时崩溃），以及 **脏区域检测为空壳实现**。

**判定: ❌ 需返工**，完成 P0 和 P1 任务后方可标记 R277 完成。
