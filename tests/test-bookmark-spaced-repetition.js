/**
 * test-bookmark-spaced-repetition.js — 书签间隔复习系统单元测试
 *
 * 测试范围:
 *   BookmarkSpacedRepetition 构造函数 / addToQueue / removeFromQueue /
 *   getDueBookmarks / getDueCount / recordReview / getStats /
 *   sendDailyReminder / getSessionCards / getQueueSize /
 *   isQueued / getBookmarkReview / exportData / importData /
 *   retentionRate / streak 管理
 *
 * 目标: ≥30 用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BookmarkSpacedRepetition,
  REVIEW_DIFFICULTY,
  DEFAULT_REVIEW_INTERVALS,
  MS_PER_DAY,
} from '../lib/bookmark-spaced-repetition.js';

// ==================== 辅助工厂 ====================

function makeBookmark(id, overrides = {}) {
  return {
    id: String(id),
    title: `Bookmark ${id}`,
    url: `https://example.com/page-${id}`,
    summary: `This is a summary for bookmark ${id}.`,
    status: 'read',
    tags: ['tech'],
    dateAdded: Date.now() - 86400000 * 30,
    ...overrides,
  };
}

function makeNotifier() {
  const sent = [];
  return {
    sent,
    notifyDeadLinks: () => ({ sent: false }),
    notifyNewBookmarks: () => ({ sent: false }),
    notifyDuplicates: () => ({ sent: false }),
    notifyBackupComplete: () => ({ sent: false }),
    sendReviewReminder(count, titles) {
      sent.push({ count, titles });
      return { sent: true, reason: null, notification: null };
    },
  };
}

// ==================== 测试 ====================

describe('BookmarkSpacedRepetition', () => {

  // ─── 构造函数 ───────────────────────────────────────────────────

  describe('构造函数', () => {
    it('1. 默认构造应初始化空队列', () => {
      const sr = new BookmarkSpacedRepetition();
      assert.equal(sr.getQueueSize(), 0);
    });

    it('2. 构造函数应接受 options 参数', () => {
      const sr = new BookmarkSpacedRepetition({
        now: () => 1700000000000,
        maxDailyReviews: 10,
      });
      assert.equal(sr.getQueueSize(), 0);
    });
  });

  // ─── addToQueue ─────────────────────────────────────────────────

  describe('addToQueue', () => {
    it('3. 添加书签应增加队列大小', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      assert.equal(sr.getQueueSize(), 1);
    });

    it('4. 添加已存在的书签不应重复', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(1));
      assert.equal(sr.getQueueSize(), 1);
    });

    it('5. 添加无 id 的书签应抛出错误', () => {
      const sr = new BookmarkSpacedRepetition();
      assert.throws(() => sr.addToQueue({ title: 'No ID' }), /id/);
    });

    it('6. 添加后应可通过 isQueued 查询', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      assert.equal(sr.isQueued('1'), true);
      assert.equal(sr.isQueued('2'), false);
    });

    it('7. 添加新书签应初始化默认复习数据', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      const review = sr.getBookmarkReview('1');
      assert.ok(review);
      assert.equal(review.interval, DEFAULT_REVIEW_INTERVALS[0]);
      assert.equal(review.repetitions, 0);
      assert.equal(review.easeFactor, 2.5);
    });

    it('8. 已读状态书签应被接受', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1, { status: 'read' }));
      assert.equal(sr.getQueueSize(), 1);
    });
  });

  // ─── removeFromQueue ────────────────────────────────────────────

  describe('removeFromQueue', () => {
    it('9. 移除已存在书签应减小队列大小', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      const removed = sr.removeFromQueue('1');
      assert.equal(removed, true);
      assert.equal(sr.getQueueSize(), 0);
    });

    it('10. 移除不存在书签应返回 false', () => {
      const sr = new BookmarkSpacedRepetition();
      const removed = sr.removeFromQueue('nonexistent');
      assert.equal(removed, false);
    });

    it('11. 移除后 isQueued 应返回 false', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.removeFromQueue('1');
      assert.equal(sr.isQueued('1'), false);
    });
  });

  // ─── getDueBookmarks ────────────────────────────────────────────

  describe('getDueBookmarks', () => {
    it('12. 空队列应返回空数组', () => {
      const sr = new BookmarkSpacedRepetition();
      const due = sr.getDueBookmarks();
      assert.deepEqual(due, []);
    });

    it('13. 新添加的书签应立即到期（默认 nextReview=now）', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      const due = sr.getDueBookmarks();
      assert.equal(due.length, 1);
      assert.equal(due[0].id, '1');
    });

    it('14. 未到期书签不应出现在 due 列表中', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      // 手动设置下次复习为未来
      sr._queue.get('1').nextReview = now + MS_PER_DAY * 5;
      const due = sr.getDueBookmarks();
      assert.equal(due.length, 0);
    });

    it('15. 应按 nextReview 排序（最早到期在前）', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      sr.addToQueue(makeBookmark(3));
      // 设置不同到期时间
      sr._queue.get('1').nextReview = now - MS_PER_DAY * 3;
      sr._queue.get('2').nextReview = now - MS_PER_DAY * 1;
      sr._queue.get('3').nextReview = now - MS_PER_DAY * 2;
      const due = sr.getDueBookmarks();
      assert.equal(due[0].id, '1');
      assert.equal(due[1].id, '3');
      assert.equal(due[2].id, '2');
    });

    it('16. 应遵守 limit 限制', () => {
      const sr = new BookmarkSpacedRepetition();
      for (let i = 1; i <= 10; i++) sr.addToQueue(makeBookmark(i));
      const due = sr.getDueBookmarks(3);
      assert.equal(due.length, 3);
    });
  });

  // ─── getDueCount ────────────────────────────────────────────────

  describe('getDueCount', () => {
    it('17. 应返回所有到期书签数量', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      sr.addToQueue(makeBookmark(3));
      // 设置 3 号未到期
      sr._queue.get('3').nextReview = Date.now() + MS_PER_DAY * 10;
      const count = sr.getDueCount();
      assert.equal(count, 2);
    });

    it('18. 无书签时应返回 0', () => {
      const sr = new BookmarkSpacedRepetition();
      assert.equal(sr.getDueCount(), 0);
    });
  });

  // ─── recordReview ───────────────────────────────────────────────

  describe('recordReview', () => {
    it('19. recordReview 应更新间隔和下次复习时间', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      const result = sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      assert.ok(result);
      assert.equal(result.repetitions, 1);
      // 首次 Good: interval = 1
      assert.equal(result.interval, 1);
    });

    it('20. AGAIN 应重置间隔为 1 天', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      // 先成功几次
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      // 然后失败
      const result = sr.recordReview('1', REVIEW_DIFFICULTY.AGAIN);
      assert.equal(result.interval, 1);
      assert.equal(result.repetitions, 0);
    });

    it('21. EASY 应产生更大的 easeFactor', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      sr.recordReview('1', REVIEW_DIFFICULTY.EASY);
      sr.recordReview('2', REVIEW_DIFFICULTY.GOOD);
      const review1 = sr.getBookmarkReview('1');
      const review2 = sr.getBookmarkReview('2');
      // EASY quality=5 > GOOD quality=3, easeFactor 增长更多
      assert.ok(review1.easeFactor > review2.easeFactor);
    });

    it('22. 对不存在的书签记录应返回 null', () => {
      const sr = new BookmarkSpacedRepetition();
      const result = sr.recordReview('nonexistent', REVIEW_DIFFICULTY.GOOD);
      assert.equal(result, null);
    });

    it('23. 多次复习后间隔应按 SM-2 递增', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD); // interval=1, rep=1
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD); // interval=6, rep=2
      const r3 = sr.recordReview('1', REVIEW_DIFFICULTY.GOOD); // interval=round(6*EF), rep=3
      assert.ok(r3.interval > 6);
      assert.equal(r3.repetitions, 3);
    });

    it('24. recordReview 应更新复习历史', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      const review = sr.getBookmarkReview('1');
      assert.ok(review.history);
      assert.equal(review.history.length, 1);
      assert.equal(review.history[0].difficulty, REVIEW_DIFFICULTY.GOOD);
    });

    it('25. invalid difficulty 应抛出错误', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      assert.throws(() => sr.recordReview('1', 99), /difficulty/);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────

  describe('getStats', () => {
    it('26. 空队列应返回零统计', () => {
      const sr = new BookmarkSpacedRepetition();
      const stats = sr.getStats();
      assert.equal(stats.dueCount, 0);
      assert.equal(stats.totalQueued, 0);
      assert.equal(stats.currentStreak, 0);
      assert.equal(stats.retentionRate, 0);
    });

    it('27. 应正确计算当日待复习数', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      sr.addToQueue(makeBookmark(3));
      // 3 号未到期
      sr._queue.get('3').nextReview = Date.now() + MS_PER_DAY * 5;
      const stats = sr.getStats();
      assert.equal(stats.dueCount, 2);
      assert.equal(stats.totalQueued, 3);
    });

    it('28. 应正确计算记忆保持率', () => {
      const now = Date.now();
      const sr = new BookmarkSpacedRepetition({ now: () => now });
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      // 1 号: Good + Good
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      // 2 号: Good + Again
      sr.recordReview('2', REVIEW_DIFFICULTY.GOOD);
      sr.recordReview('2', REVIEW_DIFFICULTY.AGAIN);
      const stats = sr.getStats();
      // total reviews = 4, successful (quality>=3) = 3
      assert.equal(stats.totalReviews, 4);
      assert.equal(stats.successfulReviews, 3);
      assert.equal(stats.retentionRate, 75);
    });
  });

  // ─── streak 管理 ───────────────────────────────────────────────

  describe('streak 管理', () => {
    it('29. 首次复习应设置 streak=1', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      const stats = sr.getStats();
      assert.equal(stats.currentStreak, 1);
      assert.equal(stats.longestStreak, 1);
    });

    it('30. 同一天多次复习不应重复累加 streak', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      sr.recordReview('2', REVIEW_DIFFICULTY.GOOD);
      const stats = sr.getStats();
      assert.equal(stats.currentStreak, 1);
    });
  });

  // ─── sendDailyReminder ─────────────────────────────────────────

  describe('sendDailyReminder', () => {
    it('31. 有待复习书签时应发送提醒', () => {
      const sr = new BookmarkSpacedRepetition();
      const notifier = makeNotifier();
      sr.addToQueue(makeBookmark(1));
      sr.addToQueue(makeBookmark(2));
      const result = sr.sendDailyReminder(notifier);
      assert.equal(result.sent, true);
      assert.equal(notifier.sent.length, 1);
      assert.equal(notifier.sent[0].count, 2);
    });

    it('32. 无待复习书签时不应发送提醒', () => {
      const sr = new BookmarkSpacedRepetition();
      const notifier = makeNotifier();
      sr.addToQueue(makeBookmark(1));
      // 设置未到期
      sr._queue.get('1').nextReview = Date.now() + MS_PER_DAY * 10;
      const result = sr.sendDailyReminder(notifier);
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'no-due-bookmarks');
    });

    it('33. 无 notifier 时应返回失败', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      const result = sr.sendDailyReminder(null);
      assert.equal(result.sent, false);
      assert.equal(result.reason, 'no-notifier');
    });
  });

  // ─── getSessionCards ────────────────────────────────────────────

  describe('getSessionCards', () => {
    it('34. 应返回格式化的复习会话卡片', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1, { title: 'AI 学习笔记', summary: '深度学习入门' }));
      const cards = sr.getSessionCards();
      assert.equal(cards.length, 1);
      assert.equal(cards[0].id, '1');
      assert.equal(cards[0].title, 'AI 学习笔记');
      assert.equal(cards[0].summary, '深度学习入门');
      assert.ok(cards[0].reviewStatus);
    });

    it('35. 应遵守 limit 参数', () => {
      const sr = new BookmarkSpacedRepetition();
      for (let i = 1; i <= 5; i++) sr.addToQueue(makeBookmark(i));
      const cards = sr.getSessionCards(2);
      assert.equal(cards.length, 2);
    });

    it('36. 队列为空应返回空数组', () => {
      const sr = new BookmarkSpacedRepetition();
      const cards = sr.getSessionCards();
      assert.deepEqual(cards, []);
    });
  });

  // ─── exportData / importData ────────────────────────────────────

  describe('exportData / importData', () => {
    it('37. exportData 应返回序列化数据', () => {
      const sr = new BookmarkSpacedRepetition();
      sr.addToQueue(makeBookmark(1));
      sr.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      const data = sr.exportData();
      assert.ok(data.queue);
      assert.ok(data.version);
      assert.equal(data.queue.length, 1);
    });

    it('38. importData 应恢复队列状态', () => {
      const sr1 = new BookmarkSpacedRepetition();
      sr1.addToQueue(makeBookmark(1));
      sr1.addToQueue(makeBookmark(2));
      sr1.recordReview('1', REVIEW_DIFFICULTY.GOOD);
      const data = sr1.exportData();

      const sr2 = new BookmarkSpacedRepetition();
      sr2.importData(data);
      assert.equal(sr2.getQueueSize(), 2);
      assert.equal(sr2.isQueued('1'), true);
      assert.equal(sr2.isQueued('2'), true);
      const review = sr2.getBookmarkReview('1');
      assert.equal(review.repetitions, 1);
    });

    it('39. importData 无效数据应抛出错误', () => {
      const sr = new BookmarkSpacedRepetition();
      assert.throws(() => sr.importData(null), /invalid/);
      assert.throws(() => sr.importData({}), /invalid/);
    });
  });

  // ─── REVIEW_DIFFICULTY 常量 ─────────────────────────────────────

  describe('REVIEW_DIFFICULTY 常量', () => {
    it('40. 应包含 AGAIN/HARD/GOOD/EASY', () => {
      assert.equal(REVIEW_DIFFICULTY.AGAIN, 1);
      assert.equal(REVIEW_DIFFICULTY.HARD, 2);
      assert.equal(REVIEW_DIFFICULTY.GOOD, 3);
      assert.equal(REVIEW_DIFFICULTY.EASY, 5);
    });
  });

  // ─── DEFAULT_REVIEW_INTERVALS ───────────────────────────────────

  describe('DEFAULT_REVIEW_INTERVALS', () => {
    it('41. 应为 [1, 3, 7, 14, 30]', () => {
      assert.deepEqual(DEFAULT_REVIEW_INTERVALS, [1, 3, 7, 14, 30]);
    });
  });

  // ─── isQueued 边界情况 ─────────────────────────────────────────

  describe('isQueued', () => {
    it('42. 空队列应返回 false', () => {
      const sr = new BookmarkSpacedRepetition();
      assert.equal(sr.isQueued('anything'), false);
    });
  });

  // ─── getBookmarkReview 边界情况 ─────────────────────────────────

  describe('getBookmarkReview', () => {
    it('43. 不存在的书签应返回 null', () => {
      const sr = new BookmarkSpacedRepetition();
      assert.equal(sr.getBookmarkReview('nonexistent'), null);
    });
  });
});
