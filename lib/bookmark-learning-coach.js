/**
 * BookmarkLearningCoach — 学习教练每日计划
 *
 * 为用户生成个性化每日学习计划，追踪执行情况，提供回顾反馈。
 *
 * 功能：
 *   - generateDailyPlan(bookmarks, profile?)  — 生成今日学习计划
 *   - startTask(taskId)                       — 开始执行任务
 *   - completeTask(taskId)                    — 完成任务
 *   - skipTask(taskId)                        — 跳过任务
 *   - getTodayPlan()                          — 获取今日计划
 *   - getDailyReview(date?)                   — 教练回顾
 *   - getWeeklyReview()                       — 周回顾
 *   - getStats()                              — 统计
 *   - exportData() / importData(data)         — 序列化
 *
 * @module lib/bookmark-learning-coach
 */

import {
  DEFAULT_DAILY_TASKS,
  TASK_TYPES,
  TASK_STATUS,
  DATA_VERSION,
} from './bookmark-learning-coach-constants.js'

import {
  today,
  createTask,
  updatePlanProgress,
  getPlan,
  estimateTime,
  shuffle,
} from './bookmark-learning-coach-helpers.js'

// ==================== BookmarkLearningCoach ====================

export class BookmarkLearningCoach {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now]           — 时间源（测试用）
   * @param {number}   [options.dailyTasks]    — 每日任务数（默认 5）
   * @param {Object}   [options.data]          — 导入数据
   */
  constructor(options = {}) {
    this._now = options.now || (() => Date.now())
    this._dailyTasks = options.dailyTasks || DEFAULT_DAILY_TASKS
    /** @type {Map<string, DayPlan>} date → plan */
    this._plans = new Map()
    /** @type {Map<string, Task>} taskId → task */
    this._tasks = new Map()
  }

  /**
   * 生成今日学习计划
   *
   * @param {Object[]} bookmarks — 可用书签列表
   * @param {Object}   [profile] — 用户画像（可选）
   * @returns {DayPlan}
   */
  generateDailyPlan(bookmarks = [], profile = null) {
    const todayDate = today(this._now)

    if (this._plans.has(todayDate)) {
      return getPlan(todayDate, this._plans, this._tasks)
    }

    const tasks = []
    const totalTasks = this._dailyTasks

    const newCount = Math.ceil(totalTasks * 0.4)
    const reviewCount = Math.ceil(totalTasks * 0.4)
    const otherCount = totalTasks - newCount - reviewCount

    const unreadBookmarks = bookmarks.filter(b => b.status === 'unread' || b.status === 'reading')
    const shuffled = shuffle([...unreadBookmarks])

    for (let i = 0; i < newCount && i < shuffled.length; i++) {
      tasks.push(createTask({
        type: TASK_TYPES.NEW_READING,
        title: `阅读: ${shuffled[i].title || shuffled[i].url || '未知'}`,
        bookmarkId: shuffled[i].id,
        url: shuffled[i].url || '',
        estimatedMinutes: estimateTime(shuffled[i], profile),
        nowFn: this._now,
      }))
    }

    for (let i = 0; i < reviewCount; i++) {
      tasks.push(createTask({
        type: TASK_TYPES.REVIEW,
        title: `复习 #${i + 1}`,
        estimatedMinutes: 5,
        nowFn: this._now,
      }))
    }

    for (let i = 0; i < otherCount; i++) {
      tasks.push(createTask({
        type: i % 2 === 0 ? TASK_TYPES.HIGHLIGHT_ARCHIVE : TASK_TYPES.LEARNING_GOAL,
        title: i % 2 === 0 ? '摘录归档' : '目标打卡',
        estimatedMinutes: 3,
        nowFn: this._now,
      }))
    }

    const plan = {
      date: todayDate,
      tasks,
      totalTasks: tasks.length,
      completedTasks: 0,
      totalEstimatedMinutes: tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0),
      status: 'active',
      createdAt: this._now(),
    }

    this._plans.set(todayDate, plan)

    for (const task of tasks) {
      this._tasks.set(task.id, task)
    }

    return getPlan(todayDate, this._plans, this._tasks)
  }

  startTask(taskId) {
    const task = this._tasks.get(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)
    if (task.status !== TASK_STATUS.PENDING) {
      throw new Error(`任务状态不是 pending: ${task.status}`)
    }

    task.status = TASK_STATUS.IN_PROGRESS
    task.startedAt = this._now()
    return { ...task }
  }

  completeTask(taskId) {
    const task = this._tasks.get(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)
    if (task.status === TASK_STATUS.COMPLETED) {
      throw new Error('任务已完成')
    }

    task.status = TASK_STATUS.COMPLETED
    task.completedAt = this._now()

    updatePlanProgress(task, this._plans)

    return { ...task }
  }

  skipTask(taskId) {
    const task = this._tasks.get(taskId)
    if (!task) throw new Error(`任务不存在: ${taskId}`)

    task.status = TASK_STATUS.SKIPPED
    task.skippedAt = this._now()

    return { ...task }
  }

  getTodayPlan() {
    return getPlan(today(this._now), this._plans, this._tasks)
  }

  getDailyReview(date) {
    const d = date || today(this._now)
    const plan = this._plans.get(d)

    if (!plan) {
      return {
        date: d,
        hasPlan: false,
        message: '该日没有学习计划',
        completedTasks: 0,
        totalTasks: 0,
        completionRate: 0,
      }
    }

    const tasks = plan.tasks.map(tid => this._tasks.get(tid.id)).filter(Boolean)
    const completed = tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length
    const skipped = tasks.filter(t => t.status === TASK_STATUS.SKIPPED).length
    const total = tasks.length
    const rate = total > 0 ? completed / total : 0

    let message
    if (rate >= 1.0) {
      message = '太棒了！今天的学习计划全部完成 🎉'
    } else if (rate >= 0.7) {
      message = '今天表现不错，完成了大部分计划 👍'
    } else if (rate >= 0.3) {
      message = '今天完成了一部分，明天继续加油 💪'
    } else {
      message = '今天执行较少，明天试着多完成一些 🌟'
    }

    return {
      date: d,
      hasPlan: true,
      message,
      completedTasks: completed,
      skippedTasks: skipped,
      totalTasks: total,
      completionRate: Math.round(rate * 100),
      totalEstimatedMinutes: plan.totalEstimatedMinutes,
    }
  }

  getWeeklyReview() {
    const now = new Date(this._now())
    const reviews = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      reviews.push(this.getDailyReview(dateStr))
    }

    const totalCompleted = reviews.reduce((sum, r) => sum + r.completedTasks, 0)
    const totalTasks = reviews.reduce((sum, r) => sum + r.totalTasks, 0)
    const activeDays = reviews.filter(r => r.hasPlan && r.completedTasks > 0).length

    return {
      reviews,
      totalCompleted,
      totalTasks,
      activeDays,
      averageCompletionRate: totalTasks > 0
        ? Math.round((totalCompleted / totalTasks) * 100)
        : 0,
    }
  }

  getStats() {
    const allTasks = [...this._tasks.values()]
    const completed = allTasks.filter(t => t.status === TASK_STATUS.COMPLETED)
    const totalPlans = this._plans.size

    return {
      totalPlans,
      totalTasks: allTasks.length,
      completedTasks: completed.length,
      skippedTasks: allTasks.filter(t => t.status === TASK_STATUS.SKIPPED).length,
      averageTasksPerPlan: totalPlans > 0
        ? Math.round(allTasks.length / totalPlans * 10) / 10
        : 0,
    }
  }

  exportData() {
    const plans = {}
    for (const [date, plan] of this._plans) {
      plans[date] = { ...plan, tasks: plan.tasks.map(t => ({ ...t })) }
    }

    const tasks = {}
    for (const [id, task] of this._tasks) {
      tasks[id] = { ...task }
    }

    return {
      version: DATA_VERSION,
      plans,
      tasks,
      dailyTasks: this._dailyTasks,
      exportedAt: this._now(),
    }
  }

  importData(data) {
    if (!data) throw new Error('invalid import data')

    this._plans.clear()
    this._tasks.clear()

    if (data.plans && typeof data.plans === 'object') {
      for (const [date, plan] of Object.entries(data.plans)) {
        this._plans.set(date, { ...plan, tasks: Array.isArray(plan.tasks) ? [...plan.tasks] : [] })
      }
    }

    if (data.tasks && typeof data.tasks === 'object') {
      for (const [id, task] of Object.entries(data.tasks)) {
        this._tasks.set(id, { ...task })
      }
    }
  }
}

export { TASK_TYPES, TASK_STATUS } from './bookmark-learning-coach-constants.js'

export default BookmarkLearningCoach
