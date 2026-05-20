/**
 * test-bookmark-user-profile.js — 用户画像与偏好引擎单元测试
 *
 * 测试范围:
 *   UserProfileEngine 构造函数 / setExplicitPreferences / getPreferences /
 *   inferImplicitPreferences / getInterestVector / getProfile / suggestTopics /
 *   buildAIPromptContext / getQueueWeight / recordPreferenceSnapshot /
 *   getPreferenceHistory / exportData / importData / persist / load /
 *   _classifyCategory / updateFromBookmarks
 *
 * 目标: ≥30 用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  UserProfileEngine,
  DOMAIN_CATEGORIES,
  DEFAULT_EXPLICIT_PREFERENCES,
  STORAGE_KEY,
  HISTORY_STORAGE_KEY,
  DATA_VERSION,
} from '../lib/bookmark-user-profile.js';

// ==================== 辅助工厂 ====================

function makeBookmark(id, overrides = {}) {
  return {
    id: String(id),
    title: `Bookmark ${id}`,
    url: `https://example.com/page-${id}`,
    summary: `Summary for bookmark ${id}.`,
    status: 'unread',
    tags: ['tech'],
    folderPath: ['技术'],
    dateAdded: Date.now() - 86400000 * 30,
    ...overrides,
  };
}

function makeFrontendBookmark(id) {
  return makeBookmark(id, {
    title: 'React Hooks Tutorial',
    url: 'https://react.dev/hooks',
    tags: ['react', 'javascript', 'frontend'],
    folderPath: ['前端'],
  });
}

function makeBackendBookmark(id) {
  return makeBookmark(id, {
    title: 'Node.js Express Guide',
    url: 'https://nodejs.org/docs',
    tags: ['nodejs', 'express', 'backend'],
    folderPath: ['后端'],
  });
}

function makeAIBookmark(id) {
  return makeBookmark(id, {
    title: 'PyTorch Deep Learning',
    url: 'https://pytorch.org/tutorials',
    tags: ['pytorch', 'machine-learning', 'deep-learning'],
    folderPath: ['AI/ML'],
  });
}

function makeReadBookmark(id) {
  return makeBookmark(id, { status: 'read' });
}

function makeStorageMock() {
  const store = {};
  return {
    get(keys, cb) {
      const result = {};
      if (typeof keys === 'string') {
        result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) result[k] = store[k];
      } else if (keys && typeof keys === 'object') {
        for (const k of Object.keys(keys)) {
          result[k] = store[k] !== undefined ? store[k] : keys[k];
        }
      }
      cb(result);
    },
    set(items, cb) {
      Object.assign(store, items);
      if (cb) cb();
    },
    _store: store,
  };
}

// ==================== 测试 ====================

describe('UserProfileEngine', () => {

  // ─── 构造函数 ───────────────────────────────────────────────────

  describe('构造函数', () => {
    it('1. 默认构造应初始化空画像', () => {
      const engine = new UserProfileEngine();
      const profile = engine.getProfile();
      assert.ok(profile.interestVector);
      assert.equal(Object.keys(profile.interestVector).length, DOMAIN_CATEGORIES.length);
    });

    it('2. 构造函数应接受自定义选项', () => {
      const storage = makeStorageMock();
      const engine = new UserProfileEngine({
        now: () => 1700000000000,
        storage: { sync: storage },
      });
      assert.ok(engine);
    });

    it('3. DOMAIN_CATEGORIES 应包含 14 个领域', () => {
      assert.equal(DOMAIN_CATEGORIES.length, 14);
      const names = DOMAIN_CATEGORIES.map(c => c.name);
      assert.ok(names.includes('前端'));
      assert.ok(names.includes('后端'));
      assert.ok(names.includes('AI/ML'));
      assert.ok(names.includes('架构'));
      assert.ok(names.includes('性能'));
    });

    it('4. DEFAULT_EXPLICIT_PREFERENCES 应包含正确默认值', () => {
      assert.ok(Array.isArray(DEFAULT_EXPLICIT_PREFERENCES.interestAreas));
      assert.equal(DEFAULT_EXPLICIT_PREFERENCES.difficultyPreference, 'intermediate');
      assert.equal(DEFAULT_EXPLICIT_PREFERENCES.dailyLearningMinutes, 30);
    });
  });

  // ─── 显性偏好 ───────────────────────────────────────────────────

  describe('显性偏好 setExplicitPreferences / getPreferences', () => {
    it('5. 设置显性偏好应返回更新后的偏好', () => {
      const engine = new UserProfileEngine();
      engine.setExplicitPreferences({
        interestAreas: ['前端', 'AI/ML'],
        difficultyPreference: 'advanced',
        dailyLearningMinutes: 60,
      });
      const prefs = engine.getPreferences();
      assert.deepEqual(prefs.interestAreas, ['前端', 'AI/ML']);
      assert.equal(prefs.difficultyPreference, 'advanced');
      assert.equal(prefs.dailyLearningMinutes, 60);
    });

    it('6. 部分更新显性偏好应保留未设置字段', () => {
      const engine = new UserProfileEngine();
      engine.setExplicitPreferences({ interestAreas: ['前端'] });
      const prefs = engine.getPreferences();
      assert.deepEqual(prefs.interestAreas, ['前端']);
      assert.equal(prefs.difficultyPreference, 'intermediate');
      assert.equal(prefs.dailyLearningMinutes, 30);
    });

    it('7. 无效输入应抛出错误', () => {
      const engine = new UserProfileEngine();
      assert.throws(() => engine.setExplicitPreferences(null), /object/);
    });

    it('8. 无效 difficultyPreference 应被忽略', () => {
      const engine = new UserProfileEngine();
      engine.setExplicitPreferences({ difficultyPreference: 'invalid' });
      const prefs = engine.getPreferences();
      assert.equal(prefs.difficultyPreference, 'intermediate');
    });

    it('9. 无效 dailyLearningMinutes 应被忽略', () => {
      const engine = new UserProfileEngine();
      engine.setExplicitPreferences({ dailyLearningMinutes: -5 });
      const prefs = engine.getPreferences();
      assert.equal(prefs.dailyLearningMinutes, 30);
    });
  });

  // ─── 隐性偏好推断 ───────────────────────────────────────────────

  describe('隐性偏好 inferImplicitPreferences', () => {
    it('10. 从书签历史推断标签频率', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeBookmark(1, { tags: ['react', 'javascript'] }),
        makeBookmark(2, { tags: ['react', 'vue'] }),
        makeBookmark(3, { tags: ['javascript', 'typescript'] }),
      ];
      const implicit = engine.inferImplicitPreferences(bookmarks);
      assert.ok(implicit.tagFrequency);
      assert.ok(implicit.tagFrequency.react >= implicit.tagFrequency.vue);
    });

    it('11. 从书签历史推断域名频率', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeBookmark(1, { url: 'https://react.dev/hooks' }),
        makeBookmark(2, { url: 'https://react.dev/docs' }),
        makeBookmark(3, { url: 'https://nodejs.org/api' }),
      ];
      const implicit = engine.inferImplicitPreferences(bookmarks);
      assert.ok(implicit.domainFrequency);
      assert.ok(implicit.domainFrequency['react.dev'] >= 1);
    });

    it('12. 应计算阅读完成率', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeReadBookmark(1),
        makeReadBookmark(2),
        makeBookmark(3, { status: 'unread' }),
        makeBookmark(4, { status: 'unread' }),
      ];
      const implicit = engine.inferImplicitPreferences(bookmarks);
      assert.equal(implicit.completionRate, 0.5);
    });

    it('13. 空书签数组应返回默认隐性偏好', () => {
      const engine = new UserProfileEngine();
      const implicit = engine.inferImplicitPreferences([]);
      assert.equal(implicit.completionRate, 0);
      assert.deepEqual(implicit.tagFrequency, {});
      assert.deepEqual(implicit.domainFrequency, {});
    });

    it('14. 非数组输入应抛出错误', () => {
      const engine = new UserProfileEngine();
      assert.throws(() => engine.inferImplicitPreferences('invalid'), /array/);
    });
  });

  // ─── 兴趣向量 ───────────────────────────────────────────────────

  describe('兴趣向量 getInterestVector', () => {
    it('15. 应返回 14 维兴趣向量', () => {
      const engine = new UserProfileEngine();
      const vector = engine.getInterestVector();
      assert.equal(Object.keys(vector).length, 14);
      for (const cat of DOMAIN_CATEGORIES) {
        assert.ok(cat.name in vector);
        assert.equal(typeof vector[cat.name], 'number');
      }
    });

    it('16. 前端书签应使前端维度得分更高', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeFrontendBookmark(1),
        makeFrontendBookmark(2),
        makeFrontendBookmark(3),
        makeBackendBookmark(4),
      ];
      engine.updateFromBookmarks(bookmarks);
      const vector = engine.getInterestVector();
      assert.ok(vector['前端'] > vector['后端']);
    });

    it('17. AI/ML 书签应使 AI/ML 维度得分更高', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [makeAIBookmark(1), makeAIBookmark(2)];
      engine.updateFromBookmarks(bookmarks);
      const vector = engine.getInterestVector();
      assert.ok(vector['AI/ML'] > 0);
    });

    it('18. 显性偏好应增强对应维度', () => {
      const engine = new UserProfileEngine();
      engine.setExplicitPreferences({ interestAreas: ['前端', 'AI/ML'] });
      const vector = engine.getInterestVector();
      assert.ok(vector['前端'] > 0);
      assert.ok(vector['AI/ML'] > 0);
    });

    it('19. 向量应归一化到 [0, 1] 范围', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeFrontendBookmark(1), makeFrontendBookmark(2),
        makeBackendBookmark(3), makeAIBookmark(4),
      ];
      engine.updateFromBookmarks(bookmarks);
      const vector = engine.getInterestVector();
      const values = Object.values(vector);
      for (const v of values) {
        assert.ok(v >= 0, `value ${v} should be >= 0`);
        assert.ok(v <= 1, `value ${v} should be <= 1`);
      }
    });
  });

  // ─── 综合画像 ───────────────────────────────────────────────────

  describe('综合画像 getProfile', () => {
    it('20. getProfile 应返回完整画像结构', () => {
      const engine = new UserProfileEngine();
      const profile = engine.getProfile();
      assert.ok('interestVector' in profile);
      assert.ok('topInterests' in profile);
      assert.ok('implicitPreferences' in profile);
      assert.ok('explicitPreferences' in profile);
      assert.ok('updatedAt' in profile);
    });

    it('21. topInterests 应按分数降序排列', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeFrontendBookmark(1), makeFrontendBookmark(2), makeFrontendBookmark(3),
        makeBackendBookmark(4),
      ];
      engine.updateFromBookmarks(bookmarks);
      const profile = engine.getProfile();
      const interests = profile.topInterests;
      assert.ok(interests.length > 0);
      for (let i = 1; i < interests.length; i++) {
        assert.ok(interests[i - 1].score >= interests[i].score);
      }
    });
  });

  // ─── 主题建议 suggestTopics ─────────────────────────────────────

  describe('suggestTopics', () => {
    it('22. 应基于兴趣向量推荐主题', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeFrontendBookmark(1), makeFrontendBookmark(2),
      ];
      engine.updateFromBookmarks(bookmarks);
      const topics = engine.suggestTopics();
      assert.ok(Array.isArray(topics));
      assert.ok(topics.length > 0);
    });

    it('23. 无数据时应返回默认主题', () => {
      const engine = new UserProfileEngine();
      const topics = engine.suggestTopics(3);
      assert.ok(Array.isArray(topics));
      assert.ok(topics.length <= 3);
    });

    it('24. suggestTopics 应支持 limit 参数', () => {
      const engine = new UserProfileEngine();
      const topics = engine.suggestTopics(2);
      assert.ok(topics.length <= 2);
    });
  });

  // ─── AI prompt 集成 ─────────────────────────────────────────────

  describe('buildAIPromptContext', () => {
    it('25. 应生成用于 AI prompt 的用户画像文本', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [makeFrontendBookmark(1), makeAIBookmark(2)];
      engine.updateFromBookmarks(bookmarks);
      const context = engine.buildAIPromptContext();
      assert.equal(typeof context, 'string');
      assert.ok(context.length > 0);
      assert.ok(context.includes('前端') || context.includes('AI/ML'));
    });

    it('26. 无数据时应返回默认上下文', () => {
      const engine = new UserProfileEngine();
      const context = engine.buildAIPromptContext();
      assert.equal(typeof context, 'string');
      assert.ok(context.length > 0);
    });
  });

  // ─── ReadingQueue 集成 ──────────────────────────────────────────

  describe('getQueueWeight', () => {
    it('27. 书签与兴趣匹配时返回较高权重', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeFrontendBookmark(1), makeFrontendBookmark(2), makeFrontendBookmark(3),
      ];
      engine.updateFromBookmarks(bookmarks);
      const weight = engine.getQueueWeight(makeFrontendBookmark(4));
      assert.ok(weight > 0);
      assert.ok(weight <= 1);
    });

    it('28. 与兴趣无关的书签返回较低权重', () => {
      const engine = new UserProfileEngine();
      const bookmarks = [
        makeFrontendBookmark(1), makeFrontendBookmark(2), makeFrontendBookmark(3),
      ];
      engine.updateFromBookmarks(bookmarks);
      const relevantWeight = engine.getQueueWeight(makeFrontendBookmark(4));
      const irrelevantWeight = engine.getQueueWeight(makeAIBookmark(5));
      assert.ok(relevantWeight >= irrelevantWeight);
    });
  });

  // ─── 偏好变更历史 ──────────────────────────────────────────────

  describe('偏好变更历史', () => {
    it('29. recordPreferenceSnapshot 应记录快照', () => {
      const engine = new UserProfileEngine();
      engine.recordPreferenceSnapshot();
      const history = engine.getPreferenceHistory();
      assert.ok(Array.isArray(history));
      assert.ok(history.length >= 1);
      assert.ok(history[0].timestamp);
      assert.ok(history[0].interestVector);
    });

    it('30. 多次快照应累积历史', () => {
      const engine = new UserProfileEngine();
      engine.recordPreferenceSnapshot();
      engine.setExplicitPreferences({ interestAreas: ['前端'] });
      engine.recordPreferenceSnapshot();
      const history = engine.getPreferenceHistory();
      assert.ok(history.length >= 2);
    });

    it('31. 偏好历史应限制最大条数', () => {
      const engine = new UserProfileEngine({ maxHistorySize: 5 });
      for (let i = 0; i < 10; i++) {
        engine.recordPreferenceSnapshot();
      }
      const history = engine.getPreferenceHistory();
      assert.ok(history.length <= 5);
    });
  });

  // ─── 持久化 ─────────────────────────────────────────────────────

  describe('持久化 persist / load', () => {
    it('32. persist 应保存数据到 storage.sync', async () => {
      const storage = makeStorageMock();
      const engine = new UserProfileEngine({
        storage: { sync: storage },
      });
      engine.setExplicitPreferences({ interestAreas: ['前端'] });
      await engine.persist();
      assert.ok(storage._store[STORAGE_KEY]);
      assert.ok(storage._store[HISTORY_STORAGE_KEY] !== undefined);
    });

    it('33. load 应从 storage.sync 恢复状态', async () => {
      const storage = makeStorageMock();
      const engine1 = new UserProfileEngine({
        storage: { sync: storage },
      });
      engine1.setExplicitPreferences({ interestAreas: ['前端'] });
      await engine1.persist();

      const engine2 = new UserProfileEngine({
        storage: { sync: storage },
      });
      await engine2.load();
      const prefs = engine2.getPreferences();
      assert.deepEqual(prefs.interestAreas, ['前端']);
    });

    it('34. load 在无数据时应使用默认值', async () => {
      const storage = makeStorageMock();
      const engine = new UserProfileEngine({
        storage: { sync: storage },
      });
      await engine.load();
      const prefs = engine.getPreferences();
      assert.equal(prefs.difficultyPreference, 'intermediate');
    });
  });

  // ─── 导入导出 ───────────────────────────────────────────────────

  describe('exportData / importData', () => {
    it('35. exportData 应返回可序列化对象', () => {
      const engine = new UserProfileEngine();
      engine.setExplicitPreferences({ interestAreas: ['前端'] });
      const data = engine.exportData();
      assert.ok(data.version);
      assert.ok(data.preferences);
      assert.ok(data.interestVector);
      assert.ok(data.history);
    });

    it('36. importData 应恢复导出的状态', () => {
      const engine1 = new UserProfileEngine();
      engine1.setExplicitPreferences({ interestAreas: ['AI/ML'] });
      const data = engine1.exportData();

      const engine2 = new UserProfileEngine();
      engine2.importData(data);
      const prefs = engine2.getPreferences();
      assert.deepEqual(prefs.interestAreas, ['AI/ML']);
    });

    it('37. importData 版本不匹配应抛出错误', () => {
      const engine = new UserProfileEngine();
      assert.throws(() => engine.importData({ version: -1 }), /version/);
    });
  });

  // ─── 工具函数 ───────────────────────────────────────────────────

  describe('_classifyCategory', () => {
    it('38. 应正确分类前端书签', () => {
      const engine = new UserProfileEngine();
      const category = engine._classifyCategory(makeFrontendBookmark(1));
      assert.equal(category, '前端');
    });

    it('39. 应正确分类后端书签', () => {
      const engine = new UserProfileEngine();
      const category = engine._classifyCategory(makeBackendBookmark(1));
      assert.equal(category, '后端');
    });

    it('40. 无法匹配时应返回 null', () => {
      const engine = new UserProfileEngine();
      const category = engine._classifyCategory({
        id: '1', title: 'random', url: 'https://random.xyz',
        tags: [], folderPath: [],
      });
      assert.equal(category, null);
    });
  });

  describe('updateFromBookmarks', () => {
    it('41. 应更新隐性偏好和兴趣向量', () => {
      const engine = new UserProfileEngine();
      engine.updateFromBookmarks([makeFrontendBookmark(1), makeFrontendBookmark(2)]);
      const profile = engine.getProfile();
      assert.ok(profile.implicitPreferences);
      assert.ok(profile.implicitPreferences.tagFrequency.react > 0);
    });

    it('42. 多次 update 应累积书签数据', () => {
      const engine = new UserProfileEngine();
      engine.updateFromBookmarks([makeFrontendBookmark(1)]);
      engine.updateFromBookmarks([makeBackendBookmark(2)]);
      const profile = engine.getProfile();
      const vector = profile.interestVector;
      assert.ok(vector['前端'] > 0);
      assert.ok(vector['后端'] > 0);
    });
  });
});
