/**
 * BookmarkLearningProgress IndexedDB 与日期工具 — 从 bookmark-learning-progress.js (R140) 拆分
 *
 * 包含:
 *   - 常量 (DB_NAME / DB_VERSION / STORE_NAME)
 *   - openDB() — 打开 IndexedDB 连接
 *   - addRecord() / updateRecord() — 记录增改
 *   - getRecordsByBookmark() / getAllRecords() — 记录查询
 *   - calculateStreak() / getUniqueDays() — 连续学习天数
 *   - timestampToDateUTC8() / getDateUTC8Offset() — UTC+8 日期工具
 *
 * @module lib/bookmark-learning-progress-db
 */

// ==================== 常量 ====================

export const DB_NAME = 'pagewise_learning_progress';
export const DB_VERSION = 1;
export const STORE_NAME = 'learningProgress';

// ==================== IndexedDB 操作 ====================

/**
 * 打开 IndexedDB 连接
 *
 * @param {string} dbName
 * @param {number} dbVersion
 * @returns {Promise<IDBDatabase>}
 */
export function openDB(dbName, dbVersion) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

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
 * 添加记录到 IndexedDB
 *
 * @param {IDBDatabase} db
 * @param {Object} record
 * @returns {Promise<number>} auto-increment key
 */
export function addRecord(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(record);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * 更新记录
 *
 * @param {IDBDatabase} db
 * @param {Object} record
 * @returns {Promise<any>}
 */
export function updateRecord(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * 按 bookmarkId 查询所有记录
 *
 * @param {IDBDatabase} db
 * @param {string} bookmarkId
 * @returns {Promise<Array>}
 */
export function getRecordsByBookmark(db, bookmarkId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('bookmarkId');
    const req = index.getAll(bookmarkId);
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * 获取所有记录
 *
 * @param {IDBDatabase} db
 * @returns {Promise<Array>}
 */
export function getAllRecords(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ==================== 日期工具 ====================

/**
 * 时间戳转 UTC+8 日期字符串 'YYYY-MM-DD'
 *
 * @param {number} timestamp
 * @returns {string}
 */
export function timestampToDateUTC8(timestamp) {
  const utcMs = timestamp + 8 * 60 * 60 * 1000;
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取今天/偏移的 UTC+8 日期字符串
 *
 * @param {number} offsetDays 偏移天数 (负数为过去)
 * @returns {string}
 */
export function getDateUTC8Offset(offsetDays) {
  const now = Date.now() + offsetDays * 86400000;
  return timestampToDateUTC8(now);
}

/**
 * 获取记录中所有唯一的 UTC+8 日期
 *
 * @param {Array} records
 * @returns {Set<string>}
 */
export function getUniqueDays(records) {
  const days = new Set();
  for (const r of records) {
    if (r.endTime !== null) {
      days.add(timestampToDateUTC8(r.endTime));
    }
  }
  return days;
}

/**
 * 计算连续学习天数 (streak)
 *
 * @param {Array} records
 * @returns {number}
 */
export function calculateStreak(records) {
  const days = getUniqueDays(records);
  if (days.size === 0) return 0;

  const sorted = [...days].sort().reverse();
  const today = getDateUTC8Offset(0);

  let streak = 0;
  let expectedDate = today;

  for (const date of sorted) {
    if (date === expectedDate) {
      streak++;
      expectedDate = getDateUTC8Offset(-streak);
    } else if (date < expectedDate) {
      break;
    }
  }

  return streak;
}
