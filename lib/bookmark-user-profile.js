/**
 * bookmark-user-profile.js — 用户画像与偏好引擎
 *
 * R176: UserProfileEngine
 *
 * 构建跨模块统一用户画像:
 *   - 显性偏好: 用户手动设置的兴趣领域、难度偏好、每日学习时长目标
 *   - 隐性偏好: 基于阅读历史自动推断（标签频率、域名频率、阅读完成率加权）
 *   - 偏好向量: 14 维技术领域覆盖度+深度向量
 *   - 偏好变更历史: 记录偏好漂移轨迹
 *   - 持久化: chrome.storage.sync（跨设备同步）
 *
 * R196 拆分: 常量+persist/load/exportData/importData/updateFromBookmarks
 *           buildAIPromptContext/getQueueWeight/recordPreferenceSnapshot
 *           getPreferenceHistory/_classifyCategory/_rebuildInterestVector
 *           → bookmark-user-profile-io.js
 *
 * 导出:
 *   UserProfileEngine, DOMAIN_CATEGORIES, DEFAULT_EXPLICIT_PREFERENCES,
 *   STORAGE_KEY, HISTORY_STORAGE_KEY, DATA_VERSION
 */

import {
  DOMAIN_CATEGORIES, DEFAULT_EXPLICIT_PREFERENCES,
  STORAGE_KEY, HISTORY_STORAGE_KEY, DATA_VERSION,
  persist, load, exportData as _exportData, importData as _importData,
  updateFromBookmarks, buildAIPromptContext, getQueueWeight,
  recordPreferenceSnapshot, getPreferenceHistory,
  _classifyCategory, _rebuildInterestVector, _getStorage,
} from './bookmark-user-profile-io.js';

// Re-export constants for backward compatibility
export { DOMAIN_CATEGORIES, DEFAULT_EXPLICIT_PREFERENCES };
export { STORAGE_KEY, HISTORY_STORAGE_KEY, DATA_VERSION };

const MAX_HISTORY_DEFAULT = 50;
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

// ==================== UserProfileEngine ====================

/** UserProfileEngine 类 */
export class UserProfileEngine {
  /**
   * @param {object} [options]
   * @param {function} [options.now] — 时间源（默认 Date.now）
   * @param {object} [options.storage] — Chrome storage 对象（默认 chrome.storage）
   * @param {number} [options.maxHistorySize] — 历史快照上限（默认 50）
   */
  constructor(options = {}) {
    this._now = options.now || (() => Date.now());
    this._storage = options.storage || null;
    this._maxHistorySize = options.maxHistorySize || MAX_HISTORY_DEFAULT;

    this._explicitPreferences = { ...DEFAULT_EXPLICIT_PREFERENCES };

    this._implicitPreferences = {
      tagFrequency: {},
      domainFrequency: {},
      completionRate: 0,
    };

    this._interestVector = {};
    for (const cat of DOMAIN_CATEGORIES) {
      this._interestVector[cat.name] = 0;
    }

    this._preferenceHistory = [];
    this._allBookmarks = [];
  }

  // ─── 显性偏好 ─────────────────────────────────────────────────────

  setExplicitPreferences(prefs) {
    if (!prefs || typeof prefs !== 'object') {
      throw new Error('setExplicitPreferences: input must be an object');
    }

    if (Array.isArray(prefs.interestAreas)) {
      this._explicitPreferences.interestAreas = prefs.interestAreas;
    }

    if (
      typeof prefs.difficultyPreference === 'string' &&
      VALID_DIFFICULTIES.includes(prefs.difficultyPreference)
    ) {
      this._explicitPreferences.difficultyPreference = prefs.difficultyPreference;
    }

    if (
      typeof prefs.dailyLearningMinutes === 'number' &&
      prefs.dailyLearningMinutes > 0
    ) {
      this._explicitPreferences.dailyLearningMinutes = prefs.dailyLearningMinutes;
    }

    this._rebuildInterestVector();
  }

  getPreferences() {
    return { ...this._explicitPreferences };
  }

  // ─── 隐性偏好推断 ───────────────────────────────────────────────

  inferImplicitPreferences(bookmarks) {
    if (!Array.isArray(bookmarks)) {
      throw new Error('inferImplicitPreferences: input must be an array');
    }

    if (bookmarks.length === 0) {
      return {
        tagFrequency: {},
        domainFrequency: {},
        completionRate: 0,
      };
    }

    const tagFrequency = {};
    const domainFrequency = {};
    let readCount = 0;

    for (const bm of bookmarks) {
      if (Array.isArray(bm.tags)) {
        for (const tag of bm.tags) {
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      }

      const domain = (() => {
        try { return new URL(bm.url || '').hostname.replace(/^www\./, ''); }
        catch { return ''; }
      })();
      if (domain) {
        domainFrequency[domain] = (domainFrequency[domain] || 0) + 1;
      }

      if (bm.status === 'read') {
        readCount++;
      }
    }

    return {
      tagFrequency,
      domainFrequency,
      completionRate: bookmarks.length > 0 ? readCount / bookmarks.length : 0,
    };
  }

  // ─── 兴趣向量 ─────────────────────────────────────────────────────

  getInterestVector() {
    return { ...this._interestVector };
  }

  // ─── 综合画像 ─────────────────────────────────────────────────────

  getProfile() {
    const vector = this.getInterestVector();

    const topInterests = Object.entries(vector)
      .map(([domain, score]) => ({ domain, score }))
      .sort((a, b) => b.score - a.score);

    return {
      interestVector: vector,
      topInterests,
      implicitPreferences: { ...this._implicitPreferences },
      explicitPreferences: this.getPreferences(),
      updatedAt: this._now(),
    };
  }

  // ─── 主题建议 ─────────────────────────────────────────────────────

  suggestTopics(limit = 5) {
    const vector = this.getInterestVector();
    const sorted = Object.entries(vector)
      .sort((a, b) => b[1] - a[1]);

    const topics = [];
    for (const [domain, score] of sorted) {
      if (topics.length >= limit) break;
      if (score > 0) {
        topics.push(domain);
      }
    }

    if (topics.length < limit) {
      for (const cat of DOMAIN_CATEGORIES) {
        if (topics.length >= limit) break;
        if (!topics.includes(cat.name)) {
          topics.push(cat.name);
        }
      }
    }

    return topics.slice(0, limit);
  }
}

// ==================== Mixin: IO/集成方法 ====================
// 将拆分出的方法挂载到 prototype，保持 API 向后兼容

Object.assign(UserProfileEngine.prototype, {
  persist,
  load,
  exportData: _exportData,
  importData: _importData,
  updateFromBookmarks,
  buildAIPromptContext,
  getQueueWeight,
  recordPreferenceSnapshot,
  getPreferenceHistory,
  _classifyCategory,
  _rebuildInterestVector,
  _getStorage,
});
