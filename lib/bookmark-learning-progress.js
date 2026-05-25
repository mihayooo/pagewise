/**
 * BookmarkLearningProgress — 学习进度追踪
 *
 * 记录学习会话（开始/结束时间）、计算书签级/领域级/全局学习进度、
 * 提供学习统计（streak、日均时长、最活跃领域）和趋势数据。
 * 数据持久化到 IndexedDB（learningProgress store）。
 *
 * 纯 ES Module，不依赖 DOM 或 Chrome API。
 * 复用 BookmarkLearningPath.judgeDifficulty() 静态方法推算难度。
 */

import { BookmarkLearningPath } from './bookmark-learning-path.js';
import {
  _openDB, _addRecord, _updateRecord, _getRecordsByBookmark, _getAllRecords,
  getStats, getDailyStats, exportData, importData,
  _calculateStreak, _getUniqueDays, _timestampToDateUTC8, _getDateUTC8Offset,
} from './bookmark-learning-progress-db.js';

// ==================== 常量 ====================

const TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟
const DB_NAME = 'pagewise_learning_progress';
const DB_VERSION = 1;

/** 难度等级 → 预期学习时长 (秒) */
const EXPECTED_TIME = {
  beginner: 600,       // 10 分钟
  intermediate: 1200,  // 20 分钟
  advanced: 1800,      // 30 分钟
};

// ==================== BookmarkLearningProgress ====================

/** BookmarkLearningProgress 类 */
export class BookmarkLearningProgress {
  /** 难度→预期时长映射，可从外部访问 */
  static EXPECTED_TIME = { ...EXPECTED_TIME };

  /**
   * @param {Object} options
   * @param {number}  [options.timeoutMs]  会话超时毫秒 (默认 30min)
   * @param {string}  [options.dbName]     IndexedDB 数据库名
   * @param {number}  [options.dbVersion]  IndexedDB 版本号
   * @param {Array}   [options.bookmarks]  书签数组 (用于难度判定)
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    this._dbName = options.dbName ?? DB_NAME;
    this._dbVersion = options.dbVersion ?? DB_VERSION;
    this._bookmarks = options.bookmarks || [];
    this._bookmarksMap = new Map();
    for (const b of this._bookmarks) {
      this._bookmarksMap.set(String(b.id), b);
    }

    /** @type {Map<string, {id:any, bookmarkId:string, startTime:number, endTime:null, duration:0, timedOut:false, timerId:any}>} */
    this._activeSessions = new Map();
    this._db = null;
  }

  // ─── 初始化 ──────────────────────────────────────────────────────────

  /**
   * 打开 IndexedDB 连接，创建 store 和 indexes
   */
  async init() {
    this._db = await this._openDB();
  }

  // ─── 会话管理 ────────────────────────────────────────────────────────

  /**
   * 开始学习会话。同一书签已有活跃会话则返回已有会话。
   * @param {string} bookmarkId
   * @returns {Promise<Object>} session 对象
   */
  async startSession(bookmarkId) {
    const bid = String(bookmarkId);

    // 已有活跃会话 → 返回现有
    if (this._activeSessions.has(bid)) {
      return this._activeSessions.get(bid);
    }

    const session = {
      id: null, // IDB auto-increment
      bookmarkId: bid,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      timedOut: false,
    };

    // 写入 IndexedDB
    const id = await this._addRecord(session);
    session.id = id;

    // 设置超时定时器
    const timerId = setTimeout(async () => {
      try {
        await this._endSessionInternal(bid, true);
      } catch (_) { /* 超时结束时会话可能已被手动结束 */ }
    }, this.timeoutMs);
    session._timerId = timerId;

    this._activeSessions.set(bid, session);
    return { ...session, _timerId: undefined };
  }

  /**
   * 结束学习会话
   * @param {string} bookmarkId
   * @returns {Promise<Object>} 结束后的 session 对象
   */
  async endSession(bookmarkId) {
    const bid = String(bookmarkId);
    if (!this._activeSessions.has(bid)) {
      throw new Error(`No active session for bookmark: ${bid}`);
    }
    return this._endSessionInternal(bid, false);
  }

  // ─── 进度查询 ────────────────────────────────────────────────────────

  /**
   * 获取单个书签的学习进度
   * @param {string} bookmarkId
   * @returns {Promise<Object>} bookmark progress summary
   */
  async getBookmarkProgress(bookmarkId) {
    const bid = String(bookmarkId);
    const records = await this._getRecordsByBookmark(bid);

    let totalTime = 0;
    let sessionCount = 0;
    let lastStudiedAt = 0;

    for (const r of records) {
      if (r.endTime !== null) {
        sessionCount++;
        if (r.duration > 0) {
          totalTime += r.duration;
        }
        if (r.endTime > lastStudiedAt) {
          lastStudiedAt = r.endTime;
        }
      }
    }

    const bookmark = this._bookmarksMap.get(bid);
    const difficulty = bookmark
      ? BookmarkLearningPath.judgeDifficulty(bookmark)
      : 'intermediate';
    const expectedTime = EXPECTED_TIME[difficulty] || EXPECTED_TIME.intermediate;
    const progress = Math.min(totalTime / expectedTime, 1.0);

    return {
      bookmarkId: bid,
      totalTime: Math.round(totalTime),
      sessionCount,
      lastStudiedAt,
      progress,
      difficulty,
      expectedTime,
    };
  }

  /**
   * 获取某个类别的学习进度
   * @param {string} category
   * @param {Map<string, Bookmark[]>} [clusterMap] 聚类结果
   * @returns {Promise<Object>}
   */
  async getCategoryProgress(category, clusterMap) {
    const bookmarks = clusterMap ? clusterMap.get(category) || [] : [];
    const totalBookmarks = bookmarks.length;
    let studiedBookmarks = 0;
    let totalTime = 0;
    let totalProgress = 0;

    for (const b of bookmarks) {
      const bp = await this.getBookmarkProgress(b.id);
      if (bp.totalTime > 0) {
        studiedBookmarks++;
        totalTime += bp.totalTime;
      }
      totalProgress += bp.progress;
    }

    return {
      category,
      totalBookmarks,
      studiedBookmarks,
      totalTime: Math.round(totalTime),
      avgProgress: totalBookmarks > 0 ? totalProgress / totalBookmarks : 0,
    };
  }

  /**
   * 获取全局学习进度
   * @returns {Promise<Object>}
   */
  async getOverallProgress() {
    const totalBookmarks = this._bookmarks.length;
    let studiedBookmarks = 0;
    let totalTime = 0;
    let totalProgress = 0;

    for (const b of this._bookmarks) {
      const bp = await this.getBookmarkProgress(b.id);
      if (bp.totalTime > 0) {
        studiedBookmarks++;
        totalTime += bp.totalTime;
      }
      totalProgress += bp.progress;
    }

    return {
      totalBookmarks,
      studiedBookmarks,
      totalTime: Math.round(totalTime),
      avgProgress: totalBookmarks > 0 ? totalProgress / totalBookmarks : 0,
    };
  }

  // ─── 内部方法 ────────────────────────────────────────────────────────

  /**
   * 内部结束会话实现
   * @private
   */
  async _endSessionInternal(bookmarkId, timedOut) {
    const session = this._activeSessions.get(bookmarkId);
    if (!session) throw new Error(`No active session for bookmark: ${bookmarkId}`);

    // 清除超时定时器
    if (session._timerId) {
      clearTimeout(session._timerId);
    }

    const now = Date.now();
    session.endTime = now;
    session.duration = Math.round((now - session.startTime) / 1000);
    session.timedOut = timedOut;

    // 更新 IndexedDB 记录
    await this._updateRecord(session);

    // 移除活跃会话
    this._activeSessions.delete(bookmarkId);

    return {
      id: session.id,
      bookmarkId: session.bookmarkId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      timedOut: session.timedOut,
    };
  }

}

// ==================== Mixin: DB + 统计 + 导入导出 + 日期工具 ====================
// 从 bookmark-learning-progress-db.js 拆分，保持 API 向后兼容

Object.assign(BookmarkLearningProgress.prototype, {
  // DB 操作
  _openDB,
  _addRecord,
  _updateRecord,
  _getRecordsByBookmark,
  _getAllRecords,
  // 统计
  getStats,
  getDailyStats,
  // 导入导出
  exportData,
  importData,
  // 日期工具
  _calculateStreak,
  _getUniqueDays,
  _timestampToDateUTC8,
  _getDateUTC8Offset,
});
