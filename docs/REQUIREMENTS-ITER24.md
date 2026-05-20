# 需求文档 — R182: 功能迭代（用户侧体验整合）

> 迭代: R182（飞轮迭代 R24）
> 日期: 2026-05-20
> 复杂度: Complex
> 阶段: UX 整合 — 将已实现但未接入 UI 的模块落地到侧边栏/弹窗
> 状态: 📋 待开发

---

## 0. 项目背景审计

### 现状诊断

经代码审计，Phase S–W（R163–R186）中 **TODO 标记为 ✅ 的 24 个需求，仅 4 个存在实际源码文件**：

| 模块 | 文件 | 行数 | 侧边栏集成 |
|------|------|------|-----------|
| bookmark-spaced-repetition.js (R163) | ✅ 存在 | 528 | ❌ 未导入 |
| bookmark-weekly-digest.js (R165) | ✅ 存在 | 580 | ❌ 未导入 |
| bookmark-highlight-archive.js (R168) | ✅ 存在 | 549 | ❌ 未导入 |
| bookmark-user-profile.js (R176) | ✅ 存在 | 535 | ❌ 未导入 |
| bookmark-learning-goals.js (R169) | ❌ 不存在 | — | — |
| bookmark-annotations.js (R170) | ❌ 不存在 | — | — |
| bookmark-reading-queue.js (R173) | ❌ 不存在 | — | — |
| bookmark-learning-coach.js (R178) | ❌ 不存在 | — | — |
| bookmark-quick-capture.js (R175) | ❌ 不存在 | — | — |
| bookmark-learning-analytics.js (R174) | ❌ 不存在 | — | — |
| bookmark-insight-engine.js (R177) | ❌ 不存在 | — | — |
| bookmark-cross-domain-map.js (R179) | ❌ 不存在 | — | — |
| bookmark-learning-journey.js (R180) | ❌ 不存在 | — | — |
| bookmark-predictive-engine.js (R186) | ❌ 不存在 | — | — |
| bookmark-privacy-vault.js (R182) | ❌ 不存在 | — | — |

**结论**: 当前 TODO 中 20 个需求的完成标记与实际代码不符。本轮迭代的首要任务是**将已存在的 4 个模块接入 UI**，而不是新建更多模块。

### 侧边栏现状

`sidebar.js` 当前导入了旧版 `spaced-repetition.js`（核心算法），但未导入新版 `bookmark-spaced-repetition.js`（SM-2 学习调度）。`sidebar-chat.js`、`sidebar-bookmark.js`、`sidebar-knowledge.js`、`sidebar-settings.js` 均未引用任何 Phase S–W 模块。用户无法在界面上看到复习提醒、学习目标、智能摘录等功能入口。

### REQUIREMENTS.md 待办

| 需求 | 状态 | 优先级 |
|------|------|--------|
| R010 划词提问 | 📋 待开发 | P1 |
| R011 对话历史按 URL 持久化 | 📋 待开发 | P1 |
| R012 页面高亮关联 | 📋 待开发 | P1 |

---

## 1. 用户故事

### US-1: 学习仪表盘（主故事）

作为技术学习者，我打开 PageWise 侧边栏时，希望能一眼看到**今日待复习数量、本周学习目标进度、最近摘录的知识条目**，而不是面对一个空白的对话框。这样我能快速判断"今天该做什么"，而不需要逐个翻找功能入口。

### US-2: 对话历史回溯

作为技术学习者，我昨天在一个 React 文档页面上问了几个问题，今天再次打开同一页面时，希望能**自动恢复之前的对话记录**，而不是从零开始提问。这样我可以在连续多天的学习中保持上下文连贯。

### US-3: 选中文字快速提问

作为技术学习者，我在阅读文档时遇到不理解的代码片段或概念，希望能**选中文字后立即看到一个浮动提问按钮**，点击后直接在侧边栏发起提问，而不是先复制文字、再切换到侧边栏、再粘贴提问。这样我的阅读 flow 不被打断。

---

## 2. 验收标准

### AC1: 侧边栏学习仪表盘面板

- 侧边栏新增「学习」标签页（与「对话」「知识库」「书签」「设置」并列）
- 面板顶部展示**今日概览卡片**：
  - 待复习条目数（来自 `bookmark-spaced-repetition.js` 的 `getDueCards()`）
  - 本周学习目标进度（百分比 + 进度条）
  - 今日已提问次数 / 已阅读篇数
- 面板中部展示**最近摘录列表**（最近 5 条，来自 `bookmark-highlight-archive.js` 的最近归档记录）
- 面板底部展示**快速操作**：「开始复习」「查看周报」「浏览知识库」
- 所有数据异步加载，面板渲染不阻塞侧边栏主流程

### AC2: 对话历史按 URL 持久化与自动恢复

- 用户在同一页面发起的对话自动保存到 IndexedDB（复用 `conversation-store.js` 的 `saveConversation()`）
- 保存时关联当前页面 URL 作为 key（与 R011 需求对齐）
- 用户重新访问同一 URL 时，侧边栏自动加载该 URL 的最近对话记录（最近 30 天内）
- 对话恢复时显示「已恢复上次对话（N 条消息）」提示，用户可选择「继续」或「新对话」
- 对话存储上限：单 URL 最多保留 50 条消息（超出自动截断最旧消息）
- 超过 30 天的对话记录自动清理（复用 `deleteOldConversations()`）

### AC3: 划词浮动提问按钮

- 用户在任意网页选中文字后，在选区附近出现一个圆形浮动按钮（图标：💬）
- 浮动按钮延迟 300ms 显示（避免单击选择时误触发）
- 点击浮动按钮后：
  - 侧边栏自动打开（`chrome.sidePanel.open()`）
  - 选中的文字自动填入提问输入框
  - 自动触发提问（或填入但不自动发送，用户可编辑后再发送）
- 浮动按钮在以下场景自动消失：
  - 点击页面其他区域（选区取消）
  - 页面滚动超过 200px
  - 按 Escape 键
- 浮动按钮不遮挡页面关键内容（定位在选区右下方 10px，超出视口时自动翻转）
- 用户可在设置中关闭浮动按钮（默认开启）

### AC4: 旧版复习系统整合

- `sidebar.js` 中旧版 `spaced-repetition.js` 的直接调用迁移到 `bookmark-spaced-repetition.js`
- 学习仪表盘的复习数据源统一来自 `bookmark-spaced-repetition.js`
- 确保旧版复习卡片数据（如有）可与新版 SM-2 数据兼容

### AC5: 全量回归与测试

- `npm run test:ci` 0 fail
- `npm run lint` 0 errors 0 warnings
- 新增集成测试覆盖：仪表盘数据聚合、对话历史存取、浮动按钮生命周期
- 测试 ≥ 20 用例

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 优先整合现有代码 | 首要任务是将 4 个已存在模块（spaced-repetition、weekly-digest、highlight-archive、user-profile）接入 UI，不新建模块 |
| 零外部依赖 | 不引入任何第三方 npm 包 |
| 纯 ES Module | 所有新代码使用 `export` / `import` 语法 |
| Content Script 安全 | 划词浮动按钮通过 content script 注入，遵循 CSP 策略，不使用 inline script |
| 侧边栏架构保持 | 复用 `sidebar.js` 薄编排层 + 子模块（sidebar-chat.js 等）的现有架构，新增 `sidebar-learning.js` 子模块 |
| Chrome API 最小权限 | 浮动按钮只需 content script 注入权限（已有），无需新增 manifest 权限 |
| 对话存储兼容 | 复用 `lib/conversation-store.js` 现有 IndexedDB schema，URL 字段已存在但未被充分利用 |
| 向后兼容 | 不修改已有模块的公共 API 签名，只新增消费端代码 |
| 文件行数上限 | 新增文件 ≤ 400 行（项目 CI 门禁） |
| 性能预算 | 仪表盘面板数据聚合 < 200ms（含 4 个模块的数据查询） |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| SpacedRepetition (R163) | `lib/bookmark-spaced-repetition.js` | ✅ 已实现（528 行） | 仪表盘：`getDueCards()` / `getDueCardCount()` |
| HighlightArchive (R168) | `lib/bookmark-highlight-archive.js` | ✅ 已实现（549 行） | 仪表盘：最近摘录列表 |
| UserProfile (R176) | `lib/bookmark-user-profile.js` | ✅ 已实现（535 行） | 仪表盘：用户学习统计 |
| WeeklyDigest (R165) | `lib/bookmark-weekly-digest.js` | ✅ 已实现（580 行） | 仪表盘：本周学习周报入口 |
| ConversationStore | `lib/conversation-store.js` | ✅ 已实现 | 对话历史：`saveConversation()` / `getConversationByUrl()` |
| 旧版 SpacedRepetition | `lib/spaced-repetition.js` | ✅ 已实现 | 数据迁移：`getDueCards()` / `getDueCardCount()` / `initializeReviewData()` |
| BookmarkOnboarding (R81) | `lib/bookmark-onboarding.js` | ✅ 已实现 | 设置中的浮动按钮开关集成 |
| Stats | `lib/stats.js` | ✅ 已实现 | 仪表盘：`getStats()` / `recordDailyUsage()` |

### 输出（新增文件）

| 文件 | 操作 | 说明 |
|------|------|------|
| `sidebar/sidebar-learning.js` | **新建** | 学习仪表盘子模块（≤ 400 行） |
| `lib/content-floating-ask.js` | **新建** | Content script：划词浮动提问按钮逻辑（≤ 300 行） |
| `content-floating-ask.css` | **新建** | 浮动按钮样式 |
| `tests/test-sidebar-learning.js` | **新建** | 仪表盘集成测试 |
| `tests/test-content-floating-ask.js` | **新建** | 浮动按钮单元测试 |
| `sidebar/sidebar.js` | **修改** | 导入 sidebar-learning.js、新增「学习」标签页 |
| `sidebar/sidebar.html` | **修改** | 新增学习标签页 HTML 结构 |
| `manifest.json` | **修改** | 注册 content script（content-floating-ask.js/css） |
| `docs/CHANGELOG.md` | **修改** | 新增 R182 变更记录 |

### 不在本轮范围内

以下模块在 TODO 中标记为已完成但实际文件不存在，**本轮不处理**，留待后续迭代：

- bookmark-learning-goals.js (R169)
- bookmark-annotations.js (R170)
- bookmark-reading-queue.js (R173)
- bookmark-learning-analytics.js (R174)
- bookmark-quick-capture.js (R175)
- bookmark-learning-coach.js (R178)
- bookmark-insight-engine.js (R177)
- bookmark-cross-domain-map.js (R179)
- bookmark-learning-journey.js (R180)
- bookmark-predictive-engine.js (R186)
- bookmark-privacy-vault.js (R182)

---

## 5. 非功能需求

| 项目 | 要求 |
|------|------|
| 仪表盘加载 | 4 个模块数据并行查询，总耗时 < 200ms |
| 浮动按钮响应 | 选中文字后 ≤ 400ms 出现（含 300ms 延迟防抖） |
| 对话恢复 | 页面加载后 ≤ 500ms 完成历史对话恢复 |
| 内存占用 | 仪表盘面板数据 < 50KB |
| Content Script 体积 | 浮动按钮 JS + CSS < 15KB（gzip 后） |
| 向后兼容 | 不修改已有模块公共 API |
| CI 门禁 | `npm run test:ci` 0 fail / `npm run lint` 0 err 0 warn / 新文件 ≤ 400 行 |

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 旧版 spaced-repetition.js 与新版 SM-2 数据格式不兼容 | 复习数据丢失 | 先做数据格式审计，必要时增加迁移层 |
| Content Script CSP 冲突 | 浮动按钮无法注入 | 使用外部 CSS 文件 + 纯 JS DOM 操作，不使用 inline style/script |
| 仪表盘查询多个模块导致侧边栏卡顿 | 用户体验下降 | 使用 `Promise.all()` 并行查询 + 骨架屏加载态 |
| conversation-store.js 的 URL 字段可能未被正确使用 | 对话恢复失败 | 先审计现有存储数据格式，必要时修复保存逻辑 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-20 | R182 | 初始创建 — 基于代码审计，聚焦"已有模块 UI 整合"而非"新建模块" |