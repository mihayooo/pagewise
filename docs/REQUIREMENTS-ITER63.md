# 需求文档 — R165: 学习周报生成 WeeklyDigest

> 版本: 1.0
> 日期: 2026-05-19
> 迭代: Phase S — 产品体验升级 (R63)
> 复杂度: Medium

---

## 1. 背景与动机

### 1.1 现状分析

PageWise 用户在日常浏览中持续积累书签、提问 AI、生成知识条目，但缺乏**周期性回顾机制**来审视自己的学习全貌。现有模块能力如下：

| 维度 | 现有能力 | 缺失 |
|------|----------|------|
| **数据统计** | `BookmarkAnalytics` 提供总量概览；`BookmarkAnalyticsAdvanced` 提供访问/趋势/域名分布/热力图 | 无"本周"时间窗口的聚合统计，无跨模块（书签+问答+知识）的联合分析 |
| **知识盲区** | `BookmarkGapDetector` 可识别覆盖度等级（充分/一般/不足/盲区）并推荐补充方向 | 无纵向对比（上周 vs 本周），无法判断用户是否在"进步" |
| **学习路径** | `learning-path.js` 可基于知识库内容生成 AI 学习路线图 | 缺少与时间周期的联动（如"根据本周学习情况，推荐下周方向"） |
| **复习统计** | `BookmarkSpacedRepetition` 提供待复习数/打卡天数/保持率 | 未纳入周报维度的综合呈现 |
| **通知推送** | `NotificationManager` 支持 info/warning/expired/duplicate/update 类型通知 | 无周期性摘要通知，用户需要主动查看才能了解学习进展 |

### 1.2 竞品差距

参考市场分析，当前主流学习工具（Notion、Obsidian、Readwise）均提供周期性学习回顾功能。PageWise 作为"浏览即学习"工具，用户的学习行为天然分散在日常浏览中，**更需要**自动化的周期性摘要来帮助用户建立学习节奏感。这是现有工具空白区域"知识积累 + AI 理解的闭环"的自然延伸。

### 1.3 目标

新建 `lib/bookmark-weekly-digest.js`，自动聚合用户每周学习数据，生成结构化周报，识别重点领域与薄弱环节，推荐下周学习方向，并通过通知系统在每周一自动推送。

---

## 2. 用户故事

**US-1 (每周回顾):**
作为一名技术学习者，我希望每周一自动收到一份学习周报，了解自己本周新增了多少书签、完成了多少阅读、提了多少问题，而不需要手动翻查统计数据。

**US-2 (领域分析):**
作为一名多方向学习的用户，我希望周报能按技术领域（前端/后端/AI 等）分析我的学习分布，帮我发现自己花了太多时间在哪些领域、忽略了哪些领域。

**US-3 (进步追踪):**
作为一名持续学习的用户，我希望周报能和上周对比，看到自己的学习趋势是上升还是下降，薄弱领域是否有所改善。

**US-4 (下周规划):**
作为一名有目标的学习者，我希望周报根据我的薄弱领域和学习路径，推荐下周应重点学习的方向，减少"不知道学什么"的决策负担。

**US-5 (存档分享):**
作为一名习惯整理笔记的用户，我希望把周报导出为 Markdown 或 HTML 格式，方便存档到笔记工具或分享给同事。

---

## 3. 验收标准

### AC-1: 周度数据聚合统计

- `generateWeeklyStats(weekStartDate?)` 方法聚合以下维度的本周数据：
  - **新增书签数**: `dateAdded` 在本周时间窗口内的书签数量
  - **阅读完成数**: 状态变更为 `read` 的书签数量（本周内 `lastStatusChange` 落在窗口内）
  - **AI 提问次数**: 本周内发起的 AI 问答次数（从 `ConversationStore` 或问答日志中统计）
  - **知识条目增长**: 本周内新增的知识条目数量
  - **复习完成数**: 本周内完成的复习次数（从 `BookmarkSpacedRepetition.getReviewHistory()` 统计）
  - **活跃天数**: 本周内有学习行为（任一上述维度 > 0）的天数
- 默认时间窗口: 本周一 00:00 ~ 当前时刻（或上周一~上周日，用于已结束周）
- `weekStartDate` 参数支持指定任意周的起始日期，格式为 timestamp
- 所有统计为纯计算，无副作用

### AC-2: 领域分布分析

- `analyzeDomainDistribution(bookmarks, weekBookmarks)` 方法生成领域维度的周报数据：
  - 本周各领域新增书签数及占比
  - 本周重点领域（新增数 Top-3 领域）
  - 本周薄弱领域（新增数为 0 且整体覆盖度为 "weak"/"gap" 的领域）
- 领域识别复用 `BookmarkGapDetector` 的 `DOMAIN_CATALOG` 和标签→领域映射逻辑
- 生成文字报告（中文），格式示例：
  ```
  📊 本周学习领域分布:
  - 前端: 5 篇 (42%) ← 重点领域
  - AI/ML: 3 篇 (25%)
  - 后端: 2 篇 (17%)
  - 数据库: 1 篇 (8%)
  - 安全: 0 篇 ⚠️ 薄弱领域
  - DevOps: 0 篇 ⚠️ 薄弱领域
  ```

### AC-3: 知识盲区识别与对比

- 调用 `BookmarkGapDetector.detectGaps()` 获取当前领域覆盖度
- 与上周快照（如有）对比，生成变化趋势：
  - 领域覆盖度升级（如 "weak" → "moderate"）标记为 ✅ 进步
  - 领域覆盖度降级（如 "well-covered" → "moderate"）标记为 ⚠️ 退步
  - 新增盲区标记为 🆕
- 无上周快照时，仅展示当前状态，不做对比

### AC-4: 下周学习推荐

- `generateRecommendations(gaps, weeklyStats)` 方法基于以下输入生成推荐：
  - 知识盲区检测结果（来自 `BookmarkGapDetector`）
  - 本周学习统计（薄弱领域优先推荐）
  - 学习路径建议（调用 `learning-path.js` 的 `buildTopicStats()` 获取主题分布，推断下一步）
- 推荐输出为结构化数组 `[{ area, reason, suggestedTopics[] }]`，最多 5 条
- 推荐逻辑为纯规则引擎，**不调用 AI API**（保持离线可用、无额外成本）
  - 规则 1: 盲区领域 → 推荐入门主题（复用 `DOMAIN_CATALOG` 的 `entryTopics`）
  - 规则 2: 薄弱且本周未涉及 → 推荐进阶主题（复用 `advancedTopics`）
  - 规则 3: 重点领域本周投入过多（> 40%）且存在盲区 → 建议分散精力
- 生成中文文字摘要，格式示例：
  ```
  🎯 下周学习建议:
  1. [安全] 您的知识盲区，建议从 HTTPS 原理、OAuth 2.0 入门 开始
  2. [DevOps] 覆盖不足，推荐 Docker 入门、CI/CD 概念
  3. [数据库] 本周投入较少，可关注索引优化、NoSQL 实践
  ```

### AC-5: 通知推送

- `notifyWeeklyDigest(notificationManager)` 方法通过 `NotificationManager.notify()` 推送周报摘要
- 通知类型: 复用 `info` 类型
- 通知内容格式: `"📊 本周学习周报: 新增 X 篇书签, 完成 Y 篇阅读, Z 次提问。重点领域: {top-1 domain}"`
- 提供 `checkAndNotify(notificationManager, storage)` 方法供外部定时调用:
  - 检查本周是否已推送（`storage` 中记录 `last_weekly_digest_push` 时间戳）
  - 仅在周一 00:00 后且本周未推送时发送
  - 推送后更新 `last_weekly_digest_push` 时间戳
- 推送失败静默处理，不影响主流程

### AC-6: 周报导出

- `exportToMarkdown(digest)` 方法将完整周报导出为 Markdown 格式:
  - 标题含日期范围（如 `# 学习周报 (2026-05-11 ~ 2026-05-17)`）
  - 含统计概览、领域分布、盲区分析、下周建议四个章节
  - 数据表格使用 Markdown table 语法
- `exportToHTML(digest)` 方法将周报导出为自包含 HTML:
  - 内联 CSS 样式，可直接在浏览器打开
  - 使用 PageWise 主题色（从 `bookmark-dark-theme.js` 参考配色方案）
  - 支持打印友好布局（`@media print`）
- 导出方法为纯函数，不依赖 DOM 或 chrome API

### AC-7: 周报快照存储

- 每次生成周报后，将完整 `digest` 对象存入 `chrome.storage.local`
- 存储 key: `pagewise_weekly_digest_history`
- 保留最近 **12 周**的快照（滚动窗口，超出时删除最旧条目）
- `getHistory()` 方法返回所有存储的周报快照，按时间倒序
- `getPreviousWeekDigest()` 方法返回上一周的快照（用于 AC-3 的趋势对比）

### AC-8: 测试覆盖

- 单元测试 ≥ 25 用例
- 覆盖:
  - 周度统计聚合（空数据、单条数据、跨天数据、指定日期窗口）
  - 领域分布分析（各领域占比计算、Top-3 排序、薄弱领域识别）
  - 知识盲区对比（有/无上周快照、覆盖度升降、新增盲区）
  - 推荐生成（盲区推荐、薄弱推荐、精力分散建议、空数据兜底）
  - 通知推送（已推送去重、未推送触发、推送内容格式）
  - 导出格式（Markdown 结构完整性、HTML 自包含性、特殊字符转义）
  - 快照存储（滚动窗口裁剪、历史查询、时间排序）

---

## 4. 技术约束

| 约束项 | 说明 |
|--------|------|
| **模块规范** | 纯 ES Module，工厂函数注入依赖（`storage`、`notificationManager`），不直接引用 `chrome.*` 全局对象 |
| **文件上限** | 新建文件 `lib/bookmark-weekly-digest.js` ≤ 400 行；若超限则拆分（如 `bookmark-weekly-digest-stats.js` + `bookmark-weekly-digest-export.js`） |
| **无 AI 调用** | 周报生成全程离线，不调用 AI API（推荐逻辑为规则引擎，文字模板为静态拼接） |
| **依赖注入** | 通过构造函数注入 `BookmarkGapDetector` 实例、`BookmarkSpacedRepetition` 实例、`BookmarkAnalytics` 引用；不直接 import 实例化 |
| **时间窗口** | 周起始日为**周一**（ISO 8601），使用 UTC+8 时区（与用户主要分布一致），时间比较精度到毫秒 |
| **数据结构** | digest schema: `{ weekStart: timestamp, weekEnd: timestamp, stats: WeeklyStats, domainDistribution: DomainReport[], gapComparison: GapComparison[], recommendations: Recommendation[], generatedAt: timestamp }` |
| **持久化** | 使用 `chrome.storage.local`，key: `pagewise_weekly_digest_history`，单条 digest 序列化后预计 ≤ 5KB，12 周总计 ≤ 60KB |
| **向后兼容** | 不修改任何现有模块的公开 API，仅新增模块 |
| **测试框架** | 与项目现有测试框架一致（Vitest），测试文件: `tests/test-bookmark-weekly-digest.js` |

---

## 5. 依赖关系

### 5.1 上游依赖（本模块使用的模块）

| 模块 | 依赖方式 | 使用的 API |
|------|----------|-----------|
| `lib/bookmark-analytics.js` | 注入 `BookmarkAnalytics` 类引用 | `getOverview(bookmarks)` — 总量概览 |
| `lib/bookmark-analytics-advanced.js` | 注入引用 | `getDomainDistribution(bookmarks)` — 域名分布 |
| `lib/bookmark-gap-detector.js` | 注入 `BookmarkGapDetector` 实例 | `detectGaps()` — 知识盲区检测；`DOMAIN_CATALOG` — 领域定义与关联 |
| `lib/learning-path.js` | 注入引用 | `buildTopicStats(entries)` — 主题统计（用于推荐生成的输入） |
| `lib/bookmark-spaced-repetition.js` | 注入 `BookmarkSpacedRepetition` 实例 | `getReviewHistory()` — 本周复习记录；`getStats()` — 复习统计 |
| `lib/bookmark-notifications.js` | 注入 `NotificationManager` 实例 | `notify(message, type)` — 推送周报摘要 |

### 5.2 下游依赖（使用本模块的模块）

| 模块 | 依赖方式 | 说明 |
|------|----------|------|
| Background Service Worker | 定时调用 `checkAndNotify()` | 通过 `chrome.alarms` API 设置每周一触发 |
| Sidebar UI (可选) | 调用 `generateWeeklyDigest()` + `exportToMarkdown/HTML()` | 展示周报 + 导出按钮 |

### 5.3 数据依赖

| 数据源 | 来源 | 用途 |
|--------|------|------|
| 书签列表 | `chrome.storage.local`（现有书签数据） | 统计新增数、阅读数、领域分布 |
| 知识条目 | IndexedDB（现有知识库） | 统计条目增长、主题分析 |
| 问答记录 | `ConversationStore`（AI 问答日志） | 统计提问次数 |
| 复习历史 | `chrome.storage.local`（`pagewise_bookmark_review_queue`） | 统计复习完成数 |
| 领域目录 | `DOMAIN_CATALOG`（`bookmark-gap-detector.js` 内部常量） | 领域识别与映射 |

---

## 6. 模块 API 设计（概要）

```
class BookmarkWeeklyDigest {
  constructor({ storage, notificationManager, gapDetector, analytics, spacedRepetition, learningPath })
  
  // 核心生成
  generateWeeklyDigest(weekStartDate?)    → Digest
  
  // 子模块（可独立使用）
  generateWeeklyStats(weekStartDate?)     → WeeklyStats
  analyzeDomainDistribution()              → DomainReport[]
  generateRecommendations(gaps, stats)    → Recommendation[]
  
  // 通知
  checkAndNotify()                         → boolean
  notifyWeeklyDigest()                     → ManagedNotification
  
  // 导出
  exportToMarkdown(digest)                → string
  exportToHTML(digest)                    → string
  
  // 历史
  getHistory()                            → Digest[]
  getPreviousWeekDigest()                 → Digest | null
  saveSnapshot(digest)                    → void
}
```

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 问答记录数据不完整（ConversationStore 可能未持久化所有问答） | 中 | 统计偏低 | 允许统计值为 0 或 undefined，在报告中标注"数据不足" |
| `DOMAIN_CATALOG` 无法覆盖所有书签领域 | 低 | 部分书签归类为"未分类" | 新增"其他"分类兜底，不影响已有逻辑 |
| chrome.storage.local 存储限制（5MB 总量） | 低 | 12 周快照可能无法保存 | 单条 digest 压缩后预计 ≤ 5KB，总计 60KB，远低于限制；超出时自动裁剪最旧条目 |
| 推送时机依赖 `chrome.alarms` 精度 | 低 | 推送延迟 | `checkAndNotify()` 采用幂等设计，延迟推送不影响正确性 |
| 400 行限制可能不够（统计 + 分析 + 导出 + 推荐） | 中 | 需要拆分文件 | 预留拆分方案：stats (聚合/对比) + export (MD/HTML) + core (主类/推荐/通知) |

---

## 8. 里程碑

| 阶段 | 内容 | 预计产出 |
|------|------|----------|
| M1 | 数据聚合层 | `generateWeeklyStats()` + `analyzeDomainDistribution()` |
| M2 | 分析与推荐层 | `generateRecommendations()` + 知识盲区对比逻辑 |
| M3 | 输出层 | `exportToMarkdown()` + `exportToHTML()` + `checkAndNotify()` |
| M4 | 存储与集成 | 快照存储 + `getHistory()` + 单元测试 ≥ 25 用例 |

---

## 附录: 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R165 | 新建 WeeklyDigest 学习周报需求 |
