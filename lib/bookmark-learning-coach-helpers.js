/**
 * BookmarkLearningCoach — 辅助方法
 *
 * 从 bookmark-learning-coach.js 拆分的内部方法:
 *   - _today()       — 获取今日日期字符串
 *   - _createTask()  — 创建任务对象
 *   - _shuffle()     — Fisher-Yates 洗牌
 *   - _estimateTime() — 预估阅读时间
 *   - _updatePlanProgress() — 更新计划进度
 *   - _getPlan()     — 获取计划（深拷贝 tasks）
 *
 * @module lib/bookmark-learning-coach-helpers
 */

import { TASK_STATUS } from './bookmark-learning-coach-constants.js'

/** @private 获取今日日期 (YYYY-MM-DD) */
export function today(nowFn) {
  return new Date(nowFn()).toISOString().slice(0, 10)
}

/** @private 创建任务 */
export function createTask({ type, title, bookmarkId, url, estimatedMinutes, nowFn }) {
  const id = 'task_' + nowFn().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
  return {
    id,
    type,
    title,
    bookmarkId: bookmarkId || null,
    url: url || '',
    estimatedMinutes: estimatedMinutes || 5,
    status: TASK_STATUS.PENDING,
    createdAt: nowFn(),
    startedAt: null,
    completedAt: null,
    skippedAt: null,
  }
}

/** @private 更新计划进度 */
export function updatePlanProgress(task, plansMap) {
  for (const [_date, plan] of plansMap) {
    const taskInPlan = plan.tasks.find(t => t.id === task.id)
    if (taskInPlan) {
      plan.completedTasks = (plan.completedTasks || 0) + 1
      if (plan.completedTasks >= plan.totalTasks) {
        plan.status = 'completed'
      }
      break
    }
  }
}

/** @private 获取计划（深拷贝 tasks） */
export function getPlan(date, plansMap, tasksMap) {
  const plan = plansMap.get(date)
  if (!plan) return null
  return {
    ...plan,
    tasks: plan.tasks.map(t => {
      const task = tasksMap.get(t.id || t)
      return task ? { ...task } : t
    }),
  }
}

/** @private 预估阅读时间 */
export function estimateTime(bookmark, profile) {
  if (profile && profile.difficultyPreference === 'beginner') return 10
  if (profile && profile.difficultyPreference === 'advanced') return 20
  return 15
}

/** @private Fisher-Yates 洗牌 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
