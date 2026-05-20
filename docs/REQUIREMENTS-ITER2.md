# REQUIREMENTS — R166: PopupExperienceOpt (弹窗体验优化)

> 迭代: R166
> 日期: 2026-05-20
> 复杂度: Medium
> 阶段: 飞轮迭代 — 弹窗用户体验升级
> 改造文件: `popup/bookmark-overview.js`、`popup/popup.html`、`popup/popup.css`、`popup/popup.js`
> 测试文件: `tests/test-popup-experience-opt.js`

---

## 1. 用户故事

作为一名高频使用 PageWise 的技术学习者，我希望每次打开扩展弹窗时，能一眼看到**最近的学习动态、待复习提醒、学习进度**，并能快速触达常用功能（图谱、搜索、周报、设置），而不用每次都跳转到侧边栏或选项页去查找。这样我可以在短短几秒内了解自己的学习状态，决定下一步做什么。

作为首次使用 PageWise 的新用户，我希望弹窗中有一个明显的**引导入口**，让我能随时重新查看使用教程，快速上手核心功能。

---

## 2. 验收标准

### AC1: 浏览历史时间线 (Timeline)

**给定** 用户打开 PageWise 弹窗
**当** BookmarkOverview 完成初始化
**则** 在弹窗顶部显示「最近活动」时间线卡片：
- 分三个时间维度分组：**今日** / **本周** / **本月**
- 每个分组展示该时段内新增书签数量、阅读完成数量
- 按时间倒序排列，最多显示最近 **10 条**活动记录
- 每条记录包含：书签标题（截断至 30 字符）、域名 favicon、添加时间（相对时间格式如"2 小时前"）
- 无活动时显示空状态文案 + 引导提示（"开始浏览网页，PageWise 会自动记录你的学习轨迹"）

### AC2: 快捷操作面板 (QuickActions)

**给定** 用户打开 PageWise 弹窗
**当** 页面渲染完成
**则** 在时间线下方显示快捷操作栏，包含 4 个图标按钮：
- 📊 **知识图谱** — 点击打开侧边栏图谱视图（复用现有 `switchToBookmarks` 消息）
- 🔍 **高级搜索** — 点击展开弹窗内搜索面板（展开 BookmarkOverview 的搜索功能）
- ⚙️ **设置** — 点击打开选项页（复用现有 `openOptionsPage`）
- 📋 **学习周报** — 点击调用 `WeeklyDigest.generate()` 并展示 Markdown 预览

每个按钮必须有 tooltip（`title` 属性）和 i18n 支持。按钮使用已有 VT323 + Source Serif 4 字体体系，与 popup 现有设计语言一致。

### AC3: 待复习提醒卡片 (ReviewCard)

**给定** 用户存在至少 1 条到期待复习的书签（`BookmarkSpacedRepetition.getDueCount() > 0`）
**当** 弹窗初始化
**则** 在快捷操作面板下方显示待复习提醒卡片：
- 显示标题「今日待复习」+ 到期数量（如"5 条待复习"）
- 展示最多 **3 条**到期书签的标题（来自 `getDueBookmarks(3)`）
- 「开始复习」按钮 — 点击跳转侧边栏复习模式
- 点击卡片任意位置可展开/折叠详细列表
- 无待复习时卡片不显示（非零才渲染）
- 与 `BookmarkSpacedRepetition` 通过依赖注入集成，不直接 import

### AC4: 学习进度环形图 (ProgressRing)

**给定** 用户存在书签数据
**当** 弹窗渲染统计区域
**则** 替换现有纯数字统计为 SVG 环形进度图：
- 环形图分三段颜色：**已读** (read, 绿色) / **待读** (unread, 橙色) / **复习中** (reviewing, 蓝色)
- 圆心显示书签总数
- 环形图下方一行小字：`已读 42 · 待读 15 · 复习中 8`
- 环形图使用纯 SVG + CSS `stroke-dasharray` 实现，**不引入第三方图表库**
- 动画：首次渲染时有从 0 到目标值的 CSS transition（800ms ease-out）
- 数据来源：`overview.bookmarks[].status` 字段统计 + `BookmarkSpacedRepetition.getDueCount()`

### AC5: 搜索结果即时预览 (HoverPreview)

**给定** 用户在弹窗搜索框中输入关键词，搜索结果列表已渲染
**当** 用户 hover 任意搜索结果项
**则** 在该书签项右侧/下方浮出预览卡片（200ms 延迟触发）：
- 预览内容：书签标题、URL 域名、文件夹路径、状态标签、添加时间
- 如书签有 `summary` 字段，显示前 **100 字符**摘要
- 预览卡片最大宽度 260px，使用 CSS position: absolute
- hover 离开后 150ms 消失
- 弹窗宽度不足 400px 时，预览改为下方展示
- 预览不影响弹窗滚动和布局

### AC6: 首次使用引导入口 (OnboardingLink)

**给定** 弹窗已渲染
**当** 页面加载完成
**则** 在弹窗底部 footer 区域显示引导入口：
- 如 `BookmarkOnboarding.shouldShowOnboarding()` 返回 true：显示醒目引导横幅 "👋 新手？点击开始引导 →"
- 如引导已完成：显示一个低调的文字链接 "📖 重新查看引导"
- 点击触发 `BookmarkOnboarding.resetOnboarding()` 后打开选项页引导向导
- 入口位置在 `popup-footer` 区域，stats 信息右侧，不破坏现有布局

---

## 3. 技术约束

### 3.1 架构约束

| 约束项 | 说明 |
|--------|------|
| 模块风格 | 纯 ES Module，工厂函数依赖注入，禁止全局变量 |
| DOM 操作 | 纯原生 `document.createElement`，不引入 React/Vue/Svelte |
| 样式 | 扩展 `popup.css`，使用 CSS 变量（`--text-muted`, `--accent` 等），与现有设计系统一致 |
| 字体 | 复用已有 VT323（等宽/标题）+ Source Serif 4（正文）+ Noto Serif SC（中文）|
| 图表 | SVG 环形图纯手写，stroke-dasharray + CSS transition，**零外部依赖** |
| 代码风格 | `const/let` 优先，禁止 `var`，无分号，2 空格缩进 |
| 文件行数 | 单文件 ≤ 400 行（超限时拆分子模块） |

### 3.2 性能约束

| 约束项 | 说明 |
|--------|------|
| 弹窗加载 | 整体渲染完成 ≤ 200ms（不含异步数据请求） |
| 时间线数据 | 复用 `_bookmarks` 内存数据，不做额外 IO |
| 搜索预览 | hover 延迟 200ms 防抖，避免频繁 DOM 创建 |
| 环形图渲染 | SVG 一次创建，仅更新 stroke-dashoffset 值 |
| 书签列表 | 限制渲染 ≤ 20 条（与现有逻辑一致） |

### 3.3 弹窗尺寸约束

- Chrome 弹窗默认宽度 300px（min 280px, max 800px）
- 所有新组件必须在 **280px–400px** 视口宽度下正常工作
- 环形图最大尺寸 80×80px
- 预览卡片最大宽度 260px（窄屏时自适应下方）

### 3.4 i18n 约束

- 所有新增用户可见字符串必须通过 `bookmark-i18n.js` 注册
- 支持 zh-CN / en-US 双语
- 新增 i18n key 约 15–20 个（时间线、快捷操作、复习卡片、进度图、引导入口）

---

## 4. 依赖关系

### 4.1 上游依赖（本需求消费的模块）

| 模块 | 文件 | 依赖方式 | 用途 |
|------|------|----------|------|
| BookmarkSpacedRepetition | `lib/bookmark-spaced-repetition.js` | 依赖注入（构造函数参数） | 获取待复习书签数量和列表 |
| BookmarkOnboarding | `lib/bookmark-onboarding.js` | 依赖注入（构造函数参数） | 检查引导状态、重置引导 |
| WeeklyDigest | `lib/bookmark-weekly-digest.js` | 依赖注入（构造函数参数） | 生成学习周报 |
| BookmarkCollector | `lib/bookmark-collector.js` | 已有依赖 | 书签数据源 |
| BookmarkI18n | `lib/bookmark-i18n.js` | 已有依赖 | 国际化翻译 |

### 4.2 下游依赖（消费本需求的模块）

| 模块 | 影响 |
|------|------|
| `popup/popup.js` | 需改造入口逻辑，初始化 BookmarkOverview 新组件 |
| `popup/popup.html` | 需新增容器 DOM 节点（时间线、快捷操作、复习卡片、进度图区域） |
| `popup/popup.css` | 需新增组件样式（约 150–200 行 CSS） |

### 4.3 已完成的关联需求

| 需求 | 状态 | 关联 |
|------|------|------|
| R015: 学习模式（间隔重复） | ✅ 已实现 | 复习数据源 |
| R81: BookmarkOnboarding 引导向导 | ✅ 已实现 | 引导入口集成 |
| R163: SpacedRepetition 间隔复习 | ✅ 已实现 | 复习卡片数据源 |
| R165: WeeklyDigest 学习周报 | ✅ 已实现 | 周报快捷入口 |
| R80: BookmarkI18n 国际化 | ✅ 已实现 | 所有新字符串外部化 |
| R79: BookmarkAccessibility 无障碍 | ✅ 已实现 | 新组件需遵守 ARIA 规范 |

### 4.4 不变部分（明确不改动）

- `popup.js` 中现有的 4 个主按钮逻辑（打开侧边栏、快速总结、知识库、书签图谱）**保持不变**
- `BookmarkOverview` 现有的搜索、过滤、分布统计核心逻辑**保持不变**
- background service worker 和 content script **不涉及本次改动**

---

## 5. 实现方案概要

### 5.1 BookmarkOverview 新增方法

```
_renderTimeline(container)        — 渲染浏览历史时间线
_renderQuickActions(container)    — 渲染快捷操作面板
_renderReviewCard(container)      — 渲染待复习提醒卡片
_renderProgressRing(container)    — 渲染学习进度环形图
_setupHoverPreview(bookmarkItems) — 为搜索结果绑定 hover 预览
_renderOnboardingLink(container)  — 渲染引导入口
```

### 5.2 数据流

```
popup.js
  → new BookmarkOverview({
      collector, indexer, graphEngine, search,
      spacedRepetition,   // 新增注入
      onboarding,         // 新增注入
      weeklyDigest,       // 新增注入
      callbacks
    })
  → .init() → 加载书签数据
  → .render(container) → 按区域依次渲染：
      [1] 搜索框          (已有)
      [2] 学习进度环形图    (新) ← _renderProgressRing
      [3] 时间线           (新) ← _renderTimeline
      [4] 快捷操作面板     (新) ← _renderQuickActions
      [5] 复习提醒卡片     (新) ← _renderReviewCard
      [6] 领域/文件夹分布   (已有)
      [7] 最近添加         (已有)
      [8] 查看图谱按钮     (已有)
      [9] 搜索结果列表      (已有，增加 hover 预览)
      [10] 引导入口         (新) ← _renderOnboardingLink
```

### 5.3 新增 i18n Key 列表（预估）

| Key | zh-CN | en-US |
|-----|-------|-------|
| `overview.timeline.title` | 最近活动 | Recent Activity |
| `overview.timeline.today` | 今日 | Today |
| `overview.timeline.thisWeek` | 本周 | This Week |
| `overview.timeline.thisMonth` | 本月 | This Month |
| `overview.timeline.empty` | 暂无活动记录 | No activity yet |
| `overview.timeline.emptyHint` | 开始浏览网页，PageWise 会自动记录你的学习轨迹 | Start browsing — PageWise will track your learning |
| `overview.quickActions.graph` | 知识图谱 | Knowledge Graph |
| `overview.quickActions.search` | 高级搜索 | Advanced Search |
| `overview.quickActions.settings` | 设置 | Settings |
| `overview.quickActions.weeklyReport` | 学习周报 | Weekly Report |
| `overview.review.title` | 今日待复习 | Today's Reviews |
| `overview.review.count` | `{{count}} 条待复习` | `{{count}} due` |
| `overview.review.start` | 开始复习 | Start Review |
| `overview.progress.read` | 已读 | Read |
| `overview.progress.unread` | 待读 | Unread |
| `overview.progress.reviewing` | 复习中 | Reviewing |
| `overview.onboarding.welcome` | 👋 新手？点击开始引导 | 👋 New here? Start the guide |
| `overview.onboarding.review` | 📖 重新查看引导 | 📖 Revisit guide |

---

## 6. 测试计划

| 测试类别 | 用例数（预估） | 覆盖范围 |
|----------|---------------|----------|
| 时间线 | 6 | 三维度分组、空状态、时间格式化、活动计数、截断显示、数据源注入 |
| 快捷操作 | 5 | 按钮渲染、回调触发、周报生成调用、i18n、无障碍 |
| 复习卡片 | 7 | 到期渲染、无数据隐藏、展开折叠、数据注入、按钮跳转、极限数据、边界值 |
| 环形图 | 5 | SVG 结构、三段比例、动画 transition、零数据、总数显示 |
| Hover 预览 | 6 | 延迟触发、内容展示、摘要截断、消失延迟、窄屏适防、防抖 |
| 引导入口 | 4 | 未完成显示横幅、已完成显示链接、重置触发、i18n |
| 集成 | 3 | 完整渲染流程、依赖注入缺失降级、refresh 后重绘 |
| **合计** | **≥ 36** | — |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 弹窗尺寸有限，新增组件导致溢出 | 中 | 每个组件独立折叠/展开，默认仅展开环形图+快捷操作，其余折叠 |
| SpacedRepetition 未初始化时复习卡片报错 | 低 | 依赖注入，缺失时静默跳过不渲染 |
| Hover 预览在窄弹窗中遮挡内容 | 低 | 窄屏自动切换为下方弹出，添加边界检测 |
| 时间线数据量大影响渲染性能 | 低 | 限制最近 10 条，使用 DocumentFragment 批量插入 |
| 与现有 BookmarkOverview.render() 流程冲突 | 中 | 在现有区域之间插入新区域，不改变已有 DOM 结构 |

---

## 8. 验收清单

- [ ] AC1: 时间线 — 今日/本周/本月分组正确，空状态正常
- [ ] AC2: 快捷操作 — 4 个按钮功能可达，i18n 完整
- [ ] AC3: 复习卡片 — 到期时显示，无到期时隐藏，跳转复习正确
- [ ] AC4: 环形图 — SVG 渲染正确，动画流畅，比例准确
- [ ] AC5: Hover 预览 — 延迟触发、内容正确、窄屏适配
- [ ] AC6: 引导入口 — 两种状态正确切换，重置功能正常
- [ ] 测试 ≥ 36 用例全部通过
- [ ] 无外部依赖引入
- [ ] i18n 双语完整（zh-CN / en-US）
- [ ] 无障碍：新组件有 aria-label、键盘可达
- `exportCollection(bookmarks[], options)` 方法接收一组书签 + 导出选项
- 支持 3 种输出格式：
  - **JSON** (`format: 'json'`): 结构化数据，含元信息（集合名、描述、创建时间、书签数、版本号），可被 PageWise `importFromJSON()` 重新导入
  - **Markdown** (`format: 'markdown'`): 可读的文档格式，含分组标题、链接列表、标签行，适配 GitHub / 飞书 / Notion 等平台粘贴
  - **HTML** (`format: 'html'`): 自包含 HTML 页面（内联 CSS），可在浏览器中独立打开，包含卡片式布局展示书签信息（标题、URL、标签、状态、文件夹路径）
- 导出结果为纯字符串，由调用方决定如何保存（下载/复制/发送）
- 导出支持 `options.includeMetadata` 控制是否附加统计摘要（总书签数、领域分布、状态分布）

### AC2: 隐私过滤（Privacy Filter）
- `createPrivacyFilter(rules)` 创建隐私过滤器实例
- 内置过滤规则：
  - **域名黑名单**: 自动排除 `localhost`、`127.0.0.1`、`*.internal`、`*.local`、`chrome://`、`chrome-extension://` 等私有/内部域名
  - **URL 参数清理**: 移除跟踪参数（`utm_*`、`fbclid`、`gclid`、`ref`、`source` 等）
  - **敏感路径检测**: 标记含 `/admin`、`/dashboard`、`/settings`、`/account`、`/login` 的 URL 为潜在敏感
- 支持用户自定义规则：
  - `addBlockedDomain(domain)` — 添加域名黑名单条目（支持通配符 `*.example.com`）
  - `addBlockedPattern(pattern)` — 添加 URL 正则匹配黑名单
  - `addBlockedTags(tag[])` — 按标签排除书签
- `applyFilter(bookmarks[])` 返回 `{ filtered, blocked, summary }`：
  - `filtered`: 通过过滤的书签数组
  - `blocked`: 被拦截的书签数组（附带拦截原因）
  - `summary`: 过滤统计（总数/通过/拦截/清理参数数）
- 过滤规则可序列化为 JSON、可从 JSON 恢复，支持持久化到 `chrome.storage.local`

### AC3: 分享包生成（Share Package）
- `createSharePackage(bookmarks[], options)` 生成完整分享包对象
- 分享包数据结构：
  ```
  {
    version: 1,
    collection: { name, description, createdAt, bookmarkCount },
    bookmarks: [ { title, url, tags, folderPath, status, dateAdded } ],
    summary?: { domains, categories, readingProgress },
    exportedAt: ISO string,
    source: 'pagewise',
    privacy: { filteredCount, rulesApplied }
  }
  ```
- 分享包自动包含隐私过滤统计信息（告知接收者有多少条被过滤）
- 当 `bookmarks[]` 为空时返回空分享包（不抛异常），`collection.bookmarkCount = 0`

### AC4: 与 SmartCollections / ImportExport 集成
- `exportCollection(collectionId)` 可直接接受 BookmarkSmartCollections 的集合 ID，自动获取该集合的书签并导出
- 导出的 JSON 格式兼容 BookmarkImportExport 的 `importFromJSON()`，实现循环互操作
- 导出的 HTML 格式中包含"导入到 PageWise"的操作说明（告诉接收者如何使用 JSON 文件导入）

### AC5: 完整测试覆盖
- 单元测试覆盖所有公共 API 方法（≥ 25 个测试用例）
- 测试使用 `node:test` + `node:assert/strict`
- 测试需覆盖：
  - 三种格式导出完整性（JSON / Markdown / HTML）
  - 隐私过滤全部内置规则（域名黑名单、参数清理、敏感路径）
  - 隐私过滤自定义规则（域名通配符、正则、标签）
  - 空书签列表导出
  - 大量书签导出（100+ 条）
  - 分享包字段完整性校验
  - 过滤统计准确性
  - JSON 导出与 ImportExport 的互操作（round-trip）

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 纯 ES Module | `export class` 模式，与项目所有 lib 模块一致 |
| 零外部依赖 | 不引入任何第三方 npm 包（不使用 LZString 等压缩库） |
| 不依赖 Chrome API | 纯数据模块，不直接操作 DOM 或 chrome.* API，SmartCollections 通过构造函数注入（依赖反转） |
| 复用已有数据结构 | 输入书签格式与 BookmarkCollector (R43) 一致：`{ id, title, url, tags, folderPath, status, dateAdded }` |
| 复用 ImportExport | JSON 序列化/反序列化逻辑与 BookmarkImportExport (R61) 的格式保持兼容 |
| XSS 安全 | HTML 导出中所有用户输入字段（title、url、tags）必须 `escapeHtml()`，防止注入 |
| 性能预算 | `exportCollection()` < 100ms（1000 条书签，纯字符串拼接）；`applyFilter()` < 50ms（1000 条） |
| 内存预算 | 不缓存导出结果（每次调用实时生成）；过滤规则集 < 10KB |
| 纯前端架构 | 不使用服务端、不生成真实短链接——分享通过文件下载/剪贴板复制实现 |
| 无网络依赖 | 全部功能离线可用 |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块 | 文件 | 状态 | 依赖方式 |
|------|------|------|----------|
| BookmarkCollector (R43) | `lib/bookmark-collector.js` | ✅ 已实现 | 复用标准化书签对象格式 `{ id, title, url, tags, folderPath, status, dateAdded }` |
| BookmarkImportExport (R61) | `lib/bookmark-io.js` | ✅ 已实现 | JSON 导出格式兼容，`importFromJSON()` 可导入本模块导出的 JSON |
| BookmarkSmartCollections (R75) | `lib/bookmark-smart-collections.js` | ✅ 已实现 | 可选注入；接受集合 ID 自动获取书签；通过构造函数注入 `smartCollections` 实例 |
| BookmarkContentPreview (R64) | `lib/bookmark-preview.js` | ✅ 可选 | HTML 导出中调用 `generateTextPreview()` 生成书签摘要卡片 |
| BookmarkClusterer (R53) | `lib/bookmark-clusterer.js` | ✅ 可选 | `options.summary` 中注入领域分布统计 |
| BookmarkStatus (R58) | `lib/bookmark-status.js` | ✅ 隐式 | 书签对象的 `status` 字段用于分享包中展示阅读状态 |

### 下游消费者（输出）

| 模块 | 使用方式 |
|------|----------|
| BookmarkImportExport (R61) | JSON 分享包可通过 `importFromJSON()` 重新导入 PageWise |
| BookmarkOptionsPage (R51) | 选项页"分享"按钮：选中书签/集合 → 调用本模块导出 → 下载文件 |
| BookmarkDetailPanel (R47) | 单个书签详情页"分享此书签"按钮（导出单条书签的 JSON/Markdown） |
| BookmarkPopup (R50) | 弹窗概览区"分享集合"快捷入口 |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| 文件下载机制 | 调用方使用 `URL.createObjectURL()` + `<a download>` 或 `chrome.downloads` API 触发下载 |
| 剪贴板 API | 调用方使用 `navigator.clipboard.writeText()` 复制 Markdown/JSON 到剪贴板 |
| chrome.storage.local | 隐私规则持久化（由调用方负责读写，模块只提供序列化/反序列化） |

---

## 5. 数据模型

```javascript
// ===================== 输入 =====================

// 书签对象（来自 BookmarkCollector R43 标准化格式）
{
  id: string,
  title: string,
  url: string,
  tags: string[],
  folderPath: string[],
  status: 'unread' | 'reading' | 'read',
  dateAdded: number           // timestamp ms
}

// 导出选项
ExportOptions = {
  format: 'json' | 'markdown' | 'html',   // 输出格式（默认 'json'）
  collectionName: string,                   // 集合名称（默认 'Untitled'）
  collectionDescription: string,            // 集合描述（默认 ''）
  includeMetadata: boolean,                 // 是否附加统计摘要（默认 true）
  privacyFilter: PrivacyFilter | null,      // 隐私过滤器（默认 null = 不过滤）
  preview: Function | null                  // 可选的书签预览函数（来自 BookmarkContentPreview）
}

// ===================== 隐私过滤 =====================

// 过滤规则集（可序列化）
PrivacyRules = {
  blockedDomains: string[],      // 域名黑名单 ['*.internal', 'localhost']
  blockedPatterns: string[],     // URL 正则黑名单 ['/admin', '/login']
  blockedTags: string[],         // 标签黑名单 ['private', 'internal']
  stripParams: string[]          // 要清理的 URL 参数 ['utm_*', 'fbclid', 'ref']
}

// 过滤结果
FilterResult = {
  filtered: Bookmark[],          // 通过的书签
  blocked: Array<{               // 被拦截的书签
    bookmark: Bookmark,
    reason: string               // 拦截原因（如 'blocked_domain', 'sensitive_path', 'blocked_tag'）
  }>,
  cleaned: number,               // URL 参数被清理的书签数
  summary: {
    total: number,
    passed: number,
    blocked: number,
    cleaned: number
  }
}

// ===================== 输出 =====================

// 分享包
SharePackage = {
  version: number,               // 格式版本（= 1）
  collection: {
    name: string,
    description: string,
    createdAt: string,           // ISO 日期
    bookmarkCount: number
  },
  bookmarks: Bookmark[],         // 过滤后的书签数组
  summary?: {                    // 当 includeMetadata=true 时存在
    domains: Array<{ domain: string, count: number }>,
    categories: Array<{ category: string, count: number }>,
    readingProgress: { unread: number, reading: number, read: number }
  },
  exportedAt: string,            // ISO 时间戳
  source: 'pagewise',
  privacy: {
    filteredCount: number,       // 被隐私过滤器拦截的书签数
    cleanedCount: number,        // URL 参数被清理的书签数
    rulesApplied: boolean        // 是否应用了隐私过滤
  }
}
```

---

## 6. API 概览

```javascript
export class BookmarkSharing {
  /**
   * @param {Object} opts
   * @param {Object} [opts.smartCollections] — BookmarkSmartCollections 实例（可选）
   * @param {Function} [opts.previewFn] — 书签预览函数（来自 BookmarkContentPreview，可选）
   */
  constructor({ smartCollections, previewFn } = {}) {}

  // ====== 核心导出 ======

  /** 导出书签集合为指定格式字符串 */
  exportCollection(bookmarks, options) → string

  /** 从 SmartCollections ID 导出（自动获取集合书签） */
  exportSmartCollection(collectionId, options) → string

  // ====== 隐私过滤 ======

  /** 创建隐私过滤器 */
  createPrivacyFilter(rules?) → PrivacyFilter

  // ====== 分享包 ======

  /** 生成完整分享包对象 */
  createSharePackage(bookmarks, options) → SharePackage

  /** 将 SharePackage 序列化为 JSON 字符串 */
  serializePackage(pkg) → string

  /** 从 JSON 字符串反序列化 SharePackage */
  deserializePackage(json) → SharePackage | null
}

export class PrivacyFilter {
  constructor(rules?) {}

  /** 添加域名黑名单 */
  addBlockedDomain(domain) → void

  /** 添加 URL 正则黑名单 */
  addBlockedPattern(pattern) → void

  /** 添加标签黑名单 */
  addBlockedTags(tags) → void

  /** 应用过滤 */
  applyFilter(bookmarks) → FilterResult

  /** 序列化规则为 JSON */
  serialize() → string

  /** 从 JSON 恢复规则 */
  static deserialize(json) → PrivacyFilter
}
```

---

## 7. 非功能需求

| 项目 | 要求 |
|------|------|
| 导出性能 | `exportCollection()` < 100ms（1000 条书签） |
| 过滤性能 | `applyFilter()` < 50ms（1000 条书签） |
| HTML 自包含 | 导出 HTML 文件可独立在浏览器中打开，所有 CSS 内联，无外部资源引用 |
| XSS 安全 | HTML 输出中所有动态内容经 `escapeHtml()` 转义 |
| JSON 互操作 | 导出 JSON 可被 `BookmarkImportExport.importFromJSON()` 正确导入 |
| 空数据兼容 | 0 条书签时不抛异常，返回空导出/空分享包 |
| Markdown 可读性 | Markdown 输出可直接粘贴到 GitHub README / 飞书文档 / Notion |
| 文件大小 | 100 条书签的 HTML 导出 < 50KB |
| 隐私默认安全 | 默认内置规则覆盖常见内部域名，用户无需手动配置 |

---

## 8. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/bookmark-sharing.js` | **新建** | 核心模块：BookmarkSharing 类 + PrivacyFilter 类 |
| `tests/test-bookmark-sharing.js` | **新建** | 单元测试（≥ 25 用例，node:test） |
| `docs/CHANGELOG.md` | **修改** | 新增 R76 条目 |
| `docs/TODO.md` | **修改** | 标记 R76 状态为 ✅ |

---

## 9. 设计决策与理由

### Q1: 为什么不生成短链接/分享 URL？
**决策**: 不使用服务端短链接。
**理由**: PageWise 是本地优先架构，引入后端违背产品定位。分享通过文件下载 + 剪贴板复制实现，与 Obsidian 的分享模式一致。

### Q2: 为什么不支持图片/二维码分享？
**决策**: R76 不做图片导出。
**理由**: 图片生成需要 Canvas 渲染（与 BookmarkVisualizer 共用），复杂度上升。R76 聚焦数据层导出，UI 渲染由调用方（选项页/popup）负责。

### Q3: 为什么 JSON 要兼容 ImportExport 格式？
**理由**: 实现"分享→导入"闭环——同事收到 JSON 文件后，可直接在自己的 PageWise 中导入，无需额外适配。

### Q4: 为什么需要 PrivacyFilter 作为独立类？
**理由**: 隐私过滤是通用能力，不仅用于分享，还可被 BookmarkImportExport (R61) 的 `exportJSON()` 复用。独立类方便测试和扩展。

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-11 | R76 | 初始创建 — BookmarkSharing 需求文档 |
