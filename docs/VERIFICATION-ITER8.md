# VERIFICATION.md — Iteration #8 Review

> 审查日期: 2026-05-20
> 审查任务: R172: 离线内容缓存 OfflineContentCache
> 审查范围: Git 工作区变更（含 staged + unstaged）

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | **核心功能完全未实现** — `lib/bookmark-offline-cache.js` 不存在，7 项验收标准 AC-1~AC-7 全部未交付 |
| 代码质量 | ❌ | 仅有文档变更；暂存的 lint 修复引入新 bug（`swiping` 重命名为 `_swiping` 但引用未同步） |
| 测试覆盖 | ❌ | 0 个测试用例（要求 ≥25），无 `tests/test-bookmark-offline-cache.js` |
| 文档同步 | ⚠️ | REQUIREMENTS-ITER8.md 已更新为 R172 需求规格，TODO.md 已添加 R172-R176 Phase U 任务；但 CHANGELOG.md 未更新 R172 条目 |

**总评: ❌ 不通过 — 需全面返工**

---

## 详细发现

### 1. 功能完整性 — ❌ 核心功能缺失

任务要求新建 `lib/bookmark-offline-cache.js` 并实现 `BookmarkOfflineCache` 类，包含 12 个方法。实际交付中 **该文件完全不存在**：

| 验收标准 | 要求 | 实际状态 |
|----------|------|----------|
| AC-1 正文提取与持久化 | IndexedDB `offline-cache` objectStore + Readability 提取 | ❌ 未实现 |
| AC-2 离线全文检索 | 同步 TF-IDF 索引到 `BookmarkSemanticSearch` | ❌ 未实现 |
| AC-3 LRU 淘汰与用量管理 | 500 篇硬上限 + `getStorageUsage()` + 按域名/时间清除 | ❌ 未实现 |
| AC-4 自动后台缓存 | 事件监听 + `BookmarkPerformanceOptimizer` 分批处理 | ❌ 未实现 |
| AC-5 缓存状态 UI | 详情面板缓存状态标记 + 手动缓存按钮 | ❌ 未实现 |
| AC-6 导出集成 | `exportJSON()` 增加 `offlineContent` 字段 | ❌ 未实现 |
| AC-7 测试覆盖 | ≥25 测试用例 | ❌ 0 用例 |

**交付物仅有：**
- `docs/REQUIREMENTS-ITER8.md` — 需求规格文档（Plan Agent 输出）
- `docs/TODO.md` — 任务列表更新（添加 Phase U: R172-R176）

这表明迭代在 Phase 1（需求分析）即停止，Phase 2~5（设计→实现→验证→回顾）全部未执行。

### 2. 暂存的 lint 修复（R171 遗留）— ⚠️ 引入新 bug

当前 staged changes 包含 R171 迭代收尾的 lint 修复（7 个文件，主要是未使用变量添加 `_` 前缀），**但这些不属于 R172 任务范围**，且存在以下问题：

#### 2.1 `sidebar/sidebar.js` — `_swiping` 重命名不完整 ❌

```javascript
// 第 6169 行：声明已重命名
let _swiping = false;

// 第 6174 行：引用未同步（仍为 swiping）— 触发 no-undef warning
swiping = false;

// 第 6182 行：引用未同步（仍为 swiping）— 触发 no-undef warning  
swiping = true;
```

**影响：** 这个 lint "修复" 实际上制造了 2 个新的 `no-undef` 警告（当前 `npm run test:ci` 已有 1 个 test-lint 失败与此相关）。正确的修复应该是将第 6174、6182 行的 `swiping` 也改为 `_swiping`，或者评估 `swiping` 变量是否有实际用途（观察代码逻辑，`_swiping` 似乎用于 touch 手势滑动状态追踪，应当保留并消除 `_` 前缀或同步所有引用）。

#### 2.2 `sidebar/sidebar.js` — `const _app = new SidebarApp()` ❌

```javascript
// 第 7705 行：将 app 重命名为 _app
const _app = new SidebarApp();
```

这会导致 `SidebarApp` 实例化后的应用完全不会启动。`new SidebarApp()` 构造函数通常会绑定事件监听器和初始化 UI。将变量标记为 `_` 前缀（暗示未使用）掩盖了副作用调用的意图。正确做法是保留 `const app = new SidebarApp();` 并用 `/* eslint-disable-line */` 注释抑制警告，或在 `.eslintrc` 中配置 `no-unused-vars` 的 `varsIgnorePattern`。

#### 2.3 其他 lint 修复 — ✅ 合理

| 文件 | 变更 | 评估 |
|------|------|------|
| `lib/ai-client-context-methods.js` | `model` → `_model`（2 处解构） | ✅ 合理，变量未使用 |
| `lib/bookmark-highlight-archive.js` | `!= null` → `!== null && !== undefined` | ✅ 合理，修复 lint 建议 |
| `lib/bookmark-sharing.js` | 移除 `eslint-disable-line` 注释 | ✅ 合理 |
| `lib/bookmark-spaced-repetition.js` | 移除 `initializeReviewData` 导入 | ✅ 合理，文件内未使用该函数 |
| `lib/wiki-query-prompts.js` | `[id, p]` → `[, p]`（2 处） | ✅ 合理，忽略未使用的 key |
| `options/options.js` | `aiGatewaySection` → `_aiGatewaySection`、`gateway` → `_gateway` | ✅ 合理 |

### 3. 测试覆盖 — ❌ 完全缺失

- **要求：** ≥25 个单元测试用例
- **实际：** 0 个用例
- **原因：** 实现文件不存在，自然无法有测试

当前测试套件状态：6326 tests, 6325 pass, 1 fail（lint test，R171 遗留问题）。

### 4. 文档同步 — ⚠️ 部分完成

| 文档 | 状态 | 说明 |
|------|------|------|
| `docs/REQUIREMENTS-ITER8.md` | ✅ 已更新 | 完整的需求规格，含用户故事、验收标准、技术约束、风险分析，质量良好 |
| `docs/TODO.md` | ✅ 已更新 | Phase U 任务列表已添加（R172-R176），R171 标记为已完成 |
| `docs/CHANGELOG.md` | ❌ 未更新 | 无 R172 相关条目（因为功能未实现，此问题可推迟到实现后） |
| `docs/DESIGN-ITER8.md` | ❌ 不存在 | Phase 2 设计文档缺失 |
| `docs/VERIFICATION-ITER8.md` | ✅ 本文档 | 审查报告 |
| 迭代报告 | ❌ 未生成 | 无 `docs/reports/2026-05-20-R8.md` |

### 5. 安全质量 — N/A

因功能代码未实现，无法评估安全质量。需求文档中已识别技术约束：
- 内存安全：单条 textContent 上限 100,000 字符 ✅ 已在需求中规划
- 不阻塞 UI：分批 + requestIdleCallback ✅ 已在需求中规划
- 权限：无需新增 permissions ✅ 已在需求中规划

### 6. 依赖模块存在性检查

| 依赖模块 | 状态 | 说明 |
|----------|------|------|
| `lib/bookmark-semantic-search.js` | ✅ 存在 | 7,471 字节 |
| `lib/bookmark-performance.js` | ✅ 存在 | 13,337 字节 |
| `lib/bookmark-io.js` | ✅ 存在 | 7,684 字节 |
| `lib/bookmark-status.js` | ✅ 存在 | 4,100 字节（需求文档中引用为 `bookmark-status-tracker.js`，实际文件名为 `bookmark-status.js`，需在实现时确认 API） |
| `lib/bookmark-detail-panel.js` | ✅ 存在 | 10,682 字节 |

注意：需求文档 AC-5 提到"书签详情面板展示缓存状态"需修改 `bookmark-detail-panel.js`，该文件存在但未被修改。

---

## 发现的问题

### P0 — 阻断性问题（必须修复）

| # | 问题 | 影响 | 修复建议 |
|---|------|------|----------|
| P0-1 | `lib/bookmark-offline-cache.js` 未创建 | R172 功能完全缺失 | 需从 Phase 2 开始重新执行完整迭代流程 |
| P0-2 | 测试文件未创建 | 无法验证功能正确性 | 实现后编写 ≥25 个测试用例 |

### P1 — 严重问题（应修复）

| # | 问题 | 影响 | 修复建议 |
|---|------|------|----------|
| P1-1 | `sidebar/sidebar.js` `_swiping` 重命名不完整 | 引入 2 个 `no-undef` 错误 | 同步修改第 6174、6182 行引用 |
| P1-2 | `sidebar/sidebar.js` `const _app = new SidebarApp()` | 应用可能无法正常启动 | 保留原变量名或确认构造函数为纯副作用 |

### P2 — 一般问题（建议修复）

| # | 问题 | 影响 | 修复建议 |
|---|------|------|----------|
| P2-1 | 需求文档中引用 `bookmark-status-tracker.js`，实际文件名为 `bookmark-status.js` | 实现时可能出现导入错误 | 在实现前修正需求文档或确认模块名称 |
| P2-2 | DESIGN-ITER8.md 缺失 | 飞轮迭代 Phase 2 未执行 | 补充设计文档 |

---

## 返工任务清单

> 以下任务按优先级排序，需全部完成后方可标记 R172 为已完成

### 阶段 A: 修复先行存在的 lint 问题（R171 收尾）

- [ ] **A1**: 修复 `sidebar/sidebar.js` 第 6174、6182 行 `swiping` 引用 → `_swiping`（或还原声明为 `swiping` 并添加 eslint-disable）
- [ ] **A2**: 评估 `sidebar/sidebar.js` 第 7705 行 `const _app = new SidebarApp()` — 若 `SidebarApp` 构造函数有副作用（初始化 UI、绑定事件），需还原为 `const app`
- [ ] **A3**: 暂存所有 R171 lint 修复并提交
- [ ] **A4**: 运行 `npm run test:ci` 确认 0 fail（当前 1 fail: test-lint-r159）

### 阶段 B: R172 核心实现

- [ ] **B1**: Phase 2 — 编写 `docs/DESIGN-ITER8.md`（模块接口设计、IndexedDB schema、集成方案）
- [ ] **B2**: 创建 `lib/bookmark-offline-cache.js`，实现 `BookmarkOfflineCache` 类：
  - [ ] B2.1: IndexedDB 初始化与 `offline-cache` objectStore
  - [ ] B2.2: `_extractContent(url)` — Readability 正文提取
  - [ ] B2.3: `cache(url)` — 提取并缓存
  - [ ] B2.4: `getCached(url)` — 读取缓存 + 更新 lastAccessedAt
  - [ ] B2.5: `isCached(url)` — 状态查询（cached/expired/missing）
  - [ ] B2.6: `removeCached(url)` — 删除缓存
  - [ ] B2.7: `_evictLRU()` — LRU 淘汰（500 篇上限）
  - [ ] B2.8: `batchCache(urls, options)` — 分批缓存（复用 BookmarkPerformanceOptimizer）
  - [ ] B2.9: `clearByDomain(domain)` — 按域名清除
  - [ ] B2.10: `clearByDateRange(from, to)` — 按时间范围清除
  - [ ] B2.11: `getStorageUsage()` — 存储用量统计
  - [ ] B2.12: `getCacheStats()` — 缓存统计
  - [ ] B2.13: `_syncToSearchIndex(cachedItem)` — 同步 TF-IDF 索引
- [ ] **B3**: 修改 `lib/bookmark-io.js` — `exportJSON()` 增加 `offlineContent` 字段
- [ ] **B4**: 修改 `lib/bookmark-detail-panel.js` — 增加缓存状态标记 UI + 手动缓存按钮
- [ ] **B5**: 修改 `lib/bookmark-status.js` — 监听 read/favorite 状态变更触发自动缓存

### 阶段 C: 测试

- [ ] **C1**: 创建 `tests/test-bookmark-offline-cache.js`，包含 ≥25 个用例，覆盖：
  - IndexedDB 操作（初始化、读写、删除）
  - Readability 提取（正常页面、空页面、超长内容截断）
  - LRU 淘汰逻辑
  - 过期判定
  - 存储用量统计
  - 按域名/时间范围清除
  - 批量缓存
  - 离线搜索索引同步
  - 导出集成
  - 边界条件（null URL、重复缓存幂等、超过 100K 字符截断）
- [ ] **C2**: 运行 `npm run test:ci` — 0 fail，≥6350 pass

### 阶段 D: 收尾

- [ ] **D1**: 更新 `docs/CHANGELOG.md` — 添加 R172 变更记录
- [ ] **D2**: 更新 `docs/TODO.md` — 将 R172 标记为 `[x]`
- [ ] **D3**: 生成迭代报告 `docs/reports/2026-05-20-R8.md`
- [ ] **D4**: `npm run lint` — 0 errors, 0 warnings

---

## 测试结果汇总

| 指标 | 值 |
|------|-----|
| 总测试数 | 6326 |
| 通过 | 6325 |
| 失败 | 1 (test-lint-r159: 2 ESLint warnings) |
| 取消 | 0 |
| 跳过 | 0 |
| R172 相关测试 | 0（未创建） |

---

## 结论

**本次迭代交付物仅为需求规格文档（Phase 1），核心实现代码、测试、设计文档均缺失。** 需从 Phase 2 起重新执行完整的飞轮迭代流程。此外，前序 R171 的 lint 修复存在引入新 bug 的风险（`_swiping` / `_app`），建议在重启 R172 之前优先修复以确保基线健康。

---

*Guard Agent 审查 | 2026-05-20*
