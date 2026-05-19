/**
 * BookmarkScheduler 辅助函数与内部方法 — 从 bookmark-scheduler.js (R140) 拆分
 *
 * 包含:
 *   - 调度器常量
 *   - validateInterval() / generateTaskId()
 *   - createSchedule() / startTimer() / executeTask() / logEvent()
 *
 * @module lib/bookmark-scheduler-helpers
 */

// ==================== 常量 ====================

/** 支持的任务类型 */
export const TASK_TYPES = ['check-links', 'backup', 'cleanup']

/** 最小调度间隔 (ms) — 防止过于频繁的执行 */
export const MIN_INTERVAL = 1000

/** 最大调度间隔 (ms) — ~30天 */
export const MAX_INTERVAL = 30 * 24 * 60 * 60 * 1000

/** 最大同时活跃任务数 */
export const MAX_TASKS = 20

/** 最大事件日志条数 */
export const MAX_EVENT_LOG = 200

/** 默认调度间隔 (ms) */
export const DEFAULT_INTERVALS = {
  'check-links': 24 * 60 * 60 * 1000,  // 24 小时
  'backup':      7  * 24 * 60 * 60 * 1000,  // 7 天
  'cleanup':     24 * 60 * 60 * 1000,  // 24 小时
}

// ==================== 辅助函数 ====================

/**
 * 验证间隔值
 *
 * @param {number} interval — 间隔毫秒数
 * @param {string} taskType — 任务类型 (用于错误消息)
 * @throws {Error} 如果间隔无效
 */
export function validateInterval(interval, taskType) {
  if (typeof interval !== 'number' || !isFinite(interval)) {
    throw new Error(`${taskType}: interval 必须是有效数字`)
  }
  if (interval < MIN_INTERVAL) {
    throw new Error(`${taskType}: interval 不能小于 ${MIN_INTERVAL}ms`)
  }
  if (interval > MAX_INTERVAL) {
    throw new Error(`${taskType}: interval 不能大于 ${MAX_INTERVAL}ms`)
  }
}

/**
 * 生成唯一任务 ID
 * @returns {string}
 */
export function generateTaskId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `sched-${ts}-${rand}`
}

// ==================== 内部调度逻辑 ====================

/**
 * 创建调度任务 (从 BookmarkScheduler._createSchedule 提取)
 *
 * @param {BookmarkScheduler} self — 调度器实例
 * @param {string} type
 * @param {number} interval
 * @param {Object} options
 * @returns {string} taskId
 */
export function createSchedule(self, type, interval, options) {
  validateInterval(interval, type)

  if (self._schedules.size >= MAX_TASKS) {
    throw new Error(`已达到最大任务数 (${MAX_TASKS})，请先取消其他任务`)
  }

  const taskId = generateSchedulerTaskId(self)
  const now = self._nowFn()

  const entry = {
    taskId,
    type,
    interval,
    options: { ...options },
    createdAt: now,
    lastRunAt: null,
    nextRunAt: now + interval,
    runCount: 0,
    paused: false,
  }

  self._schedules.set(taskId, entry)
  startTimer(self, entry)

  logEvent(self, taskId, type, 'created', null)

  return taskId
}

/**
 * 启动定时器 (从 BookmarkScheduler._startTimer 提取)
 *
 * @param {BookmarkScheduler} self
 * @param {Object} entry
 */
export function startTimer(self, entry) {
  if (!self._setIntervalFn) return

  const timer = self._setIntervalFn(() => {
    executeTask(self, entry)
  }, entry.interval)

  self._timers.set(entry.taskId, timer)
}

/**
 * 执行任务 (从 BookmarkScheduler._executeTask 提取)
 *
 * @param {BookmarkScheduler} self
 * @param {Object} entry
 * @returns {Promise<{success: boolean, result: any, error: string|null}>}
 */
export async function executeTask(self, entry) {
  const handler = self._handlers.get(entry.type)
  if (!handler) {
    const error = `未注册 "${entry.type}" 类型的 handler`
    logEvent(self, entry.taskId, entry.type, 'error', { error })
    return { success: false, result: null, error }
  }

  const now = self._nowFn()
  entry.lastRunAt = now
  entry.runCount++
  entry.nextRunAt = now + entry.interval

  logEvent(self, entry.taskId, entry.type, 'started', null)

  try {
    const result = await handler(entry.options)
    logEvent(self, entry.taskId, entry.type, 'completed', { result })
    return { success: true, result, error: null }
  } catch (err) {
    const error = err.message || String(err)
    logEvent(self, entry.taskId, entry.type, 'error', { error })
    return { success: false, result: null, error }
  }
}

/**
 * 记录事件日志 (从 BookmarkScheduler._logEvent 提取)
 *
 * @param {BookmarkScheduler} self
 * @param {string} taskId
 * @param {string} type
 * @param {string} action
 * @param {*} detail
 */
export function logEvent(self, taskId, type, action, detail) {
  self._eventLog.push({
    taskId,
    type,
    action,
    detail: detail || null,
    timestamp: self._nowFn(),
  })

  // 裁剪日志
  if (self._eventLog.length > MAX_EVENT_LOG) {
    self._eventLog = self._eventLog.slice(-MAX_EVENT_LOG)
  }
}

/**
 * 生成调度器内部任务 ID
 * @param {BookmarkScheduler} self
 * @returns {string}
 */
function generateSchedulerTaskId(self) {
  self._idCounter++
  return `sched-${self._idCounter}-${self._nowFn().toString(36)}`
}
