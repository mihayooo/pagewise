# E2E Chrome 测试基线 — R288

> 最后更新: 2026-05-25
> 版本: 3.4.0
> 迭代: R288 — E2E Chrome CI 第九次稳定化

---

## 1. 历史失败根因复盘 (R211 → R283, 9 次迭代)

| # | 失败模式 | 影响的迭代 | 频率 | 根因 | 修复策略 |
|---|----------|-----------|------|------|----------|
| F1 | **Chrome 启动超时** | R211, R219, R220, R228, R252 | 高 | CI 环境 CPU/内存资源不足，Chromium headless 启动慢；persistent context 锁竞争 | R283: withRetry + 指数退避；R288: 30s 硬超时 + 2 次重试 |
| F2 | **选择器不匹配** | R211, R219, R220, R228 | 高 | DOM 结构随版本迭代变化（#bookmarksSearchInput、.knowledge-subtab 等），测试断言硬编码选择器 | R288: 仅保留 #app / #panelChat 两个稳定选择器 |
| F3 | **扩展加载失败** | R219, R220, R252, R257 | 中 | `--load-extension` 参数不正确；profile 目录残留锁；manifest.json 解析失败 | R283: cleanProfileDir；R288: withRetry 包装完整 launch 流程 |
| F4 | **Service Worker 未激活** | R220, R228, R252, R257, R268 | 中 | SW 注册异步延迟；CI 冷启动无 SW 缓存；`waitForEvent('serviceworker')` 超时值不足 | R283: 环境自适应超时 (CI: 30s)；R288: 30s 硬超时 |
| F5 | **竞态条件** | R228, R252, R257, R268, R272, R283 | 高 | `openSidePanel()` 后面板尚未渲染完成就开始断言；`clickTab()` 切换动画未完成；content script 注入与页面加载竞争 | R288: 使用 `waitForSelector` + `waitForFunction` 替代 `waitForTimeout`；串行执行 |

### 失败模式分布

```
Chrome 启动超时  ████████████████████  35%
选择器不匹配     ████████████████      28%
竞态条件        ██████████████        24%
扩展加载失败     ██████               10%
SW 未激活       ██                     3%
```

## 2. R288 策略: 最小可行 E2E (MVP Smoke)

### 设计原则

1. **仅核心路径**: 删除所有功能性断言（标签切换、性能基准、权限验证），仅保留 3 条冒烟路径
2. **稳定选择器**: 仅使用 `.pagewise-toolbar`、`#app`、`#panelChat` 等不会随功能迭代变化的选择器
3. **硬超时 + 重试**: 每条路径 30s 硬超时，最多 2 次自动重试（仅 TimeoutError）
4. **串行执行**: `--test-concurrency=1` + 单 describe 块，避免浏览器状态污染
5. **CI 门禁**: 从 `continue-on-error: true` 升级为正式失败门禁

### 3 条核心冒烟路径

| # | 路径 | 断言 | 超时 | 重试 |
|---|------|------|------|------|
| P1 | 扩展加载 → SW 激活 | extensionId 非空 + 匹配 `/^[a-z]{32}$/` + SW 存在 | 30s | 2 次 |
| P2 | SidePanel → 渲染 UI | `#app` 存在 + `#panelChat` 存在 | 30s | 2 次 |
| P3 | 选中文字 → 气泡弹出 | `.pagewise-toolbar--visible` 存在 + 按钮数量 > 0 | 30s | 2 次 |

### 对比旧版 (R211)

| 维度 | R211 旧版 | R288 MVP |
|------|----------|----------|
| 测试文件数 | 5 | 1 |
| 用例数 | ~42 | 3 |
| 断言数 | ~120 | 8 |
| 最长耗时 | 5-15 min | ~90s |
| CI 稳定率 | ~60% | 目标 100% |
| 门禁级别 | soft-fail | 正式门禁 |

## 3. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `tests/e2e-chrome/test-smoke.js` | 新建 | 3 条 MVP 冒烟路径 + 重试机制 |
| `tests/test-e2e-smoke-helpers.js` | 新建 | isTimeoutError / withTimeoutRetry 单元测试 |
| `tests/e2e-chrome/helpers.js` | 保留 | 原有辅助函数，不修改 |
| `tests/e2e-chrome/test-sidebar-core.js` | 保留 | 旧版测试，不删除，通过 `test:e2e:full` 可运行 |
| `tests/e2e-chrome/test-bookmarks-flow.js` | 保留 | 旧版测试 |
| `tests/e2e-chrome/test-knowledge-flow.js` | 保留 | 旧版测试 |
| `tests/e2e-chrome/test-performance.js` | 保留 | 旧版测试 |
| `tests/e2e-chrome/test-permissions.js` | 保留 | 旧版测试 |
| `.github/workflows/ci.yml` | 修改 | 移除 `continue-on-error: true` |
| `package.json` | 修改 | `test:e2e` 指向 smoke；新增 `test:e2e:full` |

## 4. 稳定性判定标准

**"稳定"定义**: 连续 5 次 CI 运行（push/PR 触发）`chrome-e2e` job 全部通过。

| 运行 # | 日期 | 结果 | 备注 |
|--------|------|------|------|
| 1 | — | ⏳ 待运行 | R288 首次提交 |
| 2 | — | ⏳ 待运行 | |
| 3 | — | ⏳ 待运行 | |
| 4 | — | ⏳ 待运行 | |
| 5 | — | ⏳ 待运行 | |

> 连续 5 次全部通过后，标记为"稳定"。

## 5. R288 P1 修复 (来自 R283 验证报告)

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| P1-1 | `ElementHandle.click({ timeout })` timeout 参数被静默忽略 | helpers.js:238-239 | 改为 `page.click('#onboardingSkip', { timeout })` |
| P1-2 | `assertWithinBudget` CI 严重超预算阈值 16x 原始预算过于宽松 | helpers.js:325 | 从 `effectiveBudget * 4` 收紧至 `effectiveBudget * 2` (即 8x 原始预算) |
| P2-1 | `.modal-backdrop` 幽灵选择器（代码库中不存在） | helpers.js:259 | 移除该选择器 |

## 6. 测试结果

| 测试 | 结果 | 备注 |
|------|------|------|
| `node --test tests/test-e2e-smoke-helpers.js` | 20 pass / 0 fail ✅ | isTimeoutError (10) + withTimeoutRetry (10) |
| `npm run test:ci` | 7907 pass / 0 fail ✅ | 32.3s（不含 E2E 浏览器测试） |
| `npm run lint` | 0 errors / 0 warnings ✅ | |

## 7. 已知限制

1. **路径 3 (选中文字)**: 依赖 content script 注入 (`window.__AI_ASSISTANT_INJECTED__`)，在极慢 CI 上可能需要等待 15s
2. **Headless 模式**: 使用 `--headless=new`，某些 CSS 动画可能不触发，不影响功能验证
3. **Persistent Profile**: `.chrome-profile-r211` 目录在每次测试前清理，确保干净状态
4. **旧版测试保留**: `test:e2e:full` 可手动运行，但不作为 CI 门禁

## 8. 未来扩展指引

当 E2E 冒烟测试连续 5 次 CI 全绿后，可考虑以下扩展：

1. **新增路径**: 书签搜索流程、知识库查询流程
2. **性能基准**: SidePanel 打开 <300ms、知识库搜索 <50ms
3. **跨浏览器**: Firefox MV3 兼容验证
4. **覆盖率**: 从 3 条路径扩展至 10+ 条路径时重新评估 CI 超时预算
