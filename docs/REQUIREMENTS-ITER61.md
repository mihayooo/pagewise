# R219: E2E 框架验证与冒烟测试 — 需求文档

> 迭代: 61 | 优先级: P1 | 复杂度: Medium
> 作者: Plan Agent | 日期: 2026-05-20
> 前序依赖: R211 (E2E Chrome 测试框架搭建)

---

## 0. 背景与问题

R211 建立了 `tests/e2e-chrome/` 目录，包含 **1 个 helpers 文件 + 5 个测试文件、共 42 个测试用例**，覆盖侧边栏核心流程、书签流程、知识库流程、权限/API 验证、性能基准。但存在以下遗留问题：

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 从未在 CI 中运行 | **P0** | `ci.yml` 仅有 `lint`/`test`/`package-check` 三个 job，无 E2E job |
| 无 npm script 入口 | **P0** | `package.json` 中不存在 `test:e2e` 或 `test:chrome-e2e` script |
| `test:all` 路径错误 | **P1** | 指向 `tests/e2e/*.js` 而非实际的 `tests/e2e-chrome/*.js` |
| 测试从未实际执行 | **P1** | 选择器/断言/超时从未经过真实 Chrome 验证，可能全部失败 |
| R211 未记录到主需求文档 | **P2** | `REQUIREMENTS.md` 中无 R211 条目 |

---

## 1. 用户故事

**作为** PageWise 项目的开发者和维护者，  
**我希望** R211 建立的 E2E 测试框架能在本地 headless Chrome 和 CI 环境中稳定运行，  
**以便** 每次提交都能获得真实浏览器环境的回归保障，而不是停留在未验证的测试代码。

---

## 2. 验收标准

### AC-1: E2E 测试可在本地 headless Chrome 中全量运行并记录基线

- `npm run test:chrome-e2e` 可正常执行（或 `./scripts/run-chrome-e2e.sh`）
- 所有 42 个测试用例（5 个文件）在本地 headless Chrome 中执行完毕
- 执行结果（通过/跳过/失败 + 耗时）记录到 `docs/reports/e2e-baseline.md`
- 已知不稳定的测试标记为 `skip` 并在基线文档中注明原因

### AC-2: 运行时错误全部修复

- 修复测试中发现的：选择器不匹配、断言逻辑错误、超时值不合理、API 调用方式过时等问题
- 修复后：**≥ 35 个用例通过**（42 个中允许 ≤ 7 个因环境限制 skip）
- 0 个用例因代码错误而失败（skip ≠ fail）

### AC-3: npm script 和运行脚本可正常工作

- `package.json` 中新增 `"test:chrome-e2e"` script，指向 `scripts/run-chrome-e2e.sh`
- `scripts/run-chrome-e2e.sh` 可在干净环境（已安装依赖）下直接执行
- `test:all` script 中的路径修正为实际的 `tests/e2e-chrome/*.js`

### AC-4: CI workflow 包含 E2E job（soft-fail）

- `.github/workflows/ci.yml` 新增 `chrome-e2e` job
- 该 job：
  - 在 `ubuntu-latest` 上运行
  - 安装 Chromium（通过 `npx playwright install chromium --with-deps`）
  - 执行 `npm run test:chrome-e2e`
  - 使用 `continue-on-error: true`（soft-fail，不阻塞 `lint`/`test`/`package-check`）
- 该 job 不依赖其他 job（可并行运行）

### AC-5: E2E 基线报告已生成

- `docs/reports/e2e-baseline.md` 包含：
  - 测试日期、环境信息（Node/Chrome/Playwright 版本）
  - 每个测试文件的用例数、通过数、skip 数、失败数、耗时
  - 性能基准数据（首屏渲染、面板切换等来自 `test-performance.js`）
  - 已知问题 / skip 原因列表
- `REQUIREMENTS.md` 中新增 R211 和 R219 条目（状态：✅）

---

## 3. 技术约束

### 3.1 E2E 测试文件现状

| 文件 | 用例数 | 覆盖范围 |
|------|--------|----------|
| `test-sidebar-core.js` | 11 | 扩展加载、SidePanel 打开、标签切换、输入框交互、面板渲染 |
| `test-bookmarks-flow.js` | 7 | 书签面板 UI 元素、搜索、详情面板、无障碍属性 |
| `test-knowledge-flow.js` | 6 | 知识库面板、子标签页、导入导出按钮、搜索模式、图谱 |
| `test-permissions.js` | 12 | Service Worker 生命周期、storage/tabs/runtime API、manifest 验证 |
| `test-performance.js` | 6 | 首屏渲染 <500ms、面板切换 <300ms、DOM 节点、内存 |

### 3.2 技术栈

- **测试框架**: `node:test`（Node.js 内置，非 Jest/Mocha）
- **浏览器自动化**: Playwright ^1.60.0（已安装为 devDependency）
- **浏览器**: Chromium（通过 `npx playwright install chromium` 安装）
- **扩展加载方式**: `chromium.launchPersistentContext()` + `--load-extension` 参数
- **运行超时**: 单个测试 60s（`--test-timeout=60000`），并发度 1（`--test-concurrency=1`）

### 3.3 关键风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CI 环境无 GUI，扩展加载可能失败 | E2E 全部失败 | 使用 `--headless=new` + `--no-sandbox` + `--disable-gpu` + `--disable-dev-shm-usage`（已在 helpers.js 中配置） |
| Service Worker 事件时序不确定 | 随机超时 | `launchChromeWithExtension` 已有 15s 超时等待 SW 事件；不稳定用例标记 skip |
| 选择器可能因 R212-R218 迭代而失效 | 大量断言失败 | 本次需逐一验证，修复选择器至与当前 DOM 结构一致 |
| 性能测试在 CI 机器上不稳定 | 间歇性失败 | `assertWithinBudget` 已设计为超预算仅 warn、2x 超预算才 fail；CI 中可用宽松阈值 |
| Playwright 版本升级导致 API 变化 | 构建失败 | 锁定 `^1.60.0`，CI 中显式安装 |

### 3.4 不变式

- E2E 测试 **不得** 影响现有 `npm run test:ci` 流程（已通过 `find -not -path 'tests/e2e/*'` 排除）
- E2E 测试 **不得** 修改生产代码逻辑（仅修复测试代码中的选择器/断言/超时）
- CI 中 E2E job **不得** 阻塞主流程（soft-fail）
- 修复测试时保持 `node:test` 框架，不引入 Jest/Mocha 等外部依赖

---

## 4. 依赖关系

### 4.1 前置依赖

| 依赖项 | 状态 | 说明 |
|--------|------|------|
| R211: E2E Chrome 测试框架搭建 | ✅ 已完成 | `tests/e2e-chrome/` 目录和 5 个测试文件已存在 |
| Playwright devDependency | ✅ 已安装 | `package.json` 中 `"playwright": "^1.60.0"` |
| `scripts/run-chrome-e2e.sh` | ✅ 已存在 | 需验证可执行性 |
| 当前 42 个测试用例代码 | ✅ 已存在 | 需经过真实环境验证和修复 |

### 4.2 产出物

| 产出物 | 路径 | 说明 |
|--------|------|------|
| 修复后的 E2E 测试 | `tests/e2e-chrome/*.js` | 选择器/断言/超时修复，可能新增 skip 标记 |
| npm script | `package.json` → `test:chrome-e2e` | 新增脚本入口 |
| 修正的 test:all | `package.json` → `test:all` | 路径修正 |
| CI job | `.github/workflows/ci.yml` → `chrome-e2e` | 新增 soft-fail job |
| E2E 基线报告 | `docs/reports/e2e-baseline.md` | 测试结果基线 |
| 需求更新 | `docs/REQUIREMENTS.md` | 新增 R211/R219 条目 |

### 4.3 后续影响

- **R220+**: 后续迭代可基于 E2E 基线新增测试用例
- **覆盖率**: E2E 测试不影响 `c8` 行覆盖率统计（独立执行路径）
- **开发者体验**: 新增 `npm run test:chrome-e2e` 供开发者本地验证

---

## 5. 范围界定

### 包含 (In Scope)

1. 验证 Playwright + Chromium 在本地环境的安装和运行
2. 执行全部 5 个测试文件、42 个用例，记录结果
3. 修复测试代码中的运行时错误（选择器、断言、超时）
4. 在 `package.json` 中新增 `test:chrome-e2e` script，修正 `test:all` 路径
5. 在 `ci.yml` 中新增 `chrome-e2e` soft-fail job
6. 生成 `docs/reports/e2e-baseline.md` 基线报告
7. 更新 `docs/REQUIREMENTS.md`

### 不包含 (Out of Scope)

- 新增 E2E 测试用例（本次仅验证和修复现有 42 个用例）
- 修改生产代码以适配测试（如 DOM 选择器不匹配时应修改测试而非生产代码）
- E2E 测试的覆盖率统计集成
- 测试截图/录屏功能
- 多浏览器（Firefox/Safari）支持
- 从 soft-fail 升级为 hard-fail（需要在基线稳定后再考虑）

---

## 6. 成功度量

| 指标 | 目标值 | 度量方式 |
|------|--------|----------|
| E2E 用例通过率 | ≥ 83%（35/42） | `npm run test:chrome-e2e` 输出 |
| 失败用例（非 skip） | 0 | 区分 skip 和 fail |
| CI E2E job 执行 | 可运行（不阻塞主流程） | GitHub Actions 日志 |
| 基线报告完整性 | 包含所有 5 个文件的详细结果 | 人工审查 `e2e-baseline.md` |
| 主流程无回归 | `npm run test:ci` 0 fail | CI 通过 |
| lint 无新增警告 | 0/0 | `npm run lint` |
