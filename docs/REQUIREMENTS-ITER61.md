# 需求文档 — R163: 间隔复习系统 SpacedRepetition

> 版本: 1.0
> 日期: 2026-05-19
> 迭代: Phase S — 产品体验升级 (R61)
> 复杂度: Complex

---

## 1. 背景与动机

PageWise 用户在日常浏览中积累了大量书签和知识条目，但缺乏**主动回顾机制**，导致知识随时间遗忘。现有的 `ReviewSession` 模块仅管理单次复习会话的生命周期（start → recordCard → finish），缺少**长期复习调度引擎**——即"何时复习什么"的核心决策逻辑。

本需求将 R015（P2 级"学习模式——间隔重复"）从规划阶段推进至实现，建立完整的间隔复习闭环：**纳入队列 → 智能调度 → 复习交互 → 统计追踪 → 提醒推送**。

---

## 2. 用户故事

**US-1 (核心):**
作为一名技术学习者，我希望系统根据遗忘曲线自动安排复习计划，这样我可以在最佳时间点回顾已学知识，避免遗忘。

**US-2 (复习交互):**
作为一名用户，我希望复习时看到书签的摘要内容，并通过选择"Again / Hard / Good / Easy"来评估记忆强度，系统据此调整下次复习时间。

**US-3 (统计与激励):**
作为一名用户，我希望看到今日待复习数、连续打卡天数和记忆保持率，以此保持学习动力。

**US-4 (提醒):**
作为一名用户，我希望每天收到"今日待复习"的推送提醒，而不需要主动去查看复习列表。

---

## 3. 验收标准

### AC-1: 复习队列管理
- 将状态为 `read` 的书签和知识条目自动纳入复习队列
- 新增条目默认加入队列；状态变更为 `unread` 或被删除时自动移除
- 队列持久化到 `chrome.storage.local`，重启后不丢失

### AC-2: SM-2 调度算法
- 实现标准 SM-2 间隔调整公式：
  - 评级 `Again`（quality=1）: 重置间隔为 1 天，easeFactor 不变
  - 评级 `Hard`（quality=2）: 间隔 × 1.2，easeFactor − 0.15
  - 评级 `Good`（quality=3）: 间隔 × easeFactor，easeFactor 不变
  - 评级 `Easy`（quality=4）: 间隔 × easeFactor × 1.3，easeFactor + 0.15
- easeFactor 下限 1.3，首次默认 2.5
- 默认间隔序列: 1d → 3d → 7d → 14d → 30d（首次 Good 评级）
- `getDueItems()` 返回当天及之前到期的待复习列表，按优先级排序

### AC-3: 复习交互
- `reviewItem(itemId, quality)` 接受评级（1-4），更新 SM-2 参数，计算下次复习时间
- 每次复习记录写入历史（itemId, quality, reviewDate, interval, easeFactor）
- 支持单次会话连续复习多个条目

### AC-4: 复习统计
- `getTodayDueCount()`: 当日待复习条目数
- `getStreak()`: 连续打卡天数（每天至少完成 1 次复习计为打卡）
- `getRetentionRate(days?)`: 最近 N 天的记忆保持率（quality ≥ 3 的比例，默认 30 天）
- `getReviewHistory(itemId?)`: 单条目或全局复习历史

### AC-5: 通知联动
- 通过 `NotificationManager.notify()` 推送"今日待复习"提醒
- 通知类型: 复用 `info` 类型，消息格式: `"今日有 N 条内容待复习"`
- 提供 `checkAndNotify()` 方法供外部定时调用（如 background service worker 每日触发）

### AC-6: 测试覆盖
- 单元测试 ≥ 30 用例
- 覆盖: SM-2 公式正确性、边界条件（easeFactor 下限、间隔溢出）、队列 CRUD、统计计算、通知触发、持久化读写

---

## 4. 技术约束

| 约束项 | 说明 |
|--------|------|
| **模块规范** | 纯 ES Module，工厂函数注入依赖（storage、notificationManager），不直接引用 `chrome.*` 全局对象 |
| **文件上限** | 新建文件 `lib/bookmark-spaced-repetition.js` ≤ 400 行；若超限则拆分（如 `bookmark-spaced-repetition-core.js` + `bookmark-spaced-repetition-stats.js`） |
| **数据结构** | 复习卡片 schema: `{ id, nextReview: timestamp, interval: days, easeFactor: float, repetitions: number, lastReview: timestamp }` |
| **持久化** | 使用 `chrome.storage.local`（与 ReviewSession 一致），key: `pagewise_spaced_repetition_cards` |
| **无外部依赖** | 不引入第三方库（如 `supermemo` npm 包），SM-2 算法自行实现 |
| **向后兼容** | 不修改 `review-session.js` 现有 API；新模块作为上层调度器独立运作 |
| **性能** | 1000+ 书签场景下 `getDueItems()` 响应 < 50ms |
| **i18n** | 复习界面字符串需支持中英文（复用 `bookmark-i18n.js` 注册机制） |

---

## 5. 依赖关系

### 5.1 上游依赖（本模块消费）

| 模块 | 依赖方式 | 说明 |
|------|----------|------|
| `bookmark-status.js` | 查询 `read` 状态书签 | 确定哪些书签可纳入复习队列 |
| `bookmark-preview.js` | 调用 `generateTextPreview()` | 复习时展示书签摘要 |
| `bookmark-notifications.js` | 调用 `NotificationManager.notify()` | 推送"今日待复习"提醒 |
| `review-session.js` | 数据层复用 | 参考其 quality 评分语义（≥3 为正确）保持一致 |
| `bookmark-learning-progress.js` | streak 数据共享 | 连续打卡天数可与学习进度 streak 互通 |

### 5.2 下游消费者（依赖本模块）

| 模块 | 依赖方式 | 说明 |
|------|----------|------|
| `popup/bookmark-overview.js` (R166) | 读取 `getTodayDueCount()` | 弹窗展示待复习提醒卡片 |
| `sidebar.js` / 书签面板 | 调用复习 API | 侧边栏内嵌复习界面 |
| `background service worker` | 调用 `checkAndNotify()` | 每日定时触发复习提醒 |

### 5.3 与现有模块的关系

```
┌─────────────────────────┐
│  BookmarkStatusManager  │ ← 提供 read 状态书签列表
│  (bookmark-status.js)   │
└───────────┬─────────────┘
            │ read 书签
            ▼
┌─────────────────────────┐
│  SpacedRepetition        │ ← **本模块 (R163)**
│  (bookmark-spaced-      │    SM-2 调度 + 队列管理
│   repetition.js)        │
└──┬────────┬───────┬─────┘
   │        │       │
   ▼        ▼       ▼
┌──────┐ ┌──────────────┐ ┌───────────────────┐
│Review│ │ContentPreview│ │NotificationManager│
│Session│ │(摘要展示)    │ │(复习提醒推送)     │
└──────┘ └──────────────┘ └───────────────────┘
```

---

## 6. SM-2 算法规格

### 6.1 核心公式

```
IF quality < 3:
    interval = 1
    repetitions = 0
ELSE:
    IF repetitions == 0: interval = 1
    IF repetitions == 1: interval = 3
    IF repetitions >= 2: interval = round(interval * easeFactor)
    repetitions += 1

easeFactor = easeFactor + (0.1 - (4 - quality) * (0.08 + (4 - quality) * 0.02))
easeFactor = max(easeFactor, 1.3)

nextReview = now + interval * 86400000  (毫秒)
```

### 6.2 评级映射

| 用户评级 | quality 值 | 含义 | 行为 |
|----------|-----------|------|------|
| Again | 1 | 完全遗忘 | 重置间隔至 1 天 |
| Hard | 2 | 勉强记住 | 间隔 × 1.2 |
| Good | 3 | 正常回忆 | 间隔 × easeFactor |
| Easy | 4 | 轻松回忆 | 间隔 × easeFactor × 1.3，easeFactor 提升 |

### 6.3 默认参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| initialInterval | 1 (天) | 首次复习间隔 |
| defaultEaseFactor | 2.5 | 初始 EF 值 |
| minEaseFactor | 1.3 | EF 下限 |
| maxInterval | 365 (天) | 最大间隔（防止间隔无限增长） |

---

## 7. API 设计预览

> 注: 以下仅为需求层 API 契约，非最终实现代码。

```javascript
class SpacedRepetition {
  // — 队列管理 —
  addToQueue(bookmark)              // 纳入复习队列
  removeFromQueue(bookmarkId)       // 从队列移除
  getDueItems(date?)                // 获取到期待复习列表
  getQueueSize()                    // 队列总数

  // — 复习操作 —
  reviewItem(bookmarkId, quality)   // 提交评级 (1-4)

  // — 统计查询 —
  getTodayDueCount()                // 今日待复习数
  getStreak()                       // 连续打卡天数
  getRetentionRate(days?)           // 记忆保持率 (0-100)
  getReviewHistory(bookmarkId?)     // 复习历史

  // — 通知 —
  checkAndNotify()                  // 检查并推送待复习提醒
}
```

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 复习队列随时间无限增长 | 存储膨胀、查询变慢 | 限制队列最大 5000 条；已复习间隔 >365 天的条目可选择归档 |
| chrome.storage.local 读写性能 | 大队列场景写入卡顿 | 写入节流（debounce 300ms）；增量更新而非全量覆写 |
| SM-2 参数越界（EF < 1.3） | 算法行为异常 | easeFactor 强制下限 1.3；单元测试覆盖边界值 |
| ReviewSession quality 语义不一致 | 数据混乱 | 复用 ReviewSession 的 quality 1-4 语义，≥3 为正确 |
| 用户未使用复习功能导致 streak 中断 | 统计无意义 | streak 仅统计有复习行为的天数；提供"跳过今日"选项 |

---

## 9. 非目标（Out of Scope）

- ❌ 间隔复习的 UI 面板实现（由 R166 PopupExperienceOpt 负责）
- ❌ 卡片式正面/背面翻转动画（未来增强）
- ❌ 与 Anki 等外部工具的数据导入导出
- ❌ AI 自动生成复习问题（未来可探索）
- ❌ 修改 `review-session.js` 现有 API

---

## 10. 测试策略

| 测试类别 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| SM-2 核心算法 | 8 | 各评级场景、EF 上下限、连续复习间隔递增、Again 重置 |
| 队列 CRUD | 6 | 添加/移除/查询/去重/持久化/队列上限 |
| 复习操作 | 5 | reviewItem 正常/边界/历史记录/重复复习 |
| 统计计算 | 5 | dueCount/streak/retentionRate/history |
| 通知联动 | 3 | checkAndNotify 有待复习/无待复习/参数校验 |
| 边界与异常 | 3+ | 空队列/无效 ID/无效 quality/storage 读写失败 |
| **合计** | **≥30** | |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-19 | R163 | 新建间隔复习系统 SpacedRepetition 需求文档 |
