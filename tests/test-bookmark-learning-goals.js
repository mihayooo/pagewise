/**
 * R382: BookmarkLearningGoals 单元测试
 *
 * 覆盖: createGoal, checkIn, getGoal, getAllGoals, deleteGoal,
 *       getStreak, getAchievements, getStats, exportData/importData,
 *       成就里程碑解锁, 连续打卡计算
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  BookmarkLearningGoals,
  ACHIEVEMENT_MILESTONES,
  DEFAULT_GOAL_TEMPLATES,
} from '../lib/bookmark-learning-goals.js'

// ==================== 辅助: 可控时间源 ====================

/**
 * 创建可控时间源，从指定日期开始
 * @param {string} startDate - YYYY-MM-DD
 * @returns {{ now: () => number, advance: (days: number) => void, dateStr: () => string }}
 */
function createTimeSource (startDate) {
  let current = new Date(startDate + 'T12:00:00Z').getTime()
  return {
    now: () => current,
    advance: (days) => { current += days * 86400000 },
    dateStr: () => new Date(current).toISOString().slice(0, 10),
  }
}

// ==================== 测试 ====================

describe('BookmarkLearningGoals', () => {
  let goals
  let clock

  beforeEach(() => {
    clock = createTimeSource('2026-01-01')
    goals = new BookmarkLearningGoals({ now: clock.now })
  })

  // ─── 1. 常量导出 ─────────────────────────────────────────────

  describe('constants', () => {
    it('ACHIEVEMENT_MILESTONES 应包含 5 个里程碑', () => {
      assert.equal(ACHIEVEMENT_MILESTONES.length, 5)
      assert.deepEqual(
        ACHIEVEMENT_MILESTONES.map(m => m.days),
        [3, 7, 14, 30, 100],
      )
    })

    it('每个里程碑应有 name/emoji/description', () => {
      for (const m of ACHIEVEMENT_MILESTONES) {
        assert.ok(m.name, `days=${m.days} should have name`)
        assert.ok(m.emoji, `days=${m.days} should have emoji`)
        assert.ok(m.description, `days=${m.days} should have description`)
      }
    })

    it('DEFAULT_GOAL_TEMPLATES 应包含 3 个模板', () => {
      const keys = Object.keys(DEFAULT_GOAL_TEMPLATES)
      assert.equal(keys.length, 3)
      for (const tpl of Object.values(DEFAULT_GOAL_TEMPLATES)) {
        assert.ok(tpl.name)
        assert.ok(tpl.targetDays > 0)
        assert.ok(tpl.icon)
      }
    })
  })

  // ─── 2. createGoal ───────────────────────────────────────────

  describe('createGoal', () => {
    it('创建目标返回完整结构', () => {
      const goal = goals.createGoal('每日阅读')
      assert.ok(goal.id.startsWith('goal_'))
      assert.equal(goal.name, '每日阅读')
      assert.equal(goal.description, '')
      assert.equal(goal.icon, '🎯')
      assert.equal(goal.targetDays, 30)
      assert.ok(goal.createdAt > 0)
      assert.deepEqual(goal.checkIns, [])
      assert.equal(goal.currentStreak, 0)
      assert.equal(goal.longestStreak, 0)
      assert.equal(goal.lastCheckInDate, null)
      assert.equal(goal.completed, false)
    })

    it('支持自定义选项', () => {
      const goal = goals.createGoal('复习', {
        targetDays: 7,
        icon: '📖',
        description: '每天复习',
      })
      assert.equal(goal.targetDays, 7)
      assert.equal(goal.icon, '📖')
      assert.equal(goal.description, '每天复习')
    })

    it('name 会 trim', () => {
      const goal = goals.createGoal('  hello  ')
      assert.equal(goal.name, 'hello')
    })

    it('空名称应抛错', () => {
      assert.throws(() => goals.createGoal(''), /目标名称不能为空/)
      assert.throws(() => goals.createGoal(null), /目标名称不能为空/)
      assert.throws(() => goals.createGoal(undefined), /目标名称不能为空/)
    })

    it('非字符串名称应抛错', () => {
      assert.throws(() => goals.createGoal(123), /目标名称不能为空/)
    })

    it('创建多个目标应有不同 ID', () => {
      clock.advance(1)
      const g1 = goals.createGoal('A')
      const g2 = goals.createGoal('B')
      assert.notEqual(g1.id, g2.id)
    })
  })

  // ─── 3. getGoal / getAllGoals ─────────────────────────────────

  describe('getGoal / getAllGoals', () => {
    it('getGoal 返回目标副本', () => {
      const created = goals.createGoal('测试')
      const fetched = goals.getGoal(created.id)
      assert.deepEqual(fetched.name, '测试')
      // 修改 fetched 不影响内部
      fetched.name = 'changed'
      assert.equal(goals.getGoal(created.id).name, '测试')
    })

    it('getGoal 不存在返回 null', () => {
      assert.equal(goals.getGoal('nonexistent'), null)
    })

    it('getAllGoals 返回所有目标', () => {
      goals.createGoal('A')
      goals.createGoal('B')
      const all = goals.getAllGoals()
      assert.equal(all.length, 2)
    })

    it('getAllGoals 空时返回空数组', () => {
      assert.deepEqual(goals.getAllGoals(), [])
    })

    it('getAllGoals 返回副本', () => {
      goals.createGoal('A')
      const all = goals.getAllGoals()
      all[0].name = 'changed'
      assert.equal(goals.getAllGoals()[0].name, 'A')
    })
  })

  // ─── 4. deleteGoal ───────────────────────────────────────────

  describe('deleteGoal', () => {
    it('删除存在的目标返回 true', () => {
      const g = goals.createGoal('A')
      assert.equal(goals.deleteGoal(g.id), true)
      assert.equal(goals.getGoal(g.id), null)
    })

    it('删除不存在的目标返回 false', () => {
      assert.equal(goals.deleteGoal('nonexistent'), false)
    })

    it('删除目标同时清除成就', () => {
      const g = goals.createGoal('A')
      goals.checkIn(g.id, '2026-01-01')
      goals.checkIn(g.id, '2026-01-02')
      goals.checkIn(g.id, '2026-01-03')
      const achs = goals.getAchievements(g.id)
      assert.ok(achs.length > 0, 'should have achievements before delete')
      goals.deleteGoal(g.id)
      assert.deepEqual(goals.getAchievements(g.id), [])
    })
  })

  // ─── 5. checkIn 基本功能 ─────────────────────────────────────

  describe('checkIn', () => {
    let goal

    beforeEach(() => {
      goal = goals.createGoal('每日打卡')
    })

    it('首次打卡成功', () => {
      const result = goals.checkIn(goal.id, '2026-01-01')
      assert.equal(result.streak, 1)
      assert.equal(result.goal.currentStreak, 1)
      assert.equal(result.goal.lastCheckInDate, '2026-01-01')
      assert.deepEqual(result.goal.checkIns, ['2026-01-01'])
    })

    it('连续打卡 streak 递增', () => {
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      const r = goals.checkIn(goal.id, '2026-01-03')
      assert.equal(r.streak, 3)
      assert.equal(r.goal.longestStreak, 3)
    })

    it('重复同日打卡应抛错', () => {
      goals.checkIn(goal.id, '2026-01-01')
      assert.throws(
        () => goals.checkIn(goal.id, '2026-01-01'),
        /今日.*已打卡/,
      )
    })

    it('断签后 streak 重置为 1', () => {
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      // 跳过 01-03
      const r = goals.checkIn(goal.id, '2026-01-04')
      assert.equal(r.streak, 1)
    })

    it('断签后重新连续打卡', () => {
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      goals.checkIn(goal.id, '2026-01-05') // 断签
      goals.checkIn(goal.id, '2026-01-06')
      const r = goals.checkIn(goal.id, '2026-01-07')
      assert.equal(r.streak, 3)
    })

    it('longestStreak 保持历史最高', () => {
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      goals.checkIn(goal.id, '2026-01-03') // streak=3
      goals.checkIn(goal.id, '2026-01-05') // 断签, streak=1
      const updated = goals.getGoal(goal.id)
      assert.equal(updated.longestStreak, 3)
      assert.equal(updated.currentStreak, 1)
    })

    it('不存在的目标应抛错', () => {
      assert.throws(
        () => goals.checkIn('nonexistent', '2026-01-01'),
        /目标不存在/,
      )
    })

    it('checkIns 保持排序', () => {
      goals.checkIn(goal.id, '2026-01-03')
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      const g = goals.getGoal(goal.id)
      assert.deepEqual(g.checkIns, ['2026-01-01', '2026-01-02', '2026-01-03'])
    })
  })

  // ─── 6. 目标完成 ─────────────────────────────────────────────

  describe('goal completion', () => {
    it('打卡达到 targetDays 后标记完成', () => {
      const goal = goals.createGoal('3天挑战', { targetDays: 3 })
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      const r = goals.checkIn(goal.id, '2026-01-03')
      assert.equal(r.goal.completed, true)
    })

    it('未达标时 completed 为 false', () => {
      const goal = goals.createGoal('30天挑战', { targetDays: 30 })
      goals.checkIn(goal.id, '2026-01-01')
      assert.equal(goals.getGoal(goal.id).completed, false)
    })
  })

  // ─── 7. getStreak ────────────────────────────────────────────

  describe('getStreak', () => {
    it('返回当前和最长连续天数', () => {
      const goal = goals.createGoal('A')
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      const s = goals.getStreak(goal.id)
      assert.equal(s.currentStreak, 2)
      assert.equal(s.longestStreak, 2)
    })

    it('不存在目标应抛错', () => {
      assert.throws(() => goals.getStreak('x'), /目标不存在/)
    })

    it('无打卡记录返回 0', () => {
      const goal = goals.createGoal('A')
      const s = goals.getStreak(goal.id)
      assert.equal(s.currentStreak, 0)
      assert.equal(s.longestStreak, 0)
    })
  })

  // ─── 8. 成就解锁 ────────────────────────────────────────────

  describe('achievements', () => {
    let goal

    beforeEach(() => {
      goal = goals.createGoal('成就测试')
    })

    it('连续 3 天解锁"初学者"', () => {
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      const r = goals.checkIn(goal.id, '2026-01-03')
      assert.equal(r.newAchievements.length, 1)
      assert.equal(r.newAchievements[0].name, '初学者')
      assert.equal(r.newAchievements[0].days, 3)
    })

    it('连续 7 天解锁"坚持者"', () => {
      for (let i = 1; i <= 7; i++) {
        goals.checkIn(goal.id, `2026-01-${String(i).padStart(2, '0')}`)
      }
      const achs = goals.getAchievements(goal.id)
      const names = achs.map(a => a.name)
      assert.ok(names.includes('初学者'))
      assert.ok(names.includes('坚持者'))
    })

    it('每个里程碑只解锁一次', () => {
      // 打卡 3 天
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      goals.checkIn(goal.id, '2026-01-03')
      const achs1 = goals.getAchievements(goal.id)
      assert.equal(achs1.length, 1)

      // 继续打卡到 4 天，不应重复解锁 3 天成就
      goals.checkIn(goal.id, '2026-01-04')
      const achs2 = goals.getAchievements(goal.id)
      const beginnerCount = achs2.filter(a => a.days === 3).length
      assert.equal(beginnerCount, 1)
    })

    it('断签后重新达到里程碑不重复解锁', () => {
      // 先打 3 天
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      goals.checkIn(goal.id, '2026-01-03')
      // 断签
      goals.checkIn(goal.id, '2026-01-05')
      goals.checkIn(goal.id, '2026-01-06')
      goals.checkIn(goal.id, '2026-01-07') // 又 3 天连续
      const achs = goals.getAchievements(goal.id)
      const beginnerCount = achs.filter(a => a.days === 3).length
      assert.equal(beginnerCount, 1, '初学者成就不应重复解锁')
    })

    it('getAchievements 不传参数返回所有目标的成就', () => {
      const g2 = goals.createGoal('另一个')
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      goals.checkIn(goal.id, '2026-01-03')
      goals.checkIn(g2.id, '2026-01-01')
      goals.checkIn(g2.id, '2026-01-02')
      goals.checkIn(g2.id, '2026-01-03')
      const all = goals.getAchievements()
      assert.ok(all.length >= 2, 'should have achievements from both goals')
    })

    it('成就包含 goalId 和 unlockedAt', () => {
      goals.checkIn(goal.id, '2026-01-01')
      goals.checkIn(goal.id, '2026-01-02')
      goals.checkIn(goal.id, '2026-01-03')
      const ach = goals.getAchievements(goal.id)[0]
      assert.equal(ach.goalId, goal.id)
      assert.ok(typeof ach.unlockedAt === 'number')
    })

    it('无打卡时成就为空', () => {
      assert.deepEqual(goals.getAchievements(goal.id), [])
    })
  })

  // ─── 9. getStats ─────────────────────────────────────────────

  describe('getStats', () => {
    it('空数据返回全零', () => {
      const stats = goals.getStats()
      assert.deepEqual(stats, {
        totalGoals: 0,
        completedGoals: 0,
        activeGoals: 0,
        totalCheckIns: 0,
        longestStreak: 0,
        totalAchievements: 0,
      })
    })

    it('正确统计多个目标', () => {
      const g1 = goals.createGoal('A', { targetDays: 3 })
      const g2 = goals.createGoal('B', { targetDays: 30 })
      goals.checkIn(g1.id, '2026-01-01')
      goals.checkIn(g1.id, '2026-01-02')
      goals.checkIn(g1.id, '2026-01-03') // g1 完成
      goals.checkIn(g2.id, '2026-01-01')

      const stats = goals.getStats()
      assert.equal(stats.totalGoals, 2)
      assert.equal(stats.completedGoals, 1)
      assert.equal(stats.activeGoals, 1)
      assert.equal(stats.totalCheckIns, 4)
      assert.equal(stats.longestStreak, 3)
      assert.ok(stats.totalAchievements >= 1)
    })
  })

  // ─── 10. exportData / importData ─────────────────────────────

  describe('exportData / importData', () => {
    it('空数据导出导入一致', () => {
      const exported = goals.exportData()
      assert.equal(exported.version, 1)
      assert.deepEqual(exported.goals, [])
      assert.deepEqual(exported.achievements, {})

      const goals2 = new BookmarkLearningGoals({ now: clock.now })
      goals2.importData(exported)
      assert.deepEqual(goals2.getAllGoals(), [])
    })

    it('含打卡数据导出导入一致', () => {
      const g = goals.createGoal('测试')
      goals.checkIn(g.id, '2026-01-01')
      goals.checkIn(g.id, '2026-01-02')

      const exported = goals.exportData()
      const goals2 = new BookmarkLearningGoals({ now: clock.now })
      goals2.importData(exported)

      const imported = goals2.getGoal(g.id)
      assert.equal(imported.name, '测试')
      assert.deepEqual(imported.checkIns, ['2026-01-01', '2026-01-02'])
      assert.equal(imported.currentStreak, 2)
    })

    it('含成就数据导出导入一致', () => {
      const g = goals.createGoal('成就')
      goals.checkIn(g.id, '2026-01-01')
      goals.checkIn(g.id, '2026-01-02')
      goals.checkIn(g.id, '2026-01-03')

      const exported = goals.exportData()
      const goals2 = new BookmarkLearningGoals({ now: clock.now })
      goals2.importData(exported)

      const achs = goals2.getAchievements(g.id)
      assert.ok(achs.length > 0)
      assert.equal(achs[0].name, '初学者')
    })

    it('导入无效数据应抛错', () => {
      assert.throws(() => goals.importData(null), /invalid import data/)
      assert.throws(() => goals.importData({}), /invalid import data/)
      assert.throws(() => goals.importData({ goals: 'not array' }), /invalid import data/)
    })

    it('导入数据会清除旧数据', () => {
      goals.createGoal('old')
      const newData = {
        version: 1,
        goals: [{ id: 'new_1', name: 'new', checkIns: [] }],
        achievements: {},
      }
      goals.importData(newData)
      assert.equal(goals.getAllGoals().length, 1)
      assert.equal(goals.getAllGoals()[0].name, 'new')
    })

    it('导入跳过无 id 的 goal', () => {
      const data = {
        version: 1,
        goals: [
          { id: 'g1', name: 'A', checkIns: [] },
          { name: 'no id' },
          null,
        ],
        achievements: {},
      }
      goals.importData(data)
      assert.equal(goals.getAllGoals().length, 1)
    })

    it('exportedAt 包含时间戳', () => {
      const exported = goals.exportData()
      assert.ok(typeof exported.exportedAt === 'number')
    })
  })

  // ─── 11. 使用 _today() 默认日期 ──────────────────────────────

  describe('default date (today)', () => {
    it('不传日期使用 today', () => {
      const g = goals.createGoal('today test')
      const r = goals.checkIn(g.id) // 不传日期
      assert.equal(r.goal.lastCheckInDate, '2026-01-01')
    })

    it('连续打卡使用 today 计算', () => {
      const g = goals.createGoal('streak test')
      goals.checkIn(g.id) // 2026-01-01
      clock.advance(1)
      goals.checkIn(g.id) // 2026-01-02
      clock.advance(1)
      const r = goals.checkIn(g.id) // 2026-01-03
      assert.equal(r.streak, 3)
    })
  })

  // ─── 12. 边界情况 ────────────────────────────────────────────

  describe('edge cases', () => {
    it('大量目标创建不报错', () => {
      for (let i = 0; i < 100; i++) {
        clock.advance(1)
        goals.createGoal(`Goal ${i}`)
      }
      assert.equal(goals.getAllGoals().length, 100)
    })

    it('checkIn 返回值是副本', () => {
      const g = goals.createGoal('copy test')
      const r1 = goals.checkIn(g.id, '2026-01-01')
      r1.goal.name = 'changed'
      r1.goal.checkIns.push('9999-01-01')
      const r2 = goals.getGoal(g.id)
      assert.equal(r2.name, 'copy test')
      assert.equal(r2.checkIns.length, 1)
    })

    it('importData 缺少 achievements 不报错', () => {
      const data = {
        version: 1,
        goals: [{ id: 'g1', name: 'A', checkIns: [] }],
      }
      goals.importData(data)
      assert.equal(goals.getAllGoals().length, 1)
    })

    it('importData checkIns 非数组时默认空', () => {
      const data = {
        version: 1,
        goals: [{ id: 'g1', name: 'A' }],
        achievements: {},
      }
      goals.importData(data)
      assert.deepEqual(goals.getGoal('g1').checkIns, [])
    })
  })
})
