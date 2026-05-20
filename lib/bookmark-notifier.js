/**
 * BookmarkNotifier — 书签通知系统
 *
 * 管理书签相关事件的通知生成、偏好设置和历史记录。
 * R203: 分发逻辑 → bookmark-notifier-dispatch.js
 *
 * @module lib/bookmark-notifier
 */

import { buildNotification, dispatch, generateId, MAX_HISTORY } from './bookmark-notifier-dispatch.js';

// ==================== 常量 ====================

export const NOTIFICATION_TYPES = ['dead-links', 'new-bookmarks', 'duplicates', 'backup-complete'];
export const NOTIFICATION_CHANNELS = ['browser', 'badge', 'sound'];
export const NOTIFICATION_LEVELS = ['info', 'warning', 'error'];
export const DEFAULT_LEVELS = { 'dead-links': 'warning', 'new-bookmarks': 'info', 'duplicates': 'warning', 'backup-complete': 'info' };
export const DEFAULT_CHANNEL = 'browser';
export { MAX_HISTORY };
export const MERGE_INTERVAL = 5000;

// ==================== BookmarkNotifier ====================

class BookmarkNotifier {
  constructor(options = {}) {
    this._prefs = {
      enabled: true,
      channels: [DEFAULT_CHANNEL],
      levels: { ...DEFAULT_LEVELS },
      types: {},
      sound: false,
      mergeInterval: MERGE_INTERVAL,
    };
    this._history = [];
    this._lastSentAt = new Map();
    this._pendingMerges = new Map();
    this._idCounter = 0;
    this._totalSent = 0;
    this._dispatchFn = options.dispatch || (() => {});
    this._nowFn = options.now || (() => Date.now());
  }

  // ----------------------------------------------------------------
  //  通知方法
  // ----------------------------------------------------------------

  notifyDeadLinks(links) {
    if (!Array.isArray(links)) throw new Error('links 必须是数组');
    if (links.length === 0) return { sent: false, reason: 'no-dead-links', notification: null };
    const notification = this._buildNotification('dead-links', {
      title: `发现 ${links.length} 个死链`,
      body: links.slice(0, 5).map(l => `${l.title || l.url} (${l.status || 'N/A'})`).join('\n'),
      level: links.length > 10 ? 'error' : this._prefs.levels['dead-links'],
      data: { links: links.map(l => ({ ...l })), count: links.length },
    });
    return this._dispatch(notification);
  }

  notifyNewBookmarks(count) {
    if (typeof count !== 'number' || !isFinite(count) || count < 0) throw new Error('count 必须是非负数字');
    if (count === 0) return { sent: false, reason: 'zero-count', notification: null };
    const notification = this._buildNotification('new-bookmarks', {
      title: `新增 ${count} 个书签`,
      body: `系统已收集到 ${count} 个新书签`,
      level: this._prefs.levels['new-bookmarks'],
      data: { count },
    });
    return this._dispatch(notification);
  }

  notifyDuplicates(count) {
    if (typeof count !== 'number' || !isFinite(count) || count < 0) throw new Error('count 必须是非负数字');
    if (count === 0) return { sent: false, reason: 'zero-count', notification: null };
    const notification = this._buildNotification('duplicates', {
      title: `发现 ${count} 个重复书签`,
      body: `检测到 ${count} 组重复书签，建议清理`,
      level: this._prefs.levels['duplicates'],
      data: { count },
    });
    return this._dispatch(notification);
  }

  notifyBackupComplete(path) {
    if (typeof path !== 'string' || path.trim() === '') throw new Error('path 必须是非空字符串');
    const notification = this._buildNotification('backup-complete', {
      title: '书签备份完成',
      body: `备份已保存至: ${path}`,
      level: this._prefs.levels['backup-complete'],
      data: { path },
    });
    return this._dispatch(notification);
  }

  // ----------------------------------------------------------------
  //  偏好设置
  // ----------------------------------------------------------------

  setNotificationPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') throw new Error('prefs 必须是对象');
    if (prefs.enabled !== undefined) {
      if (typeof prefs.enabled !== 'boolean') throw new Error('prefs.enabled 必须是布尔值');
      this._prefs.enabled = prefs.enabled;
    }
    if (prefs.channels !== undefined) {
      if (!Array.isArray(prefs.channels)) throw new Error('prefs.channels 必须是数组');
      const invalid = prefs.channels.filter(c => !NOTIFICATION_CHANNELS.includes(c));
      if (invalid.length > 0) throw new Error(`不支持的通知渠道: ${invalid.join(', ')}. 支持: ${NOTIFICATION_CHANNELS.join(', ')}`);
      this._prefs.channels = [...prefs.channels];
    }
    if (prefs.levels !== undefined) {
      if (typeof prefs.levels !== 'object') throw new Error('prefs.levels 必须是对象');
      for (const [type, level] of Object.entries(prefs.levels)) {
        if (!NOTIFICATION_LEVELS.includes(level)) throw new Error(`不支持的通知级别: "${level}". 支持: ${NOTIFICATION_LEVELS.join(', ')}`);
        this._prefs.levels[type] = level;
      }
    }
    if (prefs.types !== undefined) {
      if (typeof prefs.types !== 'object') throw new Error('prefs.types 必须是对象');
      for (const [type, enabled] of Object.entries(prefs.types)) {
        if (typeof enabled !== 'boolean') throw new Error(`prefs.types.${type} 必须是布尔值`);
        this._prefs.types[type] = enabled;
      }
    }
    if (prefs.sound !== undefined) {
      if (typeof prefs.sound !== 'boolean') throw new Error('prefs.sound 必须是布尔值');
      this._prefs.sound = prefs.sound;
    }
    if (prefs.mergeInterval !== undefined) {
      if (typeof prefs.mergeInterval !== 'number' || !isFinite(prefs.mergeInterval) || prefs.mergeInterval < 0) throw new Error('prefs.mergeInterval 必须是非负数字');
      this._prefs.mergeInterval = prefs.mergeInterval;
    }
    return this.getNotificationPrefs();
  }

  getNotificationPrefs() {
    return {
      enabled: this._prefs.enabled,
      channels: [...this._prefs.channels],
      levels: { ...this._prefs.levels },
      types: { ...this._prefs.types },
      sound: this._prefs.sound,
      mergeInterval: this._prefs.mergeInterval,
    };
  }

  // ----------------------------------------------------------------
  //  通知历史
  // ----------------------------------------------------------------

  getNotificationHistory(options = {}) {
    let entries = [...this._history];
    if (options.type) entries = entries.filter(e => e.type === options.type);
    if (options.since !== undefined) entries = entries.filter(e => e.timestamp >= options.since);
    const limit = options.limit ?? 100;
    return entries.slice(-limit);
  }

  clearHistory() { this._history = []; }

  // ----------------------------------------------------------------
  //  统计
  // ----------------------------------------------------------------

  getStats() {
    const byType = {};
    for (const entry of this._history) byType[entry.type] = (byType[entry.type] || 0) + 1;
    return { totalSent: this._totalSent, historySize: this._history.length, byType };
  }

  // ----------------------------------------------------------------
  //  内部方法 — 委托 dispatch 模块
  // ----------------------------------------------------------------

  _buildNotification(type, params) { return buildNotification(this, type, params); }
  _dispatch(notification) { return dispatch(this, notification); }
  _generateId() { return generateId(this); }
}

// ==================== 导出 ====================

export { BookmarkNotifier };
export default BookmarkNotifier;
