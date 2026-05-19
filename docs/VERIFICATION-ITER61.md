# VERIFICATION.md — Iteration #61 Review

> 审查日期: 2026-05-19
> 审查对象: R163 间隔复习系统 SpacedRepetition
> 审查文件: `lib/bookmark-spaced-repetition.js` (528 行) + `tests/test-bookmark-spaced-repetition.js` (490 行)

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ✅ | 需求 6 项全部实现：复习队列、SM-2 间隔调度、四档评级、复习统计、通知联动、序列化 |
| 代码质量 | ⚠️ | 1 个无用导入、1 处死代码分支、1 个 spread 覆写风险、文件 528 行略超 400 行约定 |
| 测试覆盖 | ✅ | 43 用例全通过（≥30 要求），覆盖构造/队列/到期/复习/统计/streak/通知/序列化/边界 |
| 文档同步 | ✅ | CHANGELOG.md 有 R163 条目，TODO.md R163 标记 [x]，IMPLEMENTATION.md 有完整记录 |

---

## 发现的问题

### BUG-1: `sendDailyReminder` spread 覆写风险 (Medium)

**位置**: `lib/bookmark-spaced-repetition.js:357`

```js
return { sent: true, ...result };
```

如果 `notifier.sendReviewReminder()` 返回 `{ sent: false, reason: 'xxx' }`，spread 会将 `sent` 从 `true` 覆写为 `false`，导致调用方误判提醒未发送。

**建议修复**:
```js
return { sent: true, count: dueCount, ...result };
// 或明确分离: const { sent: _sent, ...rest } = result; return { sent: true, ...rest };
```

---

### CODE-1: 未使用的导入 `initializeReviewData` (Low)

**位置**: `lib/bookmark-spaced-repetition.js:20`

```js
import { calculateNextReview, initializeReviewData, DIFFICULTY_MAP } from './spaced-repetition.js';
```

`initializeReviewData` 已导入但从未调用（`addToQueue` 在第 99-106 行内联定义了初始数据）。ESLint 正确报告 `no-unused-vars` 警告。

**建议修复**: 移除未使用的导入，或在 `addToQueue` 中使用 `initializeReviewData()` 替代内联初始化（更利于复用上游默认值）。

---

### CODE-2: `_formatReviewStatus` 死代码分支 (Low)

**位置**: `lib/bookmark-spaced-repetition.js:470`

```js
const dayLabel = entry.interval === 1 ? '天' : '天';
```

三元表达式两个分支结果完全相同（都是 `'天'`），条件判断无意义。推测原意可能是单复数区分（如英文 `day` vs `days`），但中文无需区分。

**建议修复**: 简化为 `const dayLabel = '天';` 或直接移除变量：
```js
return `第${entry.repetitions}次复习 · 间隔${entry.interval}天 · EF=${entry.easeFactor}`;
```

---

### CODE-3: `_updateStreak` 使用 UTC 日期 (Low)

**位置**: `lib/bookmark-spaced-repetition.js:435`

```js
const today = new Date(this._nowFn()).toISOString().slice(0, 10);
```

`toISOString()` 返回 UTC 时间。对于 UTC+8 用户，本地 23:30 复习会被计算为次日 UTC 日期，可能导致跨午夜 streak 断裂（用户本地连续两天复习，但 UTC 日期只差 0.5 天被视为同一天；或本地连续两天但在 UTC 间隔 >1 天导致 streak 重置）。

**建议**: 如面向中国用户（zh-CN 界面），考虑使用本地日期：
```js
const now = new Date(this._nowFn());
const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
```
或注入 timezone offset。**此问题不影响测试（测试使用同一时间源），但生产环境可能出现。**

---

### CODE-4: 文件行数 528 行，略超 400 行约定 (Info)

**位置**: `lib/bookmark-spaced-repetition.js` (528 行)

项目 Phase M-R 迭代中持续将 lib 文件拆分至 ≤400 行。本文件 528 行虽非极端，但与项目惯例不一致。建议后续迭代提取 `_updateStreak`/`_formatReviewStatus`/序列化逻辑到 `bookmark-spaced-repetition-utils.js`。

---

### ✅ 安全质量确认

| 检查项 | 结果 |
|--------|------|
| 硬编码密钥 | ✅ 无 |
| XSS 风险 | ✅ 无（纯数据/逻辑模块，不操作 DOM） |
| 输入验证 | ✅ addToQueue 验证 id 存在，recordReview 验证 difficulty 范围 |
| importData 防御 | ✅ 验证 queue 数组存在，跳过无 id 条目 |

---

## 返工任务清单

| 优先级 | 编号 | 任务 | 预估工作量 |
|--------|------|------|-----------|
| P1 | BUG-1 | 修复 `sendDailyReminder` spread 覆写 `sent` 属性 | 5 分钟 |
| P2 | CODE-1 | 移除未使用的 `initializeReviewData` 导入 | 1 分钟 |
| P3 | CODE-2 | 简化 `_formatReviewStatus` 中无意义的三元表达式 | 1 分钟 |
| P3 | CODE-3 | `_updateStreak` UTC 日期问题（生产环境可能影响 streak 计算） | 10 分钟 |
| P4 | CODE-4 | 后续迭代拆分至 ≤400 行 | 30 分钟 |

---

## 测试结果确认

```
# tests 43
# suites 16
# pass 43
# fail 0
# cancelled 0
# skipped 0
# duration_ms 304ms
```

**结论**: R163 功能完整实现，43 用例全部通过，满足需求中 ≥30 用例要求。存在 1 个 P1 bug（spread 覆写）和 3 个低优先级代码质量问题需修复。文档同步完备。
