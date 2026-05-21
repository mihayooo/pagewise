# R257: E2E Chrome 调试残留清理与稳定化

> **需求编号**: R257  
> **代号**: E2EChromeCleanup  
> **复杂度**: Medium  
> **迭代**: Iter29  
> **创建日期**: 2026-05-21  
> **状态**: 📋 待开发  
> **前置依赖**: R252 (E2EChromeCI)  

---

## 1. 用户故事

**作为** PageWise 的维护者，  
**我希望** `tests/e2e-chrome/` 目录干净、E2E 测试可在本地和 CI 中稳定运行，  
**以便** 每次提交都自动验证扩展核心流程（侧边栏 / 书签 / 知识库 / 权限）不发生回归。

---

## 2. 背景与现状分析

### 2.1 R252 的承诺与现实差距

R252（E2EChromeCI）声称完成了以下工作：
- 清理 7 个 `debug-launch*.mjs` 调试残留文件
- 以 `test-sidebar-core.js` 为试点确保 Playwright + headless Chrome + MV3 加载链路通畅
- 对齐 6 个 E2E 测试文件的选择器/DOM 断言
- 将不稳定用例标记 skip 并记录原因
- 在 CI workflow 中添加 `chrome-e2e` job
- 生成 `e2e-baseline.md` 基线报告

**实际盘点结果（2026-05-21）：**

| 项目 | R252 声称 | 实际状态 | 差距 |
|------|----------|---------|------|
| `debug-launch*.mjs` 文件 | 已清理 7 个 | **7 个仍存在**（debug-launch.mjs ~ debug-launch7.mjs，共 515 行） | ❌ 完全未清理 |
| E2E 测试文件 | 6 个文件对齐 | **5 个测试文件 + 1 个 helpers.js** 存在（935 行，42 个用例） | ⚠️ 少了 1 个（可能合并） |
| 本地 headless 运行 | 可运行 | **从未验证通过** | ❌ 无法确认 |
| CI `chrome-e2e` job | 已添加 | **ci.yml 中不存在**，仅有 lint / test / package-check 三个 job | ❌ 完全未添加 |
| `docs/reports/e2e-baseline.md` | 已生成 | **文件不存在** | ❌ 完全未创建 |
| 标记 skip 的不稳定用例 | 已标记 | **无任何 skip 标记** | ⚠️ 未处理 |

### 2.2 当前文件清单

```
tests/e2e-chrome/
├── debug-launch.mjs          # 调试残留 — 需删除
├── debug-launch2.mjs         # 调试残留 — 需删除
├── debug-launch3.mjs         # 调试残留 — 需删除
├── debug-launch4.mjs         # 调试残留 — 需删除
├── debug-launch5.mjs         # 调试残留 — 需删除
├── debug-launch6.mjs         # 调试残留 — 需删除
├── debug-launch7.mjs         # 调试残留 — 需删除
├── helpers.js                # E2E 测试公共工具（Playwright + Chrome 加载）
├── test-bookmarks-flow.js    # 7 个用例 — 书签采集流程
├── test-knowledge-flow.js    # 6 个用例 — 知识库存储/检索流程
├── test-performance.js       # 6 个用例 — 性能基准
├── test-permissions.js       # 12 个用例 — 权限验证
└── test-sidebar-core.js      # 11 个用例 — 侧边栏核心交互
```

### 2.3 当前 CI 配置

`.github/workflows/ci.yml` 中仅有三个 job：
- `lint` — ESLint + 语法检查 + manifest 验证
- `test` — 单元测试 + 覆盖率 + 门禁
- `package-check` — 包体积检查

**没有任何 E2E Chrome 测试相关的 job。**

---

## 3. 验收标准

### AC-1: 调试残留文件彻底清理

- [ ] 删除 `tests/e2e-chrome/` 下全部 7 个 `debug-launch*.mjs` 文件
- [ ] 确认无任何代码或配置引用这 7 个文件（grep 排查）
- [ ] 删除 `.chrome-profile-r211` 等调试产生的 Chrome profile 目录（如存在）
- [ ] 在 `.gitignore` 中添加 `*.chrome-profile-*` 规则防止 profile 目录意外提交

### AC-2: E2E 测试本地可运行且选择器对齐

- [ ] `npm run test:e2e`（或等效命令）可在 headless Chrome 中执行
- [ ] 5 个测试文件（test-sidebar-core / test-bookmarks-flow / test-knowledge-flow / test-permissions / test-performance）的选择器和 DOM 断言与当前 SidePanel 实际渲染一致
- [ ] 无法在 headless 环境中稳定运行的用例标记为 `{ skip: true }` 并附注释说明原因（如"Chrome Extensions API 在 headless 模式下不支持 SidePanel API"）
- [ ] **≥ 20 个用例通过**（当前 42 个中的 ≥ 20 个）
- [ ] 通过用例数量和列表写入基线报告

### AC-3: CI 中 `chrome-e2e` job 实际运行

- [ ] 在 `.github/workflows/ci.yml` 中新增 `chrome-e2e` job
- [ ] 该 job 安装 Playwright 浏览器依赖（`npx playwright install chromium`）
- [ ] 该 job 运行 E2E 测试命令
- [ ] 该 job 配置 `continue-on-error: true`（soft-fail，不阻塞主流程）
- [ ] 在 GitHub Actions 运行日志中可确认该 job 状态为"success"或"failure"（而非"skipped"）
- [ ] 该 job 的运行时长控制在 5 分钟以内

### AC-4: 基线报告生成

- [ ] 创建 `docs/reports/e2e-baseline.md`，包含以下内容：
  - 测量日期、环境（OS / Node.js / Playwright 版本 / Chrome 版本）
  - 每个测试文件的用例数、通过数、跳过数、失败数
  - 通过用例总列表（≥ 20 个）
  - 跳过用例列表及跳过原因
  - 已知限制（如 headless 模式不支持的 API）
- [ ] 报告格式参照 `docs/reports/coverage-baseline.md` 风格

### AC-5: package.json 清理与脚本定义

- [ ] `package.json` 中定义 `test:e2e` script 指向 E2E 测试入口
- [ ] `test:ci` 和 `test:ci:coverage` 明确排除 `tests/e2e-chrome/` 目录（当前已排除，确认不回退）
- [ ] 无冗余的 E2E 相关 script

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **运行环境** | E2E 测试依赖真实 Chrome 浏览器（Playwright + chromium），不使用 mock |
| **Headless 限制** | Chrome MV3 扩展的 SidePanel API 在 headless 模式下可能不可用；需要用 `--headless=new` 或 Puppeter-style headless；不可用的功能需标记 skip |
| **CI 环境** | GitHub Actions ubuntu-latest，需安装 Playwright 浏览器二进制文件 |
| **不修改源码** | 本轮只修改测试文件、CI 配置和文档，不修改 `background/`、`sidebar/`、`lib/` 等生产代码 |
| **不增加测试运行时间** | `chrome-e2e` job 必须 soft-fail 且 ≤ 5 分钟，不影响主 CI 流水线时间 |
| **Playwright 版本** | 使用项目已有的 Playwright `^1.60.0`（devDependencies），不升级 |
| **Node.js 版本** | 与 CI 一致，Node.js 22 |

---

## 5. 依赖关系

### 5.1 前置依赖

| 需求 | 关系 | 说明 |
|------|------|------|
| R252 (E2EChromeCI) | **清理前债** | R252 标记完成但实际未达成目标，R257 是其善后 |
| R256 (CoverageInfraFixFinal) | **无冲突** | R256 修复覆盖率门禁，与 E2E 测试无交集 |

### 5.2 后续影响

| 需求 | 关系 | 说明 |
|------|------|------|
| 未来所有迭代 | **质量保障** | 稳定的 E2E 测试为后续功能开发提供回归保护 |
| 覆盖率门禁 | **无影响** | E2E 测试不计入 c8 代码覆盖率（Chrome 进程独立于 Node.js 进程） |

### 5.3 外部依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Playwright | ^1.60.0 | E2E 测试框架，浏览器自动化 |
| Chromium | Playwright bundled | E2E 测试目标浏览器 |

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Chrome SidePanel API 在 headless 模式下不可用 | 高 | 部分用例需 skip | 设计 fallback 断言（如 popup 模式），skip 用例需明确记录 |
| Playwright 扩展加载在 CI 环境不稳定 | 中 | chrome-e2e job 间歇性失败 | soft-fail 策略 + 重试机制（`--retry 1`） |
| 测试选择器随 UI 变更失效 | 中 | E2E 测试频繁回归 | 选择器使用 data-testid 属性优先，减少依赖 DOM 结构 |
| 删除 debug 文件时误删有效代码 | 低 | 测试框架损坏 | 仅删除 `debug-launch*.mjs`，不影响 `helpers.js` 和 `test-*.js` |

---

## 7. 不在范围内（Out of Scope）

- 不新建额外的 E2E 测试文件（只维护现有 5 个）
- 不修改 `background/`、`sidebar/`、`lib/`、`content/` 等生产代码
- 不配置 E2E 测试的代码覆盖率采集（Chrome 独立进程无法被 c8 插桩）
- 不将 `chrome-e2e` 从 soft-fail 提升为 hard-fail（等测试完全稳定后再提升）

---

## 8. 成功指标

| 指标 | 目标值 | 衡量方式 |
|------|--------|---------|
| debug-launch 残留文件 | **0 个** | `ls tests/e2e-chrome/debug-launch*.mjs` 无结果 |
| E2E 通过用例数 | **≥ 20 / 42** | 测试运行日志 |
| CI chrome-e2e job 状态 | **运行中（非 skipped）** | GitHub Actions 页面确认 |
| e2e-baseline.md 存在 | **是** | 文件可读且内容完整 |
| 主 CI 流水线额外耗时 | **≤ 5 min** | GitHub Actions 耗时统计 |
