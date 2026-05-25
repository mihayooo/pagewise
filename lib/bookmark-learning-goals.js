/**
 * BookmarkLearningGoals — 学习目标打卡系统
 *
 * 用户设定学习目标 → 每日打卡 → 连续天数追踪 → 成就解锁
 *
 * 功能：
 *   - createGoal(name, options?)      — 创建学习目标
 *   - checkIn(goalId, date?)          — 每日打卡
 *   - getGoal(goalId)                 — 获取目标详情
 *   - getAllGoals()                    — 获取所有目标
 *   - deleteGoal(goalId)              — 删除目标
 *   - getStreak(goalId)               — 获取连续打卡天数
 *   - getAchievements(goalId?)        — 获取已解锁成就
 *   - getStats()                      — 全局统计
 *   - exportData() / importData(data) — 序列化/反序列化
 *
 * 成就等级：
 *   - 连续 3 天: "初学者" 🔥
 *   - 连续 7 天: "坚持者" ⭐
 *   - 连续 14 天: "达人" 🏆
 *   - 连续 30 天: "大师" 👑
 *   - 连续 100 天: "传奇" 💎
 *
 * @module lib/bookmark-learning-goals
 */

// ==================== 常量 ====================

/** 成就里程碑定义 */
export const ACHIEVEMENT_MILESTONES = [
  { days: 3,   name: '初学者', emoji: '🔥', description: '连续打卡 3 天' },
  { days: 7,   name: '坚持者', emoji: '⭐', description: '连续打卡 7 天' },
  { days: 14,  name: '达人',   emoji: '🏆', description: '连续打卡 14 天' },
  { days: 30,  name: '大师',   emoji: '👑', description: '连续打卡 30 天' },
  { days: 100, name: '传奇',   emoji: '💎', description: '连续打卡 100 天' },
];

/** 默认目标模板 */
export const DEFAULT_GOAL_TEMPLATES = {
  daily_reading: { name: '每日阅读', targetDays: 30, icon: '📖' },
  daily_review:  { name: '每日复习', targetDays: 30, icon: '🔄' },
  weekly_summary: { name: '每周总结', targetDays: 12, icon: '📝' },
};

const DATA_VERSION = 1;
const _MS_PER_DAY = 86400000;

// ==================== BookmarkLearningGoals ====================

/** BookmarkLearningGoals 类 */
export class BookmarkLearningGoals {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now]   — 时间源（测试用），默认 Date.now
   * @param {Object}   [options.data]  — 导入数据
   */
  constructor(options = {}) {
    this._now = options.now || (() => Date.now());
    /** @type {Map<string, Goal>} */
    this._goals = new Map();
    /** @type {Map<string, Achievement[]>} goalId → achievements */
    this._achievements = new Map();

    if (options.data) {
      this.importData(options.data);
    }
  }

  /**
   * 创建学习目标
   * @param {string} name     — 目标名称
   * @param {Object} [options]
   * @param {number} [options.targetDays]   — 目标天数（默认 30）
   * @param {string} [options.icon]         — 图标
   * @param {string} [options.description]  — 描述
   * @returns {Goal}
   */
  createGoal(name, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('目标名称不能为空');
    }

    const id = 'goal_' + this._now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const now = this._now();

    const goal = {
      id,
      name: name.trim(),
      description: options.description || '',
      icon: options.icon || '🎯',
      targetDays: options.targetDays || 30,
      createdAt: now,
      checkIns: [],         // YYYY-MM-DD 格式的打卡记录
      currentStreak: 0,
      longestStreak: 0,
      lastCheckInDate: null,
      completed: false,
    };

    this._goals.set(id, goal);
    this._achievements.set(id, []);

    return { ...goal };
  }

  /**
   * 每日打卡
   * @param {string} goalId   — 目标 ID
   * @param {string} [date]   — 打卡日期 YYYY-MM-DD（默认今天）
   * @returns {{ goal: Goal, newAchievements: Achievement[], streak: number }}
   * @throws {Error} 目标不存在或今日已打卡
   */
  checkIn(goalId, date) {
    const goal = this._goals.get(goalId);
    if (!goal) {
      throw new Error(`目标不存在: ${goalId}`);
    }

    const today = date || this._today();
    const checkInDate = typeof today === 'string' ? today : this._today();

    // 检查是否已打卡
    if (goal.checkIns.includes(checkInDate)) {
      throw new Error(`今日 (${checkInDate}) 已打卡`);
    }

    // 添加打卡记录
    goal.checkIns.push(checkInDate);
    goal.checkIns.sort(); // 保持有序

    // 更新 streak
    const yesterday = this._addDays(checkInDate, -1);

    if (goal.lastCheckInDate === yesterday) {
      // 连续
      goal.currentStreak += 1;
    } else if (goal.lastCheckInDate === checkInDate) {
      // 同一天重复（不应走到这里，上面已拦截）
      return { goal: { ...goal }, newAchievements: [], streak: goal.currentStreak };
    } else {
      // 断了或首次
      goal.currentStreak = 1;
    }

    goal.lastCheckInDate = checkInDate;

    if (goal.currentStreak > goal.longestStreak) {
      goal.longestStreak = goal.currentStreak;
    }

    // 检查是否完成目标天数
    if (goal.checkIns.length >= goal.targetDays && !goal.completed) {
      goal.completed = true;
    }

    // 检查成就
    const newAchievements = this._checkAchievements(goalId, goal.currentStreak);

    return {
      goal: { ...goal, checkIns: [...goal.checkIns] },
      newAchievements,
      streak: goal.currentStreak,
    };
  }

  /**
   * 获取目标详情
   * @param {string} goalId
   * @returns {Goal|null}
   */
  getGoal(goalId) {
    const goal = this._goals.get(goalId);
    return goal ? { ...goal, checkIns: [...goal.checkIns] } : null;
  }

  /**
   * 获取所有目标
   * @returns {Goal[]}
   */
  getAllGoals() {
    const result = [];
    for (const goal of this._goals.values()) {
      result.push({ ...goal, checkIns: [...goal.checkIns] });
    }
    return result;
  }

  /**
   * 删除目标
   * @param {string} goalId
   * @returns {boolean}
   */
  deleteGoal(goalId) {
    this._achievements.delete(goalId);
    return this._goals.delete(goalId);
  }

  /**
   * 获取目标的连续打卡天数
   * @param {string} goalId
   * @returns {{ currentStreak: number, longestStreak: number }}
   */
  getStreak(goalId) {
    const goal = this._goals.get(goalId);
    if (!goal) {
      throw new Error(`目标不存在: ${goalId}`);
    }
    return {
      currentStreak: goal.currentStreak,
      longestStreak: goal.longestStreak,
    };
  }

  /**
   * 获取成就列表
   * @param {string} [goalId] — 指定目标 ID，不传则返回所有成就
   * @returns {Achievement[]}
   */
  getAchievements(goalId) {
    if (goalId) {
      return this._achievements.get(goalId) || [];
    }
    const all = [];
    for (const achievements of this._achievements.values()) {
      all.push(...achievements);
    }
    return all;
  }

  /**
   * 全局统计
   * @returns {GoalStats}
   */
  getStats() {
    const goals = this.getAllGoals();
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.completed).length;
    const activeGoals = totalGoals - completedGoals;
    const totalCheckIns = goals.reduce((sum, g) => sum + g.checkIns.length, 0);
    const longestStreak = goals.reduce((max, g) => Math.max(max, g.longestStreak), 0);
    const totalAchievements = this.getAchievements().length;

    return {
      totalGoals,
      completedGoals,
      activeGoals,
      totalCheckIns,
      longestStreak,
      totalAchievements,
    };
  }

  /**
   * 导出数据
   * @returns {ExportData}
   */
  exportData() {
    const goals = [];
    for (const [_id, goal] of this._goals) {
      goals.push({ ...goal, checkIns: [...goal.checkIns] });
    }

    const achievements = {};
    for (const [goalId, achs] of this._achievements) {
      achievements[goalId] = achs.map(a => ({ ...a }));
    }

    return {
      version: DATA_VERSION,
      goals,
      achievements,
      exportedAt: this._now(),
    };
  }

  /**
   * 导入数据
   * @param {ExportData} data
   */
  importData(data) {
    if (!data || !Array.isArray(data.goals)) {
      throw new Error('invalid import data: missing goals array');
    }

    this._goals.clear();
    this._achievements.clear();

    for (const goal of data.goals) {
      if (!goal || !goal.id) continue;
      this._goals.set(goal.id, {
        ...goal,
        checkIns: Array.isArray(goal.checkIns) ? [...goal.checkIns] : [],
      });
    }

    if (data.achievements && typeof data.achievements === 'object') {
      for (const [goalId, achs] of Object.entries(data.achievements)) {
        this._achievements.set(goalId, Array.isArray(achs) ? achs.map(a => ({ ...a })) : []);
      }
    }
  }

  // ─── 内部方法 ─────────────────────────────────────────────────

  /** @private 获取今天日期 YYYY-MM-DD */
  _today() {
    return new Date(this._now()).toISOString().slice(0, 10);
  }

  /** @private 日期加减天数 */
  _addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** @private 检查并解锁成就 */
  _checkAchievements(goalId, currentStreak) {
    const existing = this._achievements.get(goalId) || [];
    const existingDays = new Set(existing.map(a => a.days));
    const newAchievements = [];

    for (const milestone of ACHIEVEMENT_MILESTONES) {
      if (currentStreak >= milestone.days && !existingDays.has(milestone.days)) {
        const achievement = {
          ...milestone,
          goalId,
          unlockedAt: this._now(),
        };
        existing.push(achievement);
        newAchievements.push(achievement);
      }
    }

    this._achievements.set(goalId, existing);
    return newAchievements;
  }
}

// ==================== 类型定义 ====================

/**
 * @typedef {Object} Goal
 * @property {string}   id
 * @property {string}   name
 * @property {string}   description
 * @property {string}   icon
 * @property {number}   targetDays
 * @property {number}   createdAt
 * @property {string[]} checkIns — YYYY-MM-DD 格式
 * @property {number}   currentStreak
 * @property {number}   longestStreak
 * @property {string|null} lastCheckInDate
 * @property {boolean}  completed
 */

/**
 * @typedef {Object} Achievement
 * @property {number}   days
 * @property {string}   name
 * @property {string}   emoji
 * @property {string}   description
 * @property {string}   goalId
 * @property {number}   unlockedAt
 */

export default BookmarkLearningGoals;
