/**
 * BookmarkSpacedRepetition 常量与类型定义
 *
 * R203: 从 bookmark-spaced-repetition.js 拆分
 * 包含: 常量、类型定义
 *
 * @module lib/bookmark-spaced-repetition-constants
 */

/** 毫秒/天 */
export const MS_PER_DAY = 86400000;

/** 遗忘曲线默认间隔序列（天） */
export const DEFAULT_REVIEW_INTERVALS = [1, 3, 7, 14, 30];

/** 用户评级映射到 SM-2 quality 分值 */
export const REVIEW_DIFFICULTY = {
  AGAIN: 1,   // 完全不记得
  HARD:  2,   // 答错但有印象
  GOOD:  3,   // 正确但费力
  EASY:  5,   // 完美回忆
};

/** 默认每日最多复习卡片数 */
export const DEFAULT_MAX_DAILY_REVIEWS = 20;

/** 队列持久化 key（仅用于导出/导入标识） */
export const QUEUE_STORAGE_KEY = 'pagewise_bookmark_review_queue';

/** streak 持久化 key */
export const STREAK_STORAGE_KEY = 'pagewise_bookmark_review_streak';

/** 数据版本号 */
export const DATA_VERSION = 1;

// ==================== 类型定义 ====================

/**
 * @typedef {Object} QueueEntry
 * @property {string}  id           — 书签 ID
 * @property {string}  title        — 书签标题
 * @property {string}  url          — 书签 URL
 * @property {string}  summary      — 书签摘要
 * @property {string[]} tags        — 标签列表
 * @property {string}  status       — 书签状态
 * @property {number}  dateAdded    — 原始添加时间
 * @property {number}  addedToQueue — 加入队列时间
 * @property {number}  interval     — 当前间隔（天）
 * @property {number}  repetitions  — 连续正确次数
 * @property {number}  easeFactor   — 难度因子
 * @property {number}  nextReview   — 下次复习时间戳
 * @property {number}  lastReview   — 上次复习时间戳
 * @property {Array}   history      — 复习历史
 */

/**
 * @typedef {Object} SessionCard
 * @property {string}  id                — 书签 ID
 * @property {string}  title             — 书签标题
 * @property {string}  url               — 书签 URL
 * @property {string}  summary           — 书签摘要
 * @property {string[]} tags             — 标签
 * @property {string}  reviewStatus      — 复习状态描述
 * @property {Array}   difficultyOptions — Again/Hard/Good/Easy 选项
 */

/**
 * @typedef {Object} ReviewStats
 * @property {number}  dueCount          — 当日待复习数
 * @property {number}  totalQueued       — 队列总条数
 * @property {number}  totalReviews      — 总复习次数
 * @property {number}  successfulReviews — 成功复习次数
 * @property {number}  retentionRate     — 记忆保持率 (%)
 * @property {number}  currentStreak     — 连续打卡天数
 * @property {number}  longestStreak     — 最长连续打卡天数
 * @property {string|null} lastReviewDate — 上次复习日期
 */

/**
 * @typedef {Object} ExportData
 * @property {number}        version          — 数据版本号
 * @property {QueueEntry[]}  queue            — 队列条目
 * @property {number}        totalReviews     — 总复习次数
 * @property {number}        successfulReviews — 成功复习次数
 * @property {Object}        streak           — streak 数据
 * @property {number}        exportedAt       — 导出时间戳
 */
