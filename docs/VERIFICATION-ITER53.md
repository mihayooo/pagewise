# VERIFICATION.md — Iteration #53 Review

> **R211: 真实 Chrome 环境 E2E 验证 (RealChromeE2E)**
> 审核日期: 2026-05-20 | 审核人: Guard Agent

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | 基础框架搭建完成，但核心 E2E 流程（选中即问→AI 回答→知识库存储→搜索检索）未实现；CI 集成缺失；4 个验收标准(AC)未满足 |
| 代码质量 | ⚠️ | 测试代码结构清晰、helper 设计合理，但存在测试运行器配置矛盾（Playwright config vs node:test）和未使用 `@playwright/test` 的问题 |
| 测试覆盖 | ⚠️ | 42 个测试用例覆盖了 DOM 结构验证和 API 可用性检查，但缺少真实交互流程测试（content script 注入、AI 响应渲染、IndexedDB 持久化、图谱渲染验证） |
| 文档同步 | ❌ | 无 CHANGELOG.md 更新、无 npm script 配置、无 README.md、无 CI job。需求文档(REQUIREMENTS-ITER53.md)编写详尽 |

---

## 发现的问题

### 🔴 P0 — 严重缺失（阻塞发布）

#### 1. 核心 E2E 流程未实现
**影响**: AC-2 核心用户流程验证未达标

需求文档要求验证完整链路: "选中文字提问 → AI 回答渲染 → 知识库存储 → 搜索检索"。实际测试仅验证了 DOM 元素存在性（按钮、输入框、面板），未测试任何真实交互流程：

| 需求编号 | 需求描述 | 实现状态 |
|---------|---------|---------|
| E2E-05 | 选中文字 → 浮动工具栏出现 | ❌ 缺失 |
| E2E-06 | 提问 → mock AI 响应 → 回答渲染 | ❌ 缺失 |
| E2E-07 | 知识条目写入 IndexedDB | ❌ 缺失 |
| E2E-08 | 知识面板搜索返回结果 | ❌ 缺失 |
| E2E-10 | 图谱 Canvas 渲染 ≥5 节点 | ❌ 缺失 |
| E2E-12 | 标签编辑 → 保存 → 持久化 | ❌ 缺失 |

**根因**: 未实现 `page.route()` 拦截 AI API 调用、未预置 IndexedDB 测试数据、未验证 content script 注入。

#### 2. CI 集成完全缺失
**影响**: AC-6 验收标准 0/5 达成

- `.github/workflows/ci.yml` 未添加 `chrome-e2e` job
- 无 GitHub Actions headless Chrome 运行配置
- 无测试结果 artifact 上传
- 无超时控制（5 分钟限制）

#### 3. CHANGELOG.md 未更新
**影响**: 文档同步要求

R211 为 Complex 级别迭代，但 CHANGELOG.md 无对应条目。

#### 4. npm script `test:chrome` 未配置
**影响**: AC-1 验收标准未达标

package.json 中无 `"test:chrome"` 脚本，`npm run test:chrome` 不可用。用户必须手动运行 `./scripts/run-chrome-e2e.sh` 或 `node --test tests/e2e-chrome/test-*.js`。

### 🟡 P1 — 设计偏差

#### 5. 依赖选型偏离需求规范
**影响**: 与 REQUIREMENTS-ITER53.md 不一致

| 需求规范 | 实际实现 | 问题 |
|---------|---------|------|
| `@playwright/test` ^1.50 | `playwright` ^1.60.0 | `@playwright/test` 提供测试运行器、reporter、retry、sharding，而 `playwright` 仅是浏览器自动化库 |
| Playwright Test 运行器 | `node --test` | 无法利用 Playwright 的 auto-retry、trace 录制、screenshot-on-failure |
| `tests/e2e-chrome/playwright.config.js` | 根目录 `playwright.config.js` | 配置文件路径不匹配需求；且当前配置为 Playwright Test 格式，但实际未使用 Playwright Test |

#### 6. 目录结构偏离需求规范
**影响**: 文件组织不一致

| 需求规范 | 实际实现 |
|---------|---------|
| `tests/e2e-chrome/helpers/launch.js` | `tests/e2e-chrome/helpers.js`（单文件） |
| `tests/e2e-chrome/helpers/panel.js` | 合并到 helpers.js |
| `tests/e2e-chrome/fixtures/` | ❌ 缺失（无 ai-mock-responses.json、test-page.html、bookmark-fixtures.json） |
| `tests/e2e-chrome/global-setup.js` | ❌ 缺失 |
| `tests/e2e-chrome/README.md` | ❌ 缺失 |
| `tests/e2e-chrome/results/perf-baseline.json` | ❌ 缺失（AC-5 要求性能数据输出） |

#### 7. `playwright.config.js` 实际未使用
**影响**: 冗余配置文件

Playwright Test 配置定义了 `testDir`、`testMatch`、`projects` 等，但由于测试使用 `node:test` 而非 Playwright Test 运行器，该配置文件不会被任何命令消费。当前 `scripts/run-chrome-e2e.sh` 使用 `node --test` 运行测试。

#### 8. helper 函数签名偏离 AC-1 规范
**影响**: 与需求文档接口不一致

AC-1 要求 `launchExtension()` 返回 `{ browser, extensionId, backgroundWorker, sidePanel }`。实际 `launchChromeWithExtension()` 返回 `{ context, extensionId, cleanup }`。虽然功能等价（context 包含 browser + serviceWorkers），但接口名称和结构均不同。

### 🟢 P2 — 次要问题

#### 9. `assertWithinBudget` 仅警告不失败
**影响**: 性能基准可能被忽视

`helpers.js:141-151` 中 `assertWithinBudget()` 在超预算时仅 `console.warn`，只有超出 2 倍预算才抛 Error。AC-5 要求 SidePanel <500ms、100 书签图谱 <1s 作为硬约束。建议默认行为为失败（throw），增加 `warnOnly` 选项。

#### 10. `openSidePanel` 使用固定 `waitForTimeout(500)`
**影响**: 测试速度和可靠性

```js
// helpers.js:101
await page.waitForTimeout(500);
```
违反需求文档原则 "避免不必要的 `waitForTimeout`；利用 Playwright auto-wait"。应改为等待特定 DOM 状态或网络空闲。

#### 11. 每个测试独立打开/关闭 SidePanel
**影响**: 测试执行速度

42 个测试中大部分在 `try/finally` 中打开新页面、验证后关闭。每个 `openSidePanel()` 调用都伴随 500ms 的固定等待。可考虑按 describe block 共享页面，仅在需要隔离时创建新页面。

#### 12. `performance.memory` 不可靠
**影响**: test-performance.js 堆大小测试

`performance.memory` 仅在 Chrome 的 `--enable-precise-memory-info` flag 下可用，headless 模式可能返回 0。当前代码有 fallback（跳过检查），但测试结果不稳定。

---

## 功能覆盖矩阵

### AC-1: Chrome E2E 测试框架建立 (3/6)

| 子项 | 状态 | 说明 |
|------|------|------|
| `tests/e2e-chrome/` 目录创建 | ✅ | 含 helpers.js + 5 个测试文件 |
| Playwright 引入 | ⚠️ | 引入了 `playwright` 而非 `@playwright/test` |
| `launchExtension()` 辅助函数 | ⚠️ | 实现为 `launchChromeWithExtension()`，签名不同 |
| 等待工具函数 | ✅ | `openSidePanel`, `waitForPanel` 等 |
| npm script `test:chrome` | ❌ | 未添加 |
| `npm run test:chrome` 一键运行 | ❌ | 无 npm script，需手动执行 shell 脚本 |

### AC-2: 核心用户流程验证 (1/6)

| 子项 | 状态 | 说明 |
|------|------|------|
| SidePanel 打开渲染 | ✅ | 验证 #app、标题、标签按钮 |
| 选中文字 → 浮动工具栏 | ❌ | 未实现 |
| AI API mock 响应 → 回答渲染 | ❌ | 未实现 |
| 知识条目写入 IndexedDB | ❌ | 未实现 |
| 知识面板搜索 | ⚠️ | 验证搜索框存在，未验证实际搜索结果 |
| 全链路集成测试 | ❌ | 未实现 |

### AC-3: 书签流程验证 (1/4)

| 子项 | 状态 | 说明 |
|------|------|------|
| 书签面板 UI 元素验证 | ✅ | 7 个测试覆盖搜索框、刷新按钮、详情面板、ARIA |
| 图谱 Canvas 渲染 | ❌ | 未验证 canvas 实际渲染节点数 |
| 点击节点 → 详情面板弹出 | ❌ | 未实现 |
| 标签编辑 → 保存 → 持久化 | ❌ | 未实现 |

### AC-4: 权限与 SW 生命周期验证 (4/5)

| 子项 | 状态 | 说明 |
|------|------|------|
| SW 注册成功 | ✅ | 验证 serviceWorkers() 非空 |
| SW idle → active 唤醒 | ❌ | 仅检查当前状态，未测试休眠唤醒 |
| storage API 读写 | ✅ | local/sync/batch/onChanged 共 5 个测试 |
| tabs API | ✅ | query active + all 共 2 个测试 |
| Content Script 注入 | ❌ | 未验证 `window.__PAGEWISE_INJECTED__` |

### AC-5: 性能基准验证 (1/4)

| 子项 | 状态 | 说明 |
|------|------|------|
| SidePanel 首屏 <500ms | ✅ | 3 次平均验证 |
| 100 书签图谱 <1s | ❌ | 未实现 |
| 搜索 100 条 <200ms | ❌ | 未实现 |
| 性能数据输出 JSON | ❌ | 无 perf-baseline.json 输出 |

### AC-6: CI 集成 (0/5)

| 子项 | 状态 | 说明 |
|------|------|------|
| chrome-e2e job | ❌ | 未添加 |
| ubuntu-latest + headless | ❌ | — |
| 失败阻断合并 | ❌ | — |
| artifact 上传 | ❌ | — |
| <5 分钟超时 | ❌ | — |

**总计: AC 达成率 9/30 (30%)**

---

## 测试统计

| 文件 | 测试数 | 类型 | 覆盖 |
|------|--------|------|------|
| test-sidebar-core.js | 11 | DOM 结构 + 面板切换 | SidePanel 基础 UI |
| test-bookmarks-flow.js | 7 | DOM 结构 + ARIA | 书签面板 UI |
| test-knowledge-flow.js | 6 | DOM 结构 + 交互 | 知识面板 UI |
| test-performance.js | 6 | 性能基准 | 渲染时间、DOM 复杂度、内存 |
| test-permissions.js | 12 | API 验证 | storage、tabs、runtime、manifest |
| **合计** | **42** | | |

与需求文档预估 18 个用例对比，数量超出（42 > 18），但核心交互流程用例缺失。

---

## 现有测试影响

- **现有 7,088 测试**: 本次变更仅新增 `devDependencies`（playwright），未修改任何源代码或现有测试文件，应无影响
- **`npm run test`**: 默认 glob `'tests/*.js'` 不匹配 `tests/e2e-chrome/` 子目录文件，不受影响
- **`npm run test:ci`**: 排除模式 `-not -path 'tests/e2e/*'` 不覆盖 `tests/e2e-chrome/`，需确认是否应排除

> ⚠️ **注意**: `npm run test:ci` 的排除模式 `-not -path 'tests/e2e/*'` 不匹配 `tests/e2e-chrome/`（这是不同的路径）。如果 CI 执行 `npm run test:ci`，新 E2E 测试文件可能被意外纳入，导致 CI 失败（无 Chrome 环境）。需要添加排除规则 `-not -path 'tests/e2e-chrome/*'`。

---

## 安全审查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 硬编码密钥 | ✅ | 无硬编码 API key，AI mock 通过 `page.route()` 拦截（未来实现时） |
| XSS 风险 | ✅ | 测试仅使用 `$eval` 读取属性，无 `innerHTML` 注入 |
| 敏感数据泄露 | ✅ | 测试数据使用 `_e2e_` 前缀，cleanup 中移除 |
| Chrome profile 安全 | ✅ | `.chrome-profile-r211` 目录在 before/after 中创建和清理 |

---

## 返工任务清单

### 🔴 必须修复（阻塞迭代完成）

| # | 任务 | 预估 | 对应 AC |
|---|------|------|---------|
| R1 | 在 `package.json` 添加 `"test:chrome": "node --test --test-concurrency=1 --test-timeout=60000 'tests/e2e-chrome/test-*.js'"` | 5min | AC-1 |
| R2 | 实现 content script 注入验证测试：导航到测试页面 → 等待注入 → 检查 `window.__PAGEWISE_INJECTED__` | 1h | AC-2, AC-4 |
| R3 | 实现 "选中文字 → 浮动工具栏出现" 测试：`page.evaluate(() => getSelection())` → 触发 selectionchange → 验证 toolbar DOM | 1h | AC-2 |
| R4 | 实现 AI 响应 mock（`page.route()` 拦截 API endpoint）+ 发送问题 → 验证回答渲染到消息列表 | 2h | AC-2 |
| R5 | 实现知识库存储验证：AI 回答后 → `page.evaluate()` 查询 IndexedDB → 验证条目存在 | 1h | AC-2 |
| R6 | 实现知识面板搜索结果验证：预置数据 → 搜索 → 验证结果列表非空 | 1h | AC-2 |
| R7 | 在 `.github/workflows/ci.yml` 添加 `chrome-e2e` job | 30min | AC-6 |
| R8 | 更新 CHANGELOG.md 添加 R211 条目 | 10min | 文档 |

### 🟡 应当修复（提升质量）

| # | 任务 | 预估 | 说明 |
|---|------|------|------|
| R9 | 修正 `npm run test:ci` 排除模式，添加 `-not -path 'tests/e2e-chrome/*'` | 5min | 防止 CI 意外运行 E2E 测试 |
| R10 | 考虑替换 `playwright` → `@playwright/test`，或明确选择 `node:test` 路线并删除根目录 `playwright.config.js` | 30min | 消除配置冗余 |
| R11 | 将 `assertWithinBudget` 默认改为失败（throw），超 2 倍为 hard fail | 15min | 性能基准应为硬约束 |
| R12 | 移除 `openSidePanel` 中的 `waitForTimeout(500)`，改用 `waitForLoadState('networkidle')` 或等待特定元素 | 15min | 测试可靠性 |
| R13 | 添加 `tests/e2e-chrome/README.md` 运行说明 | 15min | 可维护性 |
| R14 | 实现 100 书签图谱渲染性能测试（AC-5） | 1h | AC-5 |

### 🟢 可选改进

| # | 任务 | 说明 |
|---|------|------|
| R15 | 按 describe block 共享页面，减少重复的 open/close 开销 | 测试速度优化 |
| R16 | 添加 fixtures/ 目录（ai-mock-responses.json、test-page.html、bookmark-fixtures.json） | 可维护性 |
| R17 | 输出 perf-baseline.json 到 `tests/e2e-chrome/results/` | AC-5 要求 |
| R18 | 在 .gitignore 中添加 `tests/e2e-chrome/results/` 和 `.chrome-profile-r211/` | 清理 |

---

## 总结

R211 迭代完成了 Chrome E2E 测试**基础设施**的搭建（Playwright 集成、浏览器启动 helper、42 个基础验证测试），但距离需求目标仍有较大差距：

- **框架层**: ✅ 可用（launchChromeWithExtension + helpers + 5 个测试文件）
- **DOM 验证层**: ✅ 覆盖良好（SidePanel、书签面板、知识面板、权限 API）
- **交互流程层**: ❌ 完全缺失（选中即问、AI 响应、知识存储、搜索检索、图谱渲染）
- **CI 层**: ❌ 完全缺失
- **文档层**: ❌ 大部分缺失

**建议**: 本迭代标记为 **条件通过**，需要完成 R1-R8 返工任务后方可关闭。核心交互流程（R2-R6）是本迭代的核心价值，不可降级。
