# REQUIREMENTS — R332: SidebarPerfOpt 侧边栏启动与渲染性能优化

> 迭代: R332
> 日期: 2026-05-26
> 复杂度: Complex（跨模块性能优化 + 新基准脚本 + 虚拟滚动）
> 阶段: 飞轮迭代 R332
> 模块文件: `lib/virtual-scroll.js`, `scripts/sidepanel-perf-benchmark.js`
> 测试文件: `tests/test-virtual-scroll.js`, `tests/test-sidebar-perf.js`

---

## 1. 用户故事

作为 PageWise 用户，随着我积累了大量书签（500+）和知识条目，SidePanel 打开后需要等待较长时间才能看到书签列表，搜索框输入后也需要数秒才能返回结果，图谱页面首次打开更是严重卡顿。我希望 SidePanel 在大数据量下依然保持"秒开"体验——首屏半秒内可交互、搜索实时响应、图谱按需加载不拖慢首屏。

**问题诊断**（基于现有代码分析）：
- `sidebar.js`（7705 行）在 `init()` 中同步加载全部书签到内存（`this._bookmarks = []`），书签 >500 项时 IndexedDB 全量读取阻塞主线程
- `BookmarkSearch` 初始化时构建倒排索引 + 图谱引擎，首次搜索前未预热
- 力导向布局（`forceDirectedLayout`，默认 50 次迭代）在打开 SidePanel 时即触发，即使用户不查看图谱
- `createVirtualScroller`（`lib/bookmark-performance-opt.js`）已有基础实现但未被 SidePanel 集成使用
- `PerformanceMonitor`（`lib/performance-monitor.js`）已有 `SIDEPANEL_RENDER` 指标采集能力，但缺少自动化基准脚本

---

## 2. 验收标准

### AC1: 性能基线测量脚本
- 新建 `scripts/sidepanel-perf-benchmark.js`，Node.js 可执行脚本
- 测量以下三项关键指标：
  - **首屏渲染时间**：从数据读取开始 → 首批书签列表可交互（模拟 DOM 渲染完成）
  - **搜索响应时间**：输入查询 → 返回结果（含索引查找 + 排序）
  - **图谱渲染时间**：触发图谱计算 → 节点/边数据就绪（力导向布局完成）
- 生成模拟书签数据集（100 / 500 / 1000 条三档）
- 输出 JSON 基线报告结构：
  ```json
  {
    "timestamp": "2026-05-26T12:00:00Z",
    "environment": "node",
    "datasets": {
      "100": { "firstScreen": { "avg", "p50", "p95" }, "search": {...}, "graph": {...} },
      "500": {...},
      "1000": {...}
    }
  }
  ```
- 复用现有 `PerformanceProfiler`（`lib/performance-profiler.js`）的 `measure` / `getReport` 方法，不重新造轮子
- 脚本可独立运行：`node scripts/sidepanel-perf-benchmark.js`，不依赖浏览器环境

### AC2: 虚拟滚动模块
- 新建 `lib/virtual-scroll.js` 纯逻辑模块，提供独立于 DOM 的虚拟滚动计算引擎
- 核心 API：
  - `createVirtualList(options)` → 返回虚拟列表实例
  - `getVisibleRange(scrollTop, containerHeight, totalItems, itemHeight, overscan)` → `{ startIndex, endIndex, offsetY, totalHeight }`
  - `shouldEnableVirtualization(itemCount, threshold)` → 当 `itemCount > threshold` 时返回 `true`（默认 threshold = 100）
- `overscan` 默认值：上下各 5 项缓冲（与任务描述一致）
- 支持固定高度和动态高度两种模式：
  - 固定高度：统一 `itemHeight`（px），计算 O(1)
  - 动态高度：接受 `getItemHeight(index)` 回调，维护高度缓存 Map
- **纯逻辑**：不直接操作 DOM，不依赖 `document` / `window`，与 `knowledge-panel-virtual.js` 职责分离
- 区别于现有 `createVirtualScroller`（`lib/bookmark-performance-opt.js`）：新模块为更通用的独立计算层，旧函数可逐步迁移至新模块

### AC3: 图谱懒加载
- SidePanel 打开时**不**触发 `forceDirectedLayout` 计算
- 仅当用户切换到"图谱"标签页（`_bookmarkSubTab === 'cluster'` 或图谱视图）后，首次触发力导向布局
- 计算完成后缓存结果，后续切换回图谱标签页直接使用缓存（不重复计算）
- 新增数据变更时（书签增删改）标记缓存为 `dirty`，下次进入图谱时重新计算
- 不修改 `knowledge-graph-layout.js` 的 `forceDirectedLayout` 函数本身，仅在调用层控制触发时机

### AC4: 搜索防抖 + 索引预热
- 搜索输入 300ms 防抖（现有 `utils.js` 已有 `debounce` 工具函数，直接复用）
- **索引预热**：SidePanel 启动完成首屏渲染后，在空闲时段（`requestIdleCallback` 或 1 秒延迟后）后台预加载倒排索引至内存 Map
- 预热使用现有 `buildSearchIndex`（`lib/bookmark-performance-opt.js`），不在内存中重复构建
- 预热期间用户仍可正常操作，预热完成后首次搜索命中内存索引，响应 < 100ms
- 若用户在预热完成前发起搜索，退化为现有搜索路径（`BookmarkSearch`），不阻塞不报错
- 现有 `getSearchSuggestionsDebounced`（`lib/bookmark-search-suggest.js`）已有 200ms 防抖，本次需求统一为 300ms

### AC5: 分页读取减少 IO 阻塞
- SidePanel 启动时 IndexedDB 书签读取改为分页方式：
  - 首次读取 50 条（足以填满首屏可视区域）
  - 用户滚动到底部时自动加载下一批 50 条
  - 全部加载完成后停止分页
- 复用现有 `lazyLoadBookmarks`（`lib/bookmark-performance-opt.js`）的分页逻辑，适配 IndexedDB cursor 分页读取（不一次性 getAll）
- 加载过程中显示骨架屏或加载指示器（`isLoadingMore` 状态已有定义，复用 `this._isLoadingMore`）
- 加载出错时显示重试提示，不静默失败

### AC6: 性能目标达成
- **首屏渲染 < 500ms**（书签 < 1000 条时）：从 SidePanel HTML 加载完成 → 首批书签列表可交互
- **搜索响应 < 100ms**（索引预热完成后）：用户输入完成（防抖后）→ 搜索结果渲染
- **图谱首开 < 2s**（书签 < 1000 条时）：切换到图谱标签页 → 力导向布局完成
- 以上指标由 AC1 基准脚本验证，`npm run test:ci` 中新增性能断言

### AC7: 完整测试覆盖
- 测试框架: `node:test` + `node:assert/strict`（与项目一致）
- 测试用例 ≥ 20 个，覆盖以下场景：
  - 虚拟滚动计算：可见范围正确性、overscan 缓冲、空列表/单元素/大量元素、动态高度、shouldEnableVirtualization 阈值
  - 搜索防抖：300ms 延迟确认、连续输入只触发一次、防抖取消
  - 索引预热：预热后索引可用、预热期间搜索不报错退化
  - 分页加载：首批 50 条、滚动触发加载更多、全部加载完成停止、加载失败重试
  - 性能断言：模拟 1000 条书签首屏 < 500ms、搜索 < 100ms
  - 图谱缓存：首次计算、缓存命中、dirty 标记失效重算
- 不依赖浏览器环境，全部可在 Node.js 中运行（DOM 部分 mock 或仅测纯逻辑）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class` / `export function` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包（虚拟滚动、防抖均自行实现） |
| 不修改已有公共 API | `BookmarkSearch`、`BookmarkGraphEngine`、`PerformanceProfiler`、`PerformanceMonitor` 的公共方法签名不变 |
| 复用现有工具 | `debounce`（`utils.js`）、`buildSearchIndex`（`bookmark-performance-opt.js`）、`lazyLoadBookmarks`（`bookmark-performance-opt.js`）、`PerformanceProfiler.measure`（`performance-profiler.js`） |
| 不引入 Web Worker | 本次迭代不在 Worker 中运行计算；未来可作为 R333+ 优化方向 |
| 性能预算 | 虚拟滚动计算 < 1ms / 次；索引预热 < 500ms（1000 条书签）；分页读取首批 < 200ms |
| 内存预算 | 虚拟滚动缓存 < 10KB；索引预热内存 < 2MB（1000 条书签） |
| Chrome 扩展兼容 | SidePanel 运行在 extension 页面，可使用 `requestIdleCallback`；IndexedDB cursor API 可用 |
| 测试模式 | 与现有 `test-bookmark-performance-opt.js` 一致：Node.js 环境 + mock 数据 + `node:test` |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| BookmarkPerformanceOpt | `lib/bookmark-performance-opt.js` | ✅ 已实现 | 复用 `buildSearchIndex`、`searchWithIndex`、`lazyLoadBookmarks`、`createVirtualScroller` |
| BookmarkSearch | `lib/bookmark-search.js` | ✅ 已实现 | 退化路径使用现有搜索（预热前的兜底） |
| BookmarkGraphEngine | `lib/bookmark-graph.js` | ✅ 已实现 | 图谱数据构建，不修改其内部逻辑 |
| KnowledgeGraphLayout | `lib/knowledge-graph-layout.js` | ✅ 已实现 | `forceDirectedLayout` 函数，不修改其内部逻辑 |
| PerformanceProfiler | `lib/performance-profiler.js` | ✅ 已实现 | 基准脚本复用 `measure` / `getReport` |
| PerformanceMonitor | `lib/performance-monitor.js` | ✅ 已实现 | `METRIC_NAMES.SIDEPANEL_RENDER` 运行时指标 |
| debounce (utils) | `lib/utils.js` | ✅ 已实现 | 搜索防抖复用 `debounce` 函数 |
| KnowledgePanelVirtual | `lib/knowledge-panel-virtual.js` | ✅ 已实现 | 参考但不复用（职责不同：知识面板 vs 通用虚拟滚动） |
| SidebarApp | `sidebar/sidebar.js` | ✅ 已实现 | 集成点：修改 init 加载流程、搜索防抖、图谱懒加载 |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| SidebarApp.init() | 分页读取 IndexedDB + 首屏渲染 → 调用虚拟滚动计算 |
| SidebarApp 搜索逻辑 | 防抖 300ms → 预热索引查询 → 结果渲染 |
| SidebarApp 图谱标签页 | 切换时懒触发 `forceDirectedLayout`，缓存结果 |
| scripts/sidepanel-perf-benchmark.js | CI 可运行的性能基准，输出 JSON 报告 |
| `npm run test:ci` | 新增 ≥20 测试用例纳入 CI 管线 |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| IndexedDB cursor API | 分页读取使用 `IDBObjectStore.openCursor()` 而非 `getAll()` |
| requestIdleCallback | 索引预热的调度时机（Chrome 扩展页面原生支持） |
| performance.now() | 基准测量高精度计时（Node.js 16+ 支持） |

---

## 5. 数据流与模块交互

```
SidePanel 启动
  │
  ├─ IndexedDB 分页读取（首批 50 条）──→ 渲染首屏列表
  │     │                                   │
  │     ├─ 滚动加载更多（+50 条/次）         ├─ 虚拟滚动（>100 项时自动启用）
  │     └─ 全部加载完毕                      └─ 骨架屏 → 真实内容
  │
  ├─ requestIdleCallback ──→ 索引预热（buildSearchIndex）
  │                               │
  │                               └─ 预热完成 → 搜索走内存索引
  │
  └─ 用户输入搜索 ──→ debounce(300ms) ──→ 预热完成?
        │                                      │
        ├─ 是 → searchWithIndex(内存)           │
        └─ 否 → BookmarkSearch(退化路径)       │
                                               │
用户切换到"图谱"标签页 ──→ 缓存命中?
        │                                    │
        ├─ 是 → 直接渲染缓存数据              │
        └─ 否 → forceDirectedLayout ──→ 缓存 ──→ 渲染
```

---

## 6. 非功能需求

| 项目 | 要求 |
|------|------|
| 首屏渲染 | < 500ms（书签 < 1000 条） |
| 搜索响应 | < 100ms（索引预热完成后） |
| 图谱首开 | < 2s（书签 < 1000 条） |
| 索引预热 | < 500ms（1000 条书签） |
| 分页首批 | < 200ms（IndexedDB 读取 + 渲染） |
| 虚拟滚动 | 计算 < 1ms / 次 |
| 内存增量 | < 2MB（索引 + 虚拟滚动缓存） |
| 向后兼容 | 不修改任何已有模块的公共 API，现有功能无感知变化 |
| 降级策略 | 预热未完成时搜索走退化路径；IndexedDB 分页失败时回退全量加载 |
| 无障碍 | 虚拟滚动不破坏现有 `BookmarkAccessibility` 的键盘导航和 ARIA |

---

## 7. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/virtual-scroll.js` | **新建** | 通用虚拟滚动计算模块（纯逻辑，零 DOM 依赖） |
| `scripts/sidepanel-perf-benchmark.js` | **新建** | Node.js 性能基准脚本（三档数据集 × 三项指标） |
| `tests/test-virtual-scroll.js` | **新建** | 虚拟滚动模块单元测试（≥ 10 用例） |
| `tests/test-sidebar-perf.js` | **新建** | 性能断言 + 防抖 + 预热 + 分页集成测试（≥ 10 用例） |
| `sidebar/sidebar.js` | **修改** | 集成点：分页加载、索引预热、搜索防抖 300ms、图谱懒加载、虚拟滚动 |
| `docs/CHANGELOG.md` | **修改** | 新增 R332 条目 |
| `docs/TODO.md` | **修改** | 标记 R332 状态为 ✅ |
| `docs/REQUIREMENTS.md` | **修改** | 新增 R332 需求条目 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-26 | R332 | 初始创建 — SidebarPerfOpt 侧边栏启动与渲染性能优化需求文档 |