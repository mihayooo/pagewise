/**
 * bookmark-spaced-repetition-methods.js — 间隔复习系统方法
 *
 * R196: 从 bookmark-spaced-repetition.js 拆分
 * 包含: getSessionCards/sendDailyReminder/exportData/importData
 *       _updateStreak/_formatReviewStatus
 *
 * @module lib/bookmark-spaced-repetition-methods
 */

import { DIFFICULTY_MAP } from './spaced-repetition.js';
import { MS_PER_DAY, REVIEW_DIFFICULTY, DATA_VERSION } from './bookmark-spaced-repetition-constants.js';

// ==================== 方法（挂载到 BookmarkSpacedRepetition.prototype） ====================

/**
 * @param {number} [limit] - 卡片数量上限
 * * @returns {Array} 格式化的复习会话卡片
 */
export const getSessionCards = function getSessionCards(limit) {
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
};

/**
 * @param {object} notifier - 通知管理器
 * * @returns {Promise<object>} 发送结果
 */
export const sendDailyReminder = function sendDailyReminder(notifier) {
  if (!notifier) {
    return { sent: false, reason: 'no-notifier' };
  }

  const dueCount = this.getDueCount();
  if (dueCount === 0) {
    return { sent: false, reason: 'no-due-bookmarks' };
  }

  const dueBookmarks = this.getDueBookmarks();
  const titles = dueBookmarks.slice(0, 5).map(b => b.title || b.url);

  if (typeof notifier.sendReviewReminder === 'function') {
    const result = notifier.sendReviewReminder(dueCount, titles);
    return { sent: true, ...result };
  }

  if (typeof notifier.notify === 'function') {
    const message = dueCount === 1
      ? `今日有 1 条书签待复习: ${titles[0] || ''}`
      : `今日有 ${dueCount} 条书签待复习`;
    notifier.notify(message, 'info');
    return { sent: true, count: dueCount };
  }

  return { sent: false, reason: 'no-compatible-notifier' };
};

/**
 * 导出复习队列数据
 */
export const exportData = function exportData() {
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
};

/**
 * @param {object} data - 导入的复习数据
 */
export const importData = function importData(data) {
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
};

/**
 * 更新连续学习天数
 */
export const _updateStreak = function _updateStreak() {
  const today = new Date(this._nowFn()).toISOString().slice(0, 10);

  if (this._streak.lastReviewDate === today) {
    return;
  }

  const yesterdayTs = this._nowFn() - MS_PER_DAY;
  const yesterday = new Date(yesterdayTs).toISOString().slice(0, 10);

  if (this._streak.lastReviewDate === yesterday) {
    this._streak.currentStreak += 1;
  } else {
    this._streak.currentStreak = 1;
  }

  this._streak.lastReviewDate = today;

  if (this._streak.currentStreak > this._streak.longestStreak) {
    this._streak.longestStreak = this._streak.currentStreak;
  }
};

/** _formatReviewStatus 常量 */
export const _formatReviewStatus = function _formatReviewStatus(entry) {
  if (entry.repetitions === 0) {
    return '新卡片';
  }
  const dayLabel = entry.interval === 1 ? '天' : '天';
  return `第${entry.repetitions}次复习 · 间隔${entry.interval}${dayLabel} · EF=${entry.easeFactor}`;
};
