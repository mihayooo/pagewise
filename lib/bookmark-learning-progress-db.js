/**
 * BookmarkLearningProgress — DB 层 + 统计 + 导入导出 + 日期工具
 *
 * 从 bookmark-learning-progress.js (R150) 拆分:
 *   - IndexedDB 操作: _openDB, _addRecord, _updateRecord, _getRecordsByBookmark, _getAllRecords
 *   - 统计方法: getStats, getDailyStats
 *   - 导入导出: exportData, importData
 *   - 日期工具: _calculateStreak, _getUniqueDays, _timestampToDateUTC8, _getDateUTC8Offset
 *
 * 所有方法使用 `this` 访问实例属性，通过 Object.assign 挂载到 prototype。
 */

const STORE_NAME = 'learningProgress';

// ==================== DB 操作 ====================

/**
 * 打开 IndexedDB 学习进度数据库
 */
export function _openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(this._dbName, this._dbVersion);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('bookmarkId', 'bookmarkId', { unique: false });
        store.createIndex('startTime', 'startTime', { unique: false });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * @param {object} record - 学习记录
 * * @returns {Promise<number>} 新记录 ID
 */
export function _addRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = this._db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(record);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * @param {object} record - 学习记录
 * * @returns {Promise<undefined>}
 */
export function _updateRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = this._db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * @param {string} bookmarkId - 书签 ID
 * * @returns {Promise<Array>} 该书签的学习记录列表
 */
export function _getRecordsByBookmark(bookmarkId) {
  return new Promise((resolve, reject) => {
    const tx = this._db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('bookmarkId');
    const req = index.getAll(bookmarkId);
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * @returns {Promise<Array>} 全部学习记录
 */
export function _getAllRecords() {
  return new Promise((resolve, reject) => {
    const tx = this._db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ==================== 统计方法 ====================

/**
 * 获取学习统计概览
 */
export async function getStats() {
  const allRecords = await this._getAllRecords();
  let totalTime = 0;
  let totalSessions = 0;
  const categoryTime = new Map();

  for (const r of allRecords) {
    if (r.endTime !== null) {
      if (r.duration > 0) {
        totalTime += r.duration;
      }
      totalSessions++;

      const bookmark = this._bookmarksMap.get(r.bookmarkId);
      if (bookmark && bookmark.folderPath && bookmark.folderPath.length > 0) {
        const cat = bookmark.folderPath[0];
        categoryTime.set(cat, (categoryTime.get(cat) || 0) + r.duration);
      }
    }
  }

  const streak = this._calculateStreak(allRecords);
  const studyDays = this._getUniqueDays(allRecords);
  const dailyAverage = studyDays.size > 0
    ? Math.round(totalTime / studyDays.size)
    : 0;

  let mostActiveCategory = '';
  let maxTime = 0;
  for (const [cat, t] of categoryTime) {
    if (t > maxTime) {
      maxTime = t;
      mostActiveCategory = cat;
    }
  }

  return {
    totalTime: Math.round(totalTime),
    totalSessions,
    dailyAverage,
    streak,
    mostActiveCategory,
  };
}

/**
 * @param {number} [days=7] - 统计天数
 * * @returns {Promise<object>} 每日学习统计
 */
export async function getDailyStats(days) {
  const allRecords = await this._getAllRecords();
  const result = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = this._getDateUTC8Offset(-i);
    const dayRecords = allRecords.filter(r => {
      if (r.endTime === null) return false;
      return this._timestampToDateUTC8(r.endTime) === date;
    });

    let totalTime = 0;
    for (const r of dayRecords) {
      totalTime += r.duration;
    }

    result.push({
      date,
      totalTime: Math.round(totalTime),
      sessions: dayRecords.length,
    });
  }

  return result;
}

// ==================== 导入导出 ====================

/**
 * 导出全部学习数据
 */
export async function exportData() {
  const records = await this._getAllRecords();
  return {
    sessions: records.map(r => ({
      bookmarkId: r.bookmarkId,
      startTime: r.startTime,
      endTime: r.endTime,
      duration: r.duration,
      timedOut: r.timedOut,
    })),
  };
}

/**
 * @param {object} data - 导入的学习数据
 */
export async function importData(json) {
  if (!json || !Array.isArray(json.sessions)) {
    throw new Error('Invalid import data: sessions must be an array');
  }

  const existing = await this._getAllRecords();
  const existingSet = new Set(
    existing.map(r => `${r.bookmarkId}|${r.startTime}|${r.endTime}`)
  );

  let imported = 0;
  let skipped = 0;

  for (const session of json.sessions) {
    const key = `${session.bookmarkId}|${session.startTime}|${session.endTime}`;
    if (existingSet.has(key)) {
      skipped++;
    } else {
      await this._addRecord({
        bookmarkId: session.bookmarkId,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        timedOut: session.timedOut || false,
      });
      existingSet.add(key);
      imported++;
    }
  }

  return { imported, skipped };
}

// ==================== 日期工具 ====================

/**
 * @param {Array} records - 学习记录
 * * @returns {number} 连续天数
 */
export function _calculateStreak(records) {
  const days = this._getUniqueDays(records);
  if (days.size === 0) return 0;

  const sorted = [...days].sort().reverse();
  const today = this._getDateUTC8Offset(0);

  let streak = 0;
  let expectedDate = today;

  for (const date of sorted) {
    if (date === expectedDate) {
      streak++;
      expectedDate = this._getDateUTC8Offset(-streak);
    } else if (date < expectedDate) {
      break;
    }
  }

  return streak;
}

/**
 * @param {Array} records - 学习记录
 * * @returns {Set<string>} 唯一日期集合
 */
export function _getUniqueDays(records) {
  const days = new Set();
  for (const r of records) {
    if (r.endTime !== null) {
      days.add(this._timestampToDateUTC8(r.endTime));
    }
  }
  return days;
}

/**
 * @param {number} timestamp - 时间戳
 * * @returns {string} UTC+8 日期字符串
 */
export function _timestampToDateUTC8(timestamp) {
  const utcMs = timestamp + 8 * 60 * 60 * 1000;
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @returns {number} UTC+8 偏移量（毫秒）
 */
export function _getDateUTC8Offset(offsetDays) {
  const now = Date.now() + offsetDays * 86400000;
  return this._timestampToDateUTC8(now);
}
