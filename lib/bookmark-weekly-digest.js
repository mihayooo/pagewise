/**
 * WeeklyDigest — 学习周报生成
 *
 * 拆分为 stats（统计/分析/推荐）和 report（报告生成/通知）。
 *
 * @module lib/bookmark-weekly-digest
 * @see bookmark-weekly-digest-stats.js
 * @see bookmark-weekly-digest-report.js
 */

import { WeeklyDigest as _WeeklyDigest } from './bookmark-weekly-digest-stats.js';

// 导入 report — 副作用：为 WeeklyDigest 原型混入
// generateReport / toMarkdown / toHTML / sendWeeklyNotification / isMonday / notifyIfMonday
import './bookmark-weekly-digest-report.js';

export {
  WeeklyDigest,
  getWeekRange,
  getLastWeekRange,
  inferDomains,
  formatDate,
  formatDateRange,
  ONE_WEEK_MS,
  ONE_DAY_MS,
  DOMAIN_KEYWORDS,
} from './bookmark-weekly-digest-stats.js';

export default _WeeklyDigest;
