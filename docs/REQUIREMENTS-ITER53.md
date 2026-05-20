# 需求文档 — R211: 真实 Chrome 环境 E2E 验证 (RealChromeE2E)

> 迭代: R53 | 日期: 2026-05-20 | 复杂度: Complex

---

## 背景与动机

项目当前拥有 **7,088+ 测试用例**，全部运行在 Node.js 环境中，通过 `tests/helpers/chrome-mock.js` 模拟 Chrome Extension API。`tests/e2e/` 目录虽名为 "E2E"，实质仍为 mock 驱动的集成测试——从未在真实 Chrome 浏览器中加载扩展、执行交互。

**质量盲区清单：**

| 维度 | 当前状态 | 风险 |
|------|---------|------|
| 扩展加载 | 从未真机加载 | manifest 解析、service worker 注册失败无法发现 |
| Content Script 注入 | mock `chrome.tabs` | CSP 违规、注入时机错误、DOM 选择器失效不可知 |
| SidePanel 渲染 | mock DOM | 真实 CSS 布局、iframe 沙箱、事件绑定问题被掩盖 |
| IndexedDB 读写 | mock `indexedDB` | 真实存储序列化、版本迁移、容量限制未验证 |
| AI 流式响应 | mock stream | SSE 解析、网络超时、token 截断的端到端表现未知 |
| Service Worker 生命周期 | mock `runtime` | 休眠唤醒、消息丢失、state 持久化未验证 |

Chrome Web Store 提交（R210）要求扩展可在真实环境稳定运行。本需求建立 Chrome E2E 测试能力，弥合 mock 测试与真实浏览器之间的质量鸿沟。

---

## 用户故事

1. **作为开发者**，我需要一个自动化 Chrome E2E 测试框架，以便每次提交都能验证扩展在真实浏览器中的核心流程不出错，而非仅依赖 mock。

2. **作为 QA 工程师**，我需要 CI 流水线中自动运行 headless Chrome E2E 测试，以便在合并前捕获仅在真实浏览器中才暴露的回归问题。

3. **作为用户**，我希望从扩展安装到 "选中文字提问 → AI 回答 → 知识库存储 → 搜索检索" 的完整链路在发布前已经被真实浏览器验证过。

---

## 验收标准

### AC-1: Chrome E2E 测试框架建立

- [ ] `tests/e2e-chrome/` 目录创建，含框架初始化脚本和 README
- [ ] 引入 **Playwright**（推荐）或 Puppeteer 作为浏览器自动化工具，新增为 `devDependencies`
- [ ] 提供 `launchExtension()` 辅助函数：自动以开发者模式加载未打包扩展，返回 `{ browser, extensionId, backgroundWorker, sidePanel }`
- [ ] 提供 `waitForSidePanelReady(page)` / `waitForServiceWorker(page)` 等通用等待工具
- [ ] 新增 npm script: `"test:chrome": "playwright test --config tests/e2e-chrome/playwright.config.js"`
- [ ] 所有 E2E 测试可在本地 `npm run test:chrome` 一键运行，无需手动配置浏览器路径

### AC-2: 核心用户流程验证（选中即问 → AI 即答 → 知识库 → 搜索）

- [ ] 测试: 扩展成功加载后，`chrome.sidePanel` API 可用
- [ ] 测试: 打开 SidePanel，验证欢迎界面/输入框渲染完成（DOM 元素存在）
- [ ] 测试: 在测试页面选中文字 → 浮动工具栏出现（content script 注入验证）
- [ ] 测试: 模拟 AI API 响应（拦截 `fetch` 或使用 mock API endpoint），验证回答渲染到消息列表
- [ ] 测试: 知识条目写入 IndexedDB 后，切换到知识面板可见
- [ ] 测试: 在知识面板搜索框输入关键词，返回匹配的知识条目

### AC-3: 书签流程验证（采集 → 图谱 → 节点详情 → 标签编辑）

- [ ] 测试: 书签采集器可读取测试书签树（预置 mock 书签数据）
- [ ] 测试: 知识图谱 Canvas 渲染完成（至少 5 个节点），无 JS 错误
- [ ] 测试: 点击图谱节点 → 详情面板弹出，显示书签标题/URL/标签
- [ ] 测试: 在详情面板编辑标签 → 保存 → 刷新后标签持久化

### AC-4: 权限与 Service Worker 生命周期验证

- [ ] 测试: Service Worker 注册成功，`navigator.serviceWorker.controller` 非空
- [ ] 测试: Service Worker 空闲后被唤醒（发送消息 → 接收响应），验证 idle → active 转换
- [ ] 测试: `chrome.storage.local` 读写在真实环境中正常工作（写入 → 重新读取 → 值一致）
- [ ] 测试: `chrome.tabs.query` 返回真实标签页列表
- [ ] 测试: Content Script 注入到 `<all_urls>` 匹配页面，`window.__PAGEWISE_INJECTED__` 标记存在

### AC-5: 性能基准验证

- [ ] 测试: SidePanel 首屏渲染时间 < **500ms**（从 `navigate` 到关键 DOM 元素可见）
- [ ] 测试: 100 个书签的图谱渲染时间 < **1s**（从数据加载到 Canvas 绘制完成）
- [ ] 测试: 知识库搜索 100 条记录响应时间 < **200ms**
- [ ] 性能数据以 JSON 格式输出到 `tests/e2e-chrome/results/perf-baseline.json`，便于回归对比

### AC-6: CI 集成

- [ ] `.github/workflows/ci.yml` 新增 `chrome-e2e` job
- [ ] Job 运行环境: `ubuntu-latest` + headless Chrome（Playwright 自带浏览器或 `npx playwright install chromium`）
- [ ] E2E 测试失败时阻断合并（job status = required check）
- [ ] E2E 测试结果和性能基线作为 artifact 上传（保留 7 天）
- [ ] CI 中 E2E 测试执行时间 < **5 分钟**（超时自动失败）

---

## 技术约束

### 框架选型: Playwright（优先）

| 维度 | Playwright | Puppeteer |
|------|-----------|-----------|
| Chrome Extension 支持 | `chromium.launchPersistentContext` + `--load-extension` | `launch` + `--load-extension` |
| 多浏览器 | Chromium / Firefox / WebKit | 仅 Chromium |
| 自动等待 | ✅ 内置 auto-wait | ❌ 需手动 |
| 网络拦截 | ✅ `route()` 拦截 AI API 请求 | ✅ `setRequestInterception` |
| 社区活跃度 | 更活跃 (Microsoft 维护) | 较低 |
| 与 Playwright Test 集成 | ✅ 原生 | ❌ 需搭配其他框架 |

**结论**: 推荐 **Playwright**，原因——auto-wait 机制大幅降低 E2E 测试 flaky 率；`route()` 优雅拦截 AI API 调用（避免真实 API 消耗）；Playwright Test 内置 reporter/retry/sharding。

### 环境约束

- **最低 Chrome 版本**: 110（与 `manifest.json` 的 `minimum_chrome_version` 一致）
- **操作系统**: CI 运行于 Ubuntu (headless)，本地支持 macOS / Windows / Linux
- **Node.js**: ≥ 22（与当前 CI 一致）
- **扩展加载方式**: `--load-extension=path/to/extension --disable-extensions-except=path/to/extension`
- **AI API 模拟**: E2E 测试 **禁止** 调用真实 AI API。使用 Playwright `page.route()` 拦截 API 请求，返回预置 JSON/SSE 响应

### 文件结构

```
tests/e2e-chrome/
├── README.md                      # 运行说明
├── playwright.config.js           # Playwright 配置
├── fixtures/
│   ├── extension-path.js          # 扩展路径解析
│   ├── ai-mock-responses.json     # 预置 AI 响应数据
│   ├── test-page.html             # 用于选中文字的测试页面
│   └── bookmark-fixtures.json     # 测试书签数据
├── helpers/
│   ├── launch.js                  # launchExtension() 核心辅助
│   ├── panel.js                   # SidePanel 操作工具
│   ├── content.js                 # Content Script 交互工具
│   └── performance.js             # 性能计时工具
├── results/                       # 测试结果输出（gitignore）
│   └── perf-baseline.json
├── tests/
│   ├── test-extension-load.spec.js
│   ├── test-core-flow.spec.js
│   ├── test-bookmark-flow.spec.js
│   ├── test-sw-lifecycle.spec.js
│   └── test-performance.spec.js
└── global-setup.js                # 全局 setup（构建扩展、启动浏览器）
```

### 关键实现原则

1. **隔离性**: 每个测试文件使用独立的浏览器上下文（persistent context），测试间互不干扰
2. **确定性**: AI 响应完全 mock，不依赖外部服务；书签数据通过 `chrome.bookmarks` API 预置
3. **速度**: 优先使用 headless 模式；避免不必要的 `waitForTimeout`；利用 Playwright auto-wait
4. **可调试**: 失败时自动截图 + trace 录制，保存至 `test-results/`
5. **零侵入**: 不修改现有源代码。如需为 E2E 测试暴露钩子（如 `window.__PAGEWISE_INJECTED__`），仅在 content script 入口添加一行标记赋值

---

## 依赖关系

### 上游依赖

| 依赖项 | 说明 | 影响范围 |
|--------|------|---------|
| R208 (ReleaseBuildPipeline) | 需要可用的构建脚本（`scripts/build.sh`），E2E 测试加载构建产物或源码 | `launchExtension()` 路径配置 |
| R210 (ChromeWebStoreSubmission) | 权限最小化审查完成后，manifest.json 稳定，E2E 权限验证基准才可靠 | AC-4 权限验证 |
| manifest.json (当前) | MV3 service worker 结构、permissions、content_scripts 配置 | 所有测试 |

### 下游被依赖

| 被依赖项 | 说明 |
|----------|------|
| 未来所有迭代 | Chrome E2E 测试框架建立后，后续功能迭代可在真实浏览器中回归 |
| Chrome Web Store 发布 | 真实环境验证为发布信心提供保障 |
| 性能优化迭代 | perf-baseline.json 可作为性能回归对比基准 |

### 新增 NPM 依赖

| 包名 | 类型 | 版本 | 用途 |
|------|------|------|------|
| `@playwright/test` | devDependency | ^1.50 | E2E 测试框架、test runner、浏览器管理 |

> 仅新增 1 个 devDependency。Playwright 自带 Chromium 下载能力，无需额外安装系统依赖（CI 除外需 `npx playwright install --with-deps chromium`）。

---

## 测试用例清单

| 编号 | 测试文件 | 用例 | 优先级 |
|------|---------|------|--------|
| E2E-01 | test-extension-load.spec.js | 扩展加载成功，无 manifest 解析错误 | P0 |
| E2E-02 | test-extension-load.spec.js | Service Worker 注册成功 | P0 |
| E2E-03 | test-extension-load.spec.js | Content Script 注入到测试页面 | P0 |
| E2E-04 | test-core-flow.spec.js | SidePanel 打开并渲染欢迎界面 | P0 |
| E2E-05 | test-core-flow.spec.js | 选中文字 → 浮动工具栏出现 | P0 |
| E2E-06 | test-core-flow.spec.js | 提问 → mock AI 响应 → 回答渲染 | P0 |
| E2E-07 | test-core-flow.spec.js | 知识条目写入 IndexedDB | P0 |
| E2E-08 | test-core-flow.spec.js | 知识面板搜索返回结果 | P0 |
| E2E-09 | test-bookmark-flow.spec.js | 书签采集器读取测试书签 | P1 |
| E2E-10 | test-bookmark-flow.spec.js | 图谱 Canvas 渲染 ≥5 节点 | P1 |
| E2E-11 | test-bookmark-flow.spec.js | 点击节点 → 详情面板弹出 | P1 |
| E2E-12 | test-bookmark-flow.spec.js | 标签编辑 → 保存 → 持久化 | P1 |
| E2E-13 | test-sw-lifecycle.spec.js | SW idle → active 唤醒 | P0 |
| E2E-14 | test-sw-lifecycle.spec.js | storage API 读写一致性 | P0 |
| E2E-15 | test-sw-lifecycle.spec.js | tabs API 返回真实标签 | P1 |
| E2E-16 | test-performance.spec.js | SidePanel 首屏 <500ms | P1 |
| E2E-17 | test-performance.spec.js | 100 书签图谱 <1s | P1 |
| E2E-18 | test-performance.spec.js | 搜索 100 条 <200ms | P2 |

**预估总用例: 18 个**（不含后续扩展）

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Playwright Chrome Extension 加载在 headless 模式下受限 | 中 | 高 | 使用 `headless: 'new'`（Chrome 112+ 支持 headless 扩展加载）；或 CI 降级为 headed + `xvfb-run` |
| E2E 测试在 CI 中 flaky | 中 | 中 | 利用 Playwright auto-wait + retry 机制；禁用动画；固定 seed 数据 |
| AI API mock 响应与真实行为不一致 | 低 | 低 | mock 响应基于真实 API 快照录制，定期更新 |
| 测试执行时间超出 5 分钟限制 | 低 | 中 | 拆分 shard 并行运行；性能测试可设为独立 job |
| 与现有 Node.js 测试工具链冲突 | 低 | 低 | Playwright Test 独立配置，不共享 jest/mocha runner |

---

## 不在范围内 (Out of Scope)

- ❌ Firefox / Safari 浏览器 E2E 测试（当前仅 Chrome）
- ❌ 真实 AI API 调用测试（属于集成测试，非 E2E）
- ❌ Chrome Web Store 提交流程自动化（属于 R210）
- ❌ 移动端 Chrome 测试
- ❌ 多浏览器标签页并发场景（后续迭代考虑）
- ❌ 对现有 7,088 个 Node.js 测试的迁移或重构

---

## 成功指标

| 指标 | 目标值 |
|------|--------|
| Chrome E2E 用例数 | ≥ 18 |
| 核心流程覆盖 | 选中即问 → AI 回答 → 知识存储 → 搜索 全链路 |
| 书签流程覆盖 | 采集 → 图谱 → 详情 → 标签编辑 全链路 |
| CI 集成 | `chrome-e2e` job 在 GitHub Actions 绿灯 |
| 测试执行时间 | < 5 分钟 (CI) |
| Flaky 率 | < 5%（连续 10 次 CI 运行） |
| 性能基线 | SidePanel <500ms, 100 书签图谱 <1s |
| 现有测试影响 | 0 fail，现有 7,088 测试不受影响 |
