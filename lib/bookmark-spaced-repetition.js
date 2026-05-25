/**
 * BookmarkSpacedRepetition — 书签间隔复习系统
 *
 * 基于 SM-2 算法，将已读书签/知识条目纳入复习队列。
 * R203: 常量/类型 → bookmark-spaced-repetition-constants.js
 *       辅助方法 → bookmark-spaced-repetition-methods.js
 *
 * @module lib/bookmark-spaced-repetition
 */

import { calculateNextReview } from './spaced-repetition.js';
import {
  MS_PER_DAY, DEFAULT_REVIEW_INTERVALS, REVIEW_DIFFICULTY,
  DEFAULT_MAX_DAILY_REVIEWS, DATA_VERSION,
} from './bookmark-spaced-repetition-constants.js';
import {
  getSessionCards as _getSessionCards,
  sendDailyReminder as _sendDailyReminder,
  exportData as _exportData,
  importData as _importData,
  _updateStreak,
  _formatReviewStatus,
} from './bookmark-spaced-repetition-methods.js';

// Re-export constants & types for backward compatibility
export { MS_PER_DAY, DEFAULT_REVIEW_INTERVALS, REVIEW_DIFFICULTY, DATA_VERSION };
export { DEFAULT_MAX_DAILY_REVIEWS } from './bookmark-spaced-repetition-constants.js';
export { QUEUE_STORAGE_KEY, STREAK_STORAGE_KEY } from './bookmark-spaced-repetition-constants.js';

// ==================== BookmarkSpacedRepetition ====================

/** BookmarkSpacedRepetition 类 */
export class BookmarkSpacedRepetition {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.now]             — 自定义时间源（测试用）
   * @param {number}   [options.maxDailyReviews] — 每日最大复习数
   */
  constructor(options = {}) {
    this._queue = new Map();
    this._totalReviews = 0;
    this._successfulReviews = 0;
    this._streak = { currentStreak: 0, longestStreak: 0, lastReviewDate: null };
    this._nowFn = options.now || (() => Date.now());
    this._maxDailyReviews = options.maxDailyReviews || DEFAULT_MAX_DAILY_REVIEWS;
  }

  // ----------------------------------------------------------------
  //  队列管理
  // ----------------------------------------------------------------

  addToQueue(bookmark) {
    if (!bookmark || !bookmark.id) {
      throw new Error('bookmark 必须包含 id 字段');
    }
    const id = String(bookmark.id);
    if (this._queue.has(id)) return false;

    const now = this._nowFn();
    this._queue.set(id, {
      id,
      title: bookmark.title || '',
      url: bookmark.url || '',
      summary: bookmark.summary || '',
      tags: bookmark.tags || [],
      status: bookmark.status || 'read',
      dateAdded: bookmark.dateAdded || now,
      addedToQueue: now,
      interval: DEFAULT_REVIEW_INTERVALS[0],
      repetitions: 0,
      easeFactor: 2.5,
      nextReview: now,
      lastReview: now,
      history: [],
    });
    return true;
  }

  removeFromQueue(bookmarkId) {
    return this._queue.delete(String(bookmarkId));
  }

  isQueued(bookmarkId) {
    return this._queue.has(String(bookmarkId));
  }

  getQueueSize() {
    return this._queue.size;
  }

  // ----------------------------------------------------------------
  //  到期查询
  // ----------------------------------------------------------------

  getDueBookmarks(limit) {
    const now = this._nowFn();
    const max = limit ?? this._maxDailyReviews;
    const due = [];
    for (const entry of this._queue.values()) {
      if (entry.nextReview <= now) due.push({ ...entry });
    }
    due.sort((a, b) => a.nextReview - b.nextReview);
    return due.slice(0, max);
  }

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

  recordReview(bookmarkId, difficulty) {
    const validDifficulties = [REVIEW_DIFFICULTY.AGAIN, REVIEW_DIFFICULTY.HARD, REVIEW_DIFFICULTY.GOOD, REVIEW_DIFFICULTY.EASY];
    if (!validDifficulties.includes(difficulty)) {
      throw new Error(`invalid difficulty: ${difficulty}. 有效值: ${validDifficulties.join(', ')}`);
    }
    const entry = this._queue.get(String(bookmarkId));
    if (!entry) return null;
    const now = this._nowFn();
    const updated = calculateNextReview(difficulty, { interval: entry.interval, repetitions: entry.repetitions, easeFactor: entry.easeFactor });
    entry.interval = updated.interval;
    entry.repetitions = updated.repetitions;
    entry.easeFactor = updated.easeFactor;
    entry.nextReview = updated.nextReview;
    entry.lastReview = updated.lastReview;
    entry.history.push({ difficulty, timestamp: now, interval: updated.interval, easeFactor: updated.easeFactor });
    this._totalReviews++;
    if (difficulty >= REVIEW_DIFFICULTY.GOOD) this._successfulReviews++;
    this._updateStreak();
    return { interval: entry.interval, repetitions: entry.repetitions, easeFactor: entry.easeFactor, nextReview: entry.nextReview, lastReview: entry.lastReview };
  }

  // ----------------------------------------------------------------
  //  复习查询
  // ----------------------------------------------------------------

  getBookmarkReview(bookmarkId) {
    const entry = this._queue.get(String(bookmarkId));
    return entry ? { ...entry, history: [...entry.history] } : null;
  }

  getSessionCards(limit) { return _getSessionCards.call(this, limit); }

  // ----------------------------------------------------------------
  //  统计
  // ----------------------------------------------------------------

  getStats() {
    return {
      dueCount: this.getDueCount(),
      totalQueued: this._queue.size,
      totalReviews: this._totalReviews,
      successfulReviews: this._successfulReviews,
      retentionRate: this._totalReviews > 0 ? Math.round((this._successfulReviews / this._totalReviews) * 100) : 0,
      currentStreak: this._streak.currentStreak,
      longestStreak: this._streak.longestStreak,
      lastReviewDate: this._streak.lastReviewDate,
    };
  }

  // ----------------------------------------------------------------
  //  通知联动 / 序列化 — 委托 methods 模块
  // ----------------------------------------------------------------

  sendDailyReminder(notifier) { return _sendDailyReminder.call(this, notifier); }
  exportData() { return _exportData.call(this); }
  importData(data) { return _importData.call(this, data); }

  // ----------------------------------------------------------------
  //  内部方法 — 委托 methods 模块
  // ----------------------------------------------------------------

  _updateStreak() { return _updateStreak.call(this); }
  _formatReviewStatus(entry) { return _formatReviewStatus.call(this, entry); }
}

export default BookmarkSpacedRepetition;
