# DESIGN — Iteration 1

## 问题分析

`lib/review-session.js:getWeeklyStats()` 计算本周起始为 **周一 00:00:00**：
```js
const dayOfWeek = now.getDay() || 7; // 周日=7
const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime();
```

测试在 line 327-343 创建 3 个会话：
- `s1`: `now - 1天` (昨天)
- `s2`: `now - 2天` (前天)
- `s3`: `now` (今天)

**在周一运行时**：昨天=周日=上周，前天=周六=上周，只有今天在本周 → `totalSessions=1`，assert 失败。

## 设计方案

**策略：让测试时间戳始终落在当前周内**

不 mock Date（太侵入），而是根据当前日期动态计算安全的偏移量：

```js
const now = Date.now();
const dayOfWeek = new Date().getDay() || 7; // 1=周一 ... 7=周日
// 本周已过去的天数 = dayOfWeek - 1（周一=0天，周日=6天）
// 使用 min offset 保证不会跨到上周
const dayMs = 86400000;
const safeOffset1 = Math.min(1, dayOfWeek - 1) * dayMs; // 至少今天
const safeOffset2 = Math.min(2, dayOfWeek - 1) * dayMs; // 最多前天
```

更简单的方案：**所有会话使用本周内的时间戳，基于 weekStart 计算**：
```js
const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime();
records = [
  { startTime: weekStart, ... },         // 周一
  { startTime: weekStart + dayMs, ... },  // 周二
  { startTime: weekStart + dayMs * 2, ... }, // 周三
]
```

**选择方案二**：最清晰、最稳定，不受"今天是周几"影响。

## 需要修改的文件
- `tests/test-review-session.js` — line 327-343

## 不修改的文件
- `lib/review-session.js` — 生产逻辑正确，无需改动
