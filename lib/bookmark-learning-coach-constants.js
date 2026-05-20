/**
 * BookmarkLearningCoach — 常量定义
 *
 * 从 bookmark-learning-coach.js 拆分的常量:
 *   - DEFAULT_DAILY_TASKS
 *   - TASK_TYPES
 *   - TASK_STATUS
 *   - DATA_VERSION
 *   - _MS_PER_DAY
 *
 * @module lib/bookmark-learning-coach-constants
 */

export const DEFAULT_DAILY_TASKS = 5

export const TASK_TYPES = {
  NEW_READING: 'new_reading',
  REVIEW: 'review',
  HIGHLIGHT_ARCHIVE: 'highlight_archive',
  LEARNING_GOAL: 'learning_goal',
}

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
}

export const DATA_VERSION = 1

export const _MS_PER_DAY = 86400000
