/**
 * BookmarkSpacedRepetition — 书签间隔复习系统
 *
 * 基于 SM-2 算法，将已读书签/知识条目纳入复习队列：
 *   - addToQueue(bookmark)              — 将书签加入复习队列
 *   - removeFromQueue(bookmarkId)       — 从队列移除
 *   - getDueBookmarks(limit?)           — 获取当前到期需复习的书签
 *   - getDueCount()                     — 到期书签计数
 *   - recordReview(bookmarkId, difficulty) — 记录一次复习评级
 *   - getStats()                        — 复习统计（待复习数/打卡天数/保持率）
 *   - sendDailyReminder(notifier)       — 与 BookmarkNotifier 联动推送提醒
 *   - getSessionCards(limit?)           — 获取复习会话卡片（含摘要）
 *   - exportData() / importData(data)   — 序列化/反序列化队列
 *
 * SM-2 间隔调度：首次 1d → 3d → 7d → 14d → 30d（基于 easeFactor 动态调整）
 *
 * @module lib/bookmark-spaced-repetition
 */

import { calculateNextReview, initializeReviewData, DIFFICULTY_MAP } from './spaced-repetition.js';

// ==================== 常量 ====================

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
const DEFAULT_MAX_DAILY_REVIEWS = 20;

/** 队列持久化 key（仅用于导出/导入标识） */
export const QUEUE_STORAGE_KEY = 'pagewise_bookmark_review_queue';

/** streak 持久化 key */
export const STREAK_STORAGE_KEY = 'pagewise_bookmark_review_streak';

/** 数据版本号 */
const DATA_VERSION = 1;

// ==================== BookmarkSpacedRepetition ====================

export class BookmarkSpacedRepetition {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.now]             — 自定义时间源（测试用）
   * @param {number}   [options.maxDailyReviews] — 每日最大复习数
   */
  constructor(options = {}) {
    /** @type {Map<string, QueueEntry>} 书签 ID → 复习队列条目 */
    this._queue = new Map();

    /** @type {number} 总复习次数 */
    this._totalReviews = 0;

    /** @type {number} 成功复习次数（quality >= 3） */
    this._successfulReviews = 0;

    /** @type {{ currentStreak: number, longestStreak: number, lastReviewDate: string|null }} */
    this._streak = { currentStreak: 0, longestStreak: 0, lastReviewDate: null };

    // 依赖注入
    this._nowFn = options.now || (() => Date.now());
    this._maxDailyReviews = options.maxDailyReviews || DEFAULT_MAX_DAILY_REVIEWS;
  }

  // ----------------------------------------------------------------
  //  队列管理
  // ----------------------------------------------------------------

  /**
   * 将书签加入复习队列
   *
   * @param {Object} bookmark — 书签对象，至少包含 id
   * @returns {boolean} 是否成功添加（已存在则返回 false）
   * @throws {Error} 书签无 id 时抛出
   */
  addToQueue(bookmark) {
    if (!bookmark || !bookmark.id) {
      throw new Error('bookmark 必须包含 id 字段');
    }

    const id = String(bookmark.id);

    if (this._queue.has(id)) {
      return false; // 已在队列中，不重复添加
    }

    const now = this._nowFn();
    const reviewData = {
      interval: DEFAULT_REVIEW_INTERVALS[0],
      repetitions: 0,
      easeFactor: 2.5,
      nextReview: now,   // 新加入的书签立即到期
      lastReview: now,
      history: [],
    };

    this._queue.set(id, {
      id,
      title: bookmark.title || '',
      url: bookmark.url || '',
      summary: bookmark.summary || '',
      tags: bookmark.tags || [],
      status: bookmark.status || 'read',
      dateAdded: bookmark.dateAdded || now,
      addedToQueue: now,
      ...reviewData,
    });

    return true;
  }

  /**
   * 从复习队列移除书签
   *
   * @param {string} bookmarkId — 书签 ID
   * @returns {boolean} 是否找到并移除
   */
  removeFromQueue(bookmarkId) {
    return this._queue.delete(String(bookmarkId));
  }

  /**
   * 查询书签是否在队列中
   *
   * @param {string} bookmarkId — 书签 ID
   * @returns {boolean}
   */
  isQueued(bookmarkId) {
    return this._queue.has(String(bookmarkId));
  }

  /**
   * 获取队列大小
   *
   * @returns {number}
   */
  getQueueSize() {
    return this._queue.size;
  }

  // ----------------------------------------------------------------
  //  到期查询
  // ----------------------------------------------------------------

  /**
   * 获取当前到期需复习的书签列表
   *
   * @param {number} [limit] — 最多返回条数，默认 maxDailyReviews
   * @returns {QueueEntry[]} 到期书签，按 nextReview 升序
   */
  getDueBookmarks(limit) {
    const now = this._nowFn();
    const max = limit ?? this._maxDailyReviews;
    const due = [];

    for (const entry of this._queue.values()) {
      if (entry.nextReview <= now) {
        due.push({ ...entry });
      }
    }

    due.sort((a, b) => a.nextReview - b.nextReview);
    return due.slice(0, max);
  }

  /**
   * 获取当前到期书签总数（不受 limit 限制）
   *
   * @returns {number}
   */
  getDueCount() {
    const now = this._nowFn();
    let count = 0;
    for (const entry of this._queue.values()) {
      if (entry.nextReview <= now) count++;
    }
    return count;
  }

  // ----------------------------------------------------------------
  //  复习记录
  // ----------------------------------------------------------------

  /**
   * 记录一次复习评级，使用 SM-2 算法更新间隔
   *
   * @param {string} bookmarkId  — 书签 ID
   * @param {number} difficulty  — REVIEW_DIFFICULTY 枚举值 (1/2/3/5)
   * @returns {Object|null} 更新后的复习数据，书签不在队列时返回 null
   * @throws {Error} difficulty 不合法时抛出
   */
  recordReview(bookmarkId, difficulty) {
    // 验证 difficulty
    const validDifficulties = [
      REVIEW_DIFFICULTY.AGAIN,
      REVIEW_DIFFICULTY.HARD,
      REVIEW_DIFFICULTY.GOOD,
      REVIEW_DIFFICULTY.EASY,
    ];
    if (!validDifficulties.includes(difficulty)) {
      throw new Error(`invalid difficulty: ${difficulty}. 有效值: ${validDifficulties.join(', ')}`);
    }

    const id = String(bookmarkId);
    const entry = this._queue.get(id);
    if (!entry) return null;

    const now = this._nowFn();

    // 使用 SM-2 算法计算下次复习
    const currentData = {
      interval: entry.interval,
      repetitions: entry.repetitions,
      easeFactor: entry.easeFactor,
    };

    const updated = calculateNextReview(difficulty, currentData);

    // 更新队列条目
    entry.interval = updated.interval;
    entry.repetitions = updated.repetitions;
    entry.easeFactor = updated.easeFactor;
    entry.nextReview = updated.nextReview;
    entry.lastReview = updated.lastReview;

    // 记录历史
    entry.history.push({
      difficulty,
      timestamp: now,
      interval: updated.interval,
      easeFactor: updated.easeFactor,
    });

    // 更新全局统计
    this._totalReviews++;
    if (difficulty >= REVIEW_DIFFICULTY.GOOD) {
      this._successfulReviews++;
    }

    // 更新 streak
    this._updateStreak();

    return {
      interval: entry.interval,
      repetitions: entry.repetitions,
      easeFactor: entry.easeFactor,
      nextReview: entry.nextReview,
      lastReview: entry.lastReview,
    };
  }

  // ----------------------------------------------------------------
  //  复习查询
  // ----------------------------------------------------------------

  /**
   * 获取指定书签的复习数据
   *
   * @param {string} bookmarkId — 书签 ID
   * @returns {QueueEntry|null}
   */
  getBookmarkReview(bookmarkId) {
    const entry = this._queue.get(String(bookmarkId));
    return entry ? { ...entry, history: [...entry.history] } : null;
  }

  /**
   * 获取复习会话卡片（格式化输出，含摘要和评级提示）
   *
   * @param {number} [limit] — 最多返回条数
   * @returns {SessionCard[]}
   */
  getSessionCards(limit) {
    const dueBookmarks = this.getDueBookmarks(limit);

    return dueBookmarks.map(entry => ({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      summary: entry.summary,
      tags: entry.tags,
      reviewStatus: this._formatReviewStatus(entry),
      difficultyOptions: [
        { key: 'again', quality: REVIEW_DIFFICULTY.AGAIN, label: DIFFICULTY_MAP.again.label, emoji: DIFFICULTY_MAP.again.emoji, hint: DIFFICULTY_MAP.again.nextIntervalHint },
        { key: 'hard',  quality: REVIEW_DIFFICULTY.HARD,  label: DIFFICULTY_MAP.hard.label,  emoji: DIFFICULTY_MAP.hard.emoji,  hint: DIFFICULTY_MAP.hard.nextIntervalHint },
        { key: 'good',  quality: REVIEW_DIFFICULTY.GOOD,  label: DIFFICULTY_MAP.good.label,  emoji: DIFFICULTY_MAP.good.emoji,  hint: DIFFICULTY_MAP.good.nextIntervalHint },
        { key: 'easy',  quality: REVIEW_DIFFICULTY.EASY,  label: DIFFICULTY_MAP.easy.label,  emoji: DIFFICULTY_MAP.easy.emoji,  hint: DIFFICULTY_MAP.easy.nextIntervalHint },
      ],
    }));
  }

  // ----------------------------------------------------------------
  //  统计
  // ----------------------------------------------------------------

  /**
   * 获取复习统计
   *
   * @returns {ReviewStats}
   */
  getStats() {
    return {
      dueCount: this.getDueCount(),
      totalQueued: this._queue.size,
      totalReviews: this._totalReviews,
      successfulReviews: this._successfulReviews,
      retentionRate: this._totalReviews > 0
        ? Math.round((this._successfulReviews / this._totalReviews) * 100)
        : 0,
      currentStreak: this._streak.currentStreak,
      longestStreak: this._streak.longestStreak,
      lastReviewDate: this._streak.lastReviewDate,
    };
  }

  // ----------------------------------------------------------------
  //  通知联动
  // ----------------------------------------------------------------

  /**
   * 发送"今日待复习"提醒
   *
   * 支持两种调用方式：
   * 1. 传入 BookmarkNotifier 实例，调用其 sendReviewReminder
   * 2. 传入 NotificationManager 实例，调用其 notify
   *
   * @param {Object} notifier — BookmarkNotifier 或 NotificationManager 实例
   * @returns {{ sent: boolean, reason?: string, count?: number }}
   */
  sendDailyReminder(notifier) {
    if (!notifier) {
      return { sent: false, reason: 'no-notifier' };
    }

    const dueCount = this.getDueCount();
    if (dueCount === 0) {
      return { sent: false, reason: 'no-due-bookmarks' };
    }

    const dueBookmarks = this.getDueBookmarks();
    const titles = dueBookmarks.slice(0, 5).map(b => b.title || b.url);

    // 尝试调用 sendReviewReminder（BookmarkNotifier 扩展方法）
    if (typeof notifier.sendReviewReminder === 'function') {
      const result = notifier.sendReviewReminder(dueCount, titles);
      return { sent: true, ...result };
    }

    // 回退到 NotificationManager.notify
    if (typeof notifier.notify === 'function') {
      const message = dueCount === 1
        ? `今日有 1 条书签待复习: ${titles[0] || ''}`
        : `今日有 ${dueCount} 条书签待复习`;
      notifier.notify(message, 'info');
      return { sent: true, count: dueCount };
    }

    return { sent: false, reason: 'no-compatible-notifier' };
  }

  // ----------------------------------------------------------------
  //  序列化 / 反序列化
  // ----------------------------------------------------------------

  /**
   * 导出队列数据（用于持久化存储）
   *
   * @returns {ExportData}
   */
  exportData() {
    const queue = [];
    for (const entry of this._queue.values()) {
      queue.push({ ...entry, history: [...entry.history] });
    }

    return {
      version: DATA_VERSION,
      queue,
      totalReviews: this._totalReviews,
      successfulReviews: this._successfulReviews,
      streak: { ...this._streak },
      exportedAt: this._nowFn(),
    };
  }

  /**
   * 导入队列数据
   *
   * @param {ExportData} data — exportData() 返回的数据
   * @throws {Error} 数据无效时抛出
   */
  importData(data) {
    if (!data || !Array.isArray(data.queue)) {
      throw new Error('invalid import data: missing queue array');
    }

    this._queue.clear();
    for (const entry of data.queue) {
      if (!entry || !entry.id) continue;
      this._queue.set(String(entry.id), {
        ...entry,
        id: String(entry.id),
        history: Array.isArray(entry.history) ? [...entry.history] : [],
      });
    }

    this._totalReviews = data.totalReviews || 0;
    this._successfulReviews = data.successfulReviews || 0;

    if (data.streak) {
      this._streak = { ...data.streak };
    }
  }

  // ----------------------------------------------------------------
  //  内部方法
  // ----------------------------------------------------------------

  /**
   * 更新复习连续打卡天数
   * @private
   */
  _updateStreak() {
    const today = new Date(this._nowFn()).toISOString().slice(0, 10);

    if (this._streak.lastReviewDate === today) {
      // 今天已记录过，不重复累加
      return;
    }

    const yesterdayTs = this._nowFn() - MS_PER_DAY;
    const yesterday = new Date(yesterdayTs).toISOString().slice(0, 10);

    if (this._streak.lastReviewDate === yesterday) {
      // 连续
      this._streak.currentStreak += 1;
    } else {
      // 断了或首次
      this._streak.currentStreak = 1;
    }

    this._streak.lastReviewDate = today;

    if (this._streak.currentStreak > this._streak.longestStreak) {
      this._streak.longestStreak = this._streak.currentStreak;
    }
  }

  /**
   * 格式化复习状态描述
   * @param {QueueEntry} entry
   * @returns {string}
   * @private
   */
  _formatReviewStatus(entry) {
    if (entry.repetitions === 0) {
      return '新卡片';
    }
    const dayLabel = entry.interval === 1 ? '天' : '天';
    return `第${entry.repetitions}次复习 · 间隔${entry.interval}${dayLabel} · EF=${entry.easeFactor}`;
  }
}

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

export default BookmarkSpacedRepetition;
