/**
 * CoreFlowFix Queue — 知识库写入重试队列
 *
 * 从 core-flow-fix.js (R280) 拆分:
 *   - 重试队列管理: createQueueEntry, enqueue, getPendingItems, clearCompleted, getQueueStats
 *   - 条目状态标记: markRetry, markSuccess, markFailed
 *   - 重试判断: shouldRetry, calcRetryDelay, calcNextRetryTime
 *
 * 纯 ES Module，不依赖 DOM / Chrome API
 *
 * @module core-flow-fix-queue
 */

// ==================== 知识库写入重试队列 ====================

/** 默认重试队列配置 */
export const QUEUE_DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  maxQueueSize: 50,
  storageKey: 'pw_kb_write_queue'
};

/**
 * 创建队列条目
 * @param {Object} entryData - 要保存的知识条目数据
 * @returns {{ id: string, entryData: Object, retryCount: number, createdAt: string, nextRetryAt: string, lastError: string|null, status: string }}
 */
export function createQueueEntry(entryData) {
  const now = new Date().toISOString();
  return {
    id: `qw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    entryData,
    retryCount: 0,
    createdAt: now,
    nextRetryAt: now,
    lastError: null,
    status: 'pending'
  };
}

/**
 * 计算重试延迟（指数退避）
 * @param {number} retryCount - 已重试次数
 * @param {number} baseDelayMs - 基础延迟
 * @param {number} maxDelayMs - 最大延迟
 * @returns {number} 延迟毫秒数
 */
export function calcRetryDelay(retryCount, baseDelayMs = 1000, maxDelayMs = 10000) {
  if (retryCount <= 0) return 0;
  return Math.min(baseDelayMs * Math.pow(2, retryCount - 1), maxDelayMs);
}

/**
 * 计算下次重试时间
 * @param {number} retryCount - 已重试次数
 * @param {number} baseDelayMs - 基础延迟
 * @param {number} maxDelayMs - 最大延迟
 * @returns {string} ISO 时间戳
 */
export function calcNextRetryTime(retryCount, baseDelayMs = 1000, maxDelayMs = 10000) {
  const delay = calcRetryDelay(retryCount, baseDelayMs, maxDelayMs);
  return new Date(Date.now() + delay).toISOString();
}

/**
 * 判断队列条目是否应该重试
 * @param {Object} queueEntry - 队列条目
 * @param {number} maxRetries - 最大重试次数
 * @returns {boolean}
 */
export function shouldRetry(queueEntry, maxRetries = 3) {
  if (!queueEntry) return false;
  if (queueEntry.status === 'success' || queueEntry.status === 'failed') return false;
  if (queueEntry.retryCount >= maxRetries) return false;
  if (!queueEntry.nextRetryAt) return true;
  return new Date(queueEntry.nextRetryAt) <= new Date();
}

/**
 * 标记重试
 * @param {Object} queueEntry - 队列条目
 * @param {string} errorMessage - 错误消息
 * @param {number} baseDelayMs - 基础延迟
 * @param {number} maxDelayMs - 最大延迟
 * @returns {Object} 更新后的条目
 */
export function markRetry(queueEntry, errorMessage, baseDelayMs = 1000, maxDelayMs = 10000) {
  const updated = { ...queueEntry };
  updated.retryCount += 1;
  updated.lastError = errorMessage || null;
  updated.status = 'pending';
  updated.nextRetryAt = calcNextRetryTime(updated.retryCount, baseDelayMs, maxDelayMs);
  return updated;
}

/**
 * 标记成功
 * @param {Object} queueEntry - 队列条目
 * @returns {Object} 更新后的条目
 */
export function markSuccess(queueEntry) {
  return {
    ...queueEntry,
    status: 'success',
    lastError: null
  };
}

/**
 * 标记最终失败
 * @param {Object} queueEntry - 队列条目
 * @param {string} errorMessage - 错误消息
 * @returns {Object} 更新后的条目
 */
export function markFailed(queueEntry, errorMessage) {
  return {
    ...queueEntry,
    status: 'failed',
    lastError: errorMessage || null
  };
}

/**
 * 添加条目到队列
 * @param {Array} queue - 当前队列
 * @param {Object} entryData - 知识条目数据
 * @param {number} maxQueueSize - 最大队列长度
 * @returns {{ queue: Array, newEntry: Object }} 更新后的队列和新条目
 */
export function enqueue(queue, entryData, maxQueueSize = 50) {
  const newEntry = createQueueEntry(entryData);
  const updatedQueue = [...queue, newEntry];
  if (updatedQueue.length > maxQueueSize) {
    const removable = updatedQueue.findIndex(
      e => e.status === 'success' || e.status === 'failed'
    );
    if (removable >= 0) {
      updatedQueue.splice(removable, 1);
    }
    if (updatedQueue.length > maxQueueSize) {
      updatedQueue.shift();
    }
  }
  return { queue: updatedQueue, newEntry };
}

/**
 * 获取待重试的队列条目
 * @param {Array} queue - 当前队列
 * @param {number} maxRetries - 最大重试次数
 * @returns {Array} 待重试条目
 */
export function getPendingItems(queue, maxRetries = 3) {
  if (!Array.isArray(queue)) return [];
  return queue.filter(item => shouldRetry(item, maxRetries));
}

/**
 * 清理已完成/失败的队列条目
 * @param {Array} queue - 当前队列
 * @returns {Array} 清理后的队列
 */
export function clearCompleted(queue) {
  if (!Array.isArray(queue)) return [];
  return queue.filter(item => item.status === 'pending');
}

/**
 * 获取队列统计信息
 * @param {Array} queue - 当前队列
 * @returns {{ total: number, pending: number, failed: number, success: number }}
 */
export function getQueueStats(queue) {
  if (!Array.isArray(queue)) {
    return { total: 0, pending: 0, failed: 0, success: 0 };
  }
  return {
    total: queue.length,
    pending: queue.filter(e => e.status === 'pending').length,
    failed: queue.filter(e => e.status === 'failed').length,
    success: queue.filter(e => e.status === 'success').length
  };
}
