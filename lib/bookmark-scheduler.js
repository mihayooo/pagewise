/**
 * BookmarkScheduler — 书签定时任务调度器 (R140 拆分)
 *
 * 辅助函数与内部调度逻辑已迁移至 bookmark-scheduler-helpers.js。
 * 此文件保留 BookmarkScheduler 类并 re-export 所有 API。
 *
 * @module lib/bookmark-scheduler
 */

import {
  TASK_TYPES,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MAX_TASKS,
  MAX_EVENT_LOG,
  DEFAULT_INTERVALS,
  validateInterval,
  generateTaskId,
  createSchedule,
  startTimer,
  executeTask,
  logEvent,
} from './bookmark-scheduler-helpers.js'

// ==================== BookmarkScheduler ====================

/**
 * 书签定时任务调度器
 */
class BookmarkScheduler {
  /**
   * @param {Object} [options={}]
   * @param {function} [options.setInterval]   — 自定义 setInterval (用于测试)
   * @param {function} [options.clearInterval] — 自定义 clearInterval (用于测试)
   * @param {function} [options.now]           — 自定义时间源 (用于测试)
   */
  constructor(options = {}) {
    /** @type {Map<string, ScheduleEntry>} 活跃任务表 */
    this._schedules = new Map()

    /** @type {Map<string, any>} taskId → timer handle */
    this._timers = new Map()

    /** @type {Map<string, function>} taskType → handler */
    this._handlers = new Map()

    /** @type {EventLogEntry[]} 执行事件日志 */
    this._eventLog = []

    /** @type {number} 任务 ID 计数器 */
    this._idCounter = 0

    // 依赖注入 (便于测试)
    this._setIntervalFn = options.setInterval || (typeof setInterval !== 'undefined' ? setInterval.bind(globalThis) : null)
    this._clearIntervalFn = options.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval.bind(globalThis) : null)
    this._nowFn = options.now || (() => Date.now())
  }

  // ----------------------------------------------------------------
  //  Handler 注册
  // ----------------------------------------------------------------

  /**
   * 注册任务类型的执行处理器
   *
   * @param {string} taskType — 任务类型 ('check-links' | 'backup' | 'cleanup')
   * @param {function} handler — 任务执行函数: async (options) => result
   * @returns {BookmarkScheduler} this (链式调用)
   */
  registerHandler(taskType, handler) {
    if (!TASK_TYPES.includes(taskType)) {
      throw new Error(`未知任务类型: "${taskType}". 支持: ${TASK_TYPES.join(', ')}`)
    }
    if (typeof handler !== 'function') {
      throw new Error('handler 必须是函数')
    }
    this._handlers.set(taskType, handler)
    return this
  }

  // ----------------------------------------------------------------
  //  调度方法
  // ----------------------------------------------------------------

  /**
   * 创建定时死链检测任务
   */
  scheduleCheckLinks(interval, options = {}) {
    const ms = interval ?? DEFAULT_INTERVALS['check-links']
    return createSchedule(this, 'check-links', ms, options)
  }

  /**
   * 创建定时书签备份任务
   */
  scheduleBackup(interval, options = {}) {
    const ms = interval ?? DEFAULT_INTERVALS['backup']
    return createSchedule(this, 'backup', ms, options)
  }

  /**
   * 创建定时清理任务 (重复/空文件夹)
   */
  scheduleCleanup(interval, options = {}) {
    const ms = interval ?? DEFAULT_INTERVALS['cleanup']
    return createSchedule(this, 'cleanup', ms, options)
  }

  // ----------------------------------------------------------------
  //  管理方法
  // ----------------------------------------------------------------

  /**
   * 获取所有活跃调度任务
   * @returns {ScheduleInfo[]}
   */
  getActiveSchedules() {
    const result = []
    for (const [, entry] of this._schedules.entries()) {
      result.push({
        taskId: entry.taskId,
        type: entry.type,
        interval: entry.interval,
        createdAt: entry.createdAt,
        lastRunAt: entry.lastRunAt,
        nextRunAt: entry.nextRunAt,
        runCount: entry.runCount,
        status: entry.paused ? 'paused' : 'active',
        options: { ...entry.options },
      })
    }
    return result
  }

  /**
   * 取消定时任务
   * @param {string} taskId
   * @returns {boolean}
   */
  cancelSchedule(taskId) {
    if (!taskId || typeof taskId !== 'string') return false

    const entry = this._schedules.get(taskId)
    if (!entry) return false

    const timer = this._timers.get(taskId)
    if (timer !== undefined && this._clearIntervalFn) {
      this._clearIntervalFn(timer)
    }

    this._timers.delete(taskId)
    this._schedules.delete(taskId)
    logEvent(this, taskId, entry.type, 'cancelled', null)
    return true
  }

  /**
   * 手动立即执行定时任务
   * @param {string} taskId
   * @returns {Promise<{success: boolean, result: any, error: string|null}>}
   */
  async runScheduleNow(taskId) {
    if (!taskId || typeof taskId !== 'string') {
      return { success: false, result: null, error: 'taskId 无效' }
    }
    const entry = this._schedules.get(taskId)
    if (!entry) {
      return { success: false, result: null, error: `任务 ${taskId} 不存在` }
    }
    return executeTask(this, entry)
  }

  /**
   * 暂停定时任务
   * @param {string} taskId
   * @returns {boolean}
   */
  pauseSchedule(taskId) {
    const entry = this._schedules.get(taskId)
    if (!entry || entry.paused) return false

    const timer = this._timers.get(taskId)
    if (timer !== undefined && this._clearIntervalFn) {
      this._clearIntervalFn(timer)
    }
    this._timers.delete(taskId)
    entry.paused = true
    entry.nextRunAt = null
    logEvent(this, taskId, entry.type, 'paused', null)
    return true
  }

  /**
   * 恢复已暂停的定时任务
   * @param {string} taskId
   * @returns {boolean}
   */
  resumeSchedule(taskId) {
    const entry = this._schedules.get(taskId)
    if (!entry || !entry.paused) return false

    entry.paused = false
    startTimer(this, entry)
    logEvent(this, taskId, entry.type, 'resumed', null)
    return true
  }

  /**
   * 获取任务执行事件日志
   * @returns {EventLogEntry[]}
   */
  getEventLog(options = {}) {
    let logs = [...this._eventLog]
    if (options.taskId) logs = logs.filter(e => e.taskId === options.taskId)
    if (options.type) logs = logs.filter(e => e.type === options.type)
    const limit = options.limit ?? 50
    return logs.slice(-limit)
  }

  /**
   * 获取调度器统计信息
   */
  getStats() {
    let active = 0, paused = 0, totalRuns = 0
    for (const entry of this._schedules.values()) {
      if (entry.paused) paused++
      else active++
      totalRuns += entry.runCount
    }
    return {
      totalTasks: this._schedules.size,
      activeTasks: active,
      pausedTasks: paused,
      totalRuns,
      logSize: this._eventLog.length,
    }
  }

  /**
   * 取消所有定时任务并清理
   */
  cancelAll() {
    for (const taskId of [...this._schedules.keys()]) {
      this.cancelSchedule(taskId)
    }
  }

  /**
   * 获取单个任务详情
   * @param {string} taskId
   * @returns {ScheduleInfo|null}
   */
  getSchedule(taskId) {
    const entry = this._schedules.get(taskId)
    if (!entry) return null
    return {
      taskId: entry.taskId,
      type: entry.type,
      interval: entry.interval,
      createdAt: entry.createdAt,
      lastRunAt: entry.lastRunAt,
      nextRunAt: entry.nextRunAt,
      runCount: entry.runCount,
      status: entry.paused ? 'paused' : 'active',
      options: { ...entry.options },
    }
  }
}

/**
 * @typedef {Object} ScheduleEntry
 * @property {string}  taskId
 * @property {string}  type
 * @property {number}  interval
 * @property {Object}  options
 * @property {number}  createdAt
 * @property {number|null} lastRunAt
 * @property {number|null} nextRunAt
 * @property {number}  runCount
 * @property {boolean} paused
 */

/**
 * @typedef {Object} ScheduleInfo
 * @property {string}  taskId
 * @property {string}  type
 * @property {number}  interval
 * @property {number}  createdAt
 * @property {number|null} lastRunAt
 * @property {number|null} nextRunAt
 * @property {number}  runCount
 * @property {string}  status — 'active' | 'paused'
 * @property {Object}  options
 */

/**
 * @typedef {Object} EventLogEntry
 * @property {string}  taskId
 * @property {string}  type
 * @property {string}  action
 * @property {*}       detail
 * @property {number}  timestamp
 */

export {
  BookmarkScheduler,
  TASK_TYPES,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MAX_TASKS,
  MAX_EVENT_LOG,
  DEFAULT_INTERVALS,
  validateInterval,
  generateTaskId,
}
export default BookmarkScheduler
