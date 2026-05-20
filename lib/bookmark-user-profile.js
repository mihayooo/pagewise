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
 * 导出:
 *   UserProfileEngine, DOMAIN_CATEGORIES, DEFAULT_EXPLICIT_PREFERENCES,
 *   STORAGE_KEY, HISTORY_STORAGE_KEY, DATA_VERSION
 */

// ==================== 常量 ====================

/** 14 个技术领域分类 */
export const DOMAIN_CATEGORIES = [
  { name: '前端', keywords: ['react', 'vue', 'angular', 'css', 'html', 'javascript', 'typescript', 'frontend', 'svelte', 'next.js', 'nuxt', 'webpack', 'vite', 'tailwind', 'sass', 'less'] },
  { name: '后端', keywords: ['nodejs', 'express', 'django', 'flask', 'spring', 'backend', 'server', 'api', 'rest', 'graphql', 'java', 'python', 'go', 'rust', 'php', 'ruby'] },
  { name: 'AI/ML', keywords: ['pytorch', 'tensorflow', 'machine-learning', 'deep-learning', 'ai', 'ml', 'neural', 'gpt', 'llm', 'nlp', 'transformer', 'huggingface', 'openai'] },
  { name: '数据库', keywords: ['database', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'sqlite', 'nosql', 'orm', 'prisma', 'drizzle'] },
  { name: 'DevOps', keywords: ['docker', 'kubernetes', 'ci/cd', 'jenkins', 'github-actions', 'terraform', 'ansible', 'aws', 'gcp', 'azure', 'devops', 'container', 'helm'] },
  { name: '架构', keywords: ['architecture', 'microservice', 'monolith', 'design-pattern', 'ddd', 'cqrs', 'event-driven', 'distributed', 'system-design', 'scalability'] },
  { name: '安全', keywords: ['security', 'authentication', 'authorization', 'oauth', 'jwt', 'encryption', 'xss', 'csrf', 'owasp', 'ssl', 'tls', 'penetration'] },
  { name: '性能', keywords: ['performance', 'optimization', 'profiling', 'benchmark', 'cache', 'cdn', 'lazy-loading', 'web-vitals', 'lighthouse', 'memory-leak'] },
  { name: '移动端', keywords: ['mobile', 'ios', 'android', 'react-native', 'flutter', 'swift', 'kotlin', 'expo', 'capacitor', 'ionic'] },
  { name: '测试', keywords: ['test', 'testing', 'jest', 'mocha', 'cypress', 'playwright', 'vitest', 'unit-test', 'e2e', 'integration-test', 'tdd', 'bdd'] },
  { name: '数据工程', keywords: ['data-engineering', 'etl', 'airflow', 'spark', 'kafka', 'data-pipeline', 'streaming', 'data-warehouse', 'dbt', 'bigquery'] },
  { name: '产品设计', keywords: ['ux', 'ui', 'design', 'figma', 'user-research', 'prototype', 'wireframe', 'usability', 'accessibility', 'a11y'] },
  { name: '区块链', keywords: ['blockchain', 'web3', 'ethereum', 'solidity', 'smart-contract', 'defi', 'nft', 'crypto', 'decentralized'] },
  { name: '云原生', keywords: ['cloud-native', 'serverless', 'lambda', 'edge-computing', 'service-mesh', 'istio', 'envoy', 'grpc', 'protobuf', 'kubernetes'] },
];

export const DEFAULT_EXPLICIT_PREFERENCES = {
  interestAreas: [],
  difficultyPreference: 'intermediate',
  dailyLearningMinutes: 30,
};

export const STORAGE_KEY = 'pagewise_user_profile';
export const HISTORY_STORAGE_KEY = 'pagewise_user_profile_history';
export const DATA_VERSION = 1;

const MAX_HISTORY_DEFAULT = 50;
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

// ==================== 辅助工具 ====================

/** 从 URL 提取域名 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 归一化对象值到 [0, 1] */
function normalizeVector(vec) {
  const values = Object.values(vec);
  const max = Math.max(...values, 1);
  const result = {};
  for (const [k, v] of Object.entries(vec)) {
    result[k] = max > 0 ? v / max : 0;
  }
  return result;
}

// ==================== UserProfileEngine ====================

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

    // 显性偏好
    this._explicitPreferences = { ...DEFAULT_EXPLICIT_PREFERENCES };

    // 隐性偏好
    this._implicitPreferences = {
      tagFrequency: {},
      domainFrequency: {},
      completionRate: 0,
    };

    // 兴趣向量（14 维）
    this._interestVector = {};
    for (const cat of DOMAIN_CATEGORIES) {
      this._interestVector[cat.name] = 0;
    }

    // 偏好变更历史
    this._preferenceHistory = [];

    // 累积书签数据
    this._allBookmarks = [];
  }

  // ─── 显性偏好 ─────────────────────────────────────────────────────

  /**
   * 设置显性偏好（部分更新）
   * @param {object} prefs
   */
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

  /**
   * 获取当前显性偏好
   * @returns {object}
   */
  getPreferences() {
    return { ...this._explicitPreferences };
  }

  // ─── 隐性偏好推断 ───────────────────────────────────────────────

  /**
   * 从书签历史推断隐性偏好
   * @param {Array} bookmarks
   * @returns {{ tagFrequency: object, domainFrequency: object, completionRate: number }}
   */
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
      // 标签频率
      if (Array.isArray(bm.tags)) {
        for (const tag of bm.tags) {
          tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
        }
      }

      // 域名频率
      const domain = extractDomain(bm.url || '');
      if (domain) {
        domainFrequency[domain] = (domainFrequency[domain] || 0) + 1;
      }

      // 阅读完成率
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

  /**
   * 获取 14 维归一化兴趣向量
   * @returns {object} { '前端': 0.5, '后端': 0.3, ... }
   */
  getInterestVector() {
    return { ...this._interestVector };
  }

  // ─── 综合画像 ─────────────────────────────────────────────────────

  /**
   * 获取完整画像
   * @returns {{ interestVector, topInterests, implicitPreferences, explicitPreferences, updatedAt }}
   */
  getProfile() {
    const vector = this.getInterestVector();

    // topInterests 按分数降序
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

  /**
   * 基于兴趣向量推荐学习主题
   * @param {number} [limit=5]
   * @returns {string[]}
   */
  suggestTopics(limit = 5) {
    const vector = this.getInterestVector();
    const sorted = Object.entries(vector)
      .sort((a, b) => b[1] - a[1]);

    // 优先返回高分领域
    const topics = [];
    for (const [domain, score] of sorted) {
      if (topics.length >= limit) break;
      if (score > 0) {
        topics.push(domain);
      }
    }

    // 如果没有足够高分领域，补充默认建议
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

  // ─── AI prompt 集成 ──────────────────────────────────────────────

  /**
   * 生成 AI prompt 用的用户画像上下文文本
   * @returns {string}
   */
  buildAIPromptContext() {
    const profile = this.getProfile();
    const prefs = profile.explicitPreferences;

    const parts = ['用户学习画像：'];

    // 兴趣领域
    const topInterests = profile.topInterests.filter(i => i.score > 0);
    if (topInterests.length > 0) {
      const domains = topInterests.slice(0, 5).map(i => `${i.domain}(${(i.score * 100).toFixed(0)}%)`);
      parts.push(`兴趣领域: ${domains.join('、')}`);
    } else {
      parts.push('兴趣领域: 暂无偏好数据');
    }

    // 学习偏好
    parts.push(`难度偏好: ${prefs.difficultyPreference}`);
    parts.push(`每日学习时长: ${prefs.dailyLearningMinutes} 分钟`);

    // 隐性偏好
    const imp = profile.implicitPreferences;
    if (imp.completionRate > 0) {
      parts.push(`阅读完成率: ${(imp.completionRate * 100).toFixed(0)}%`);
    }

    return parts.join('；');
  }

  // ─── ReadingQueue 集成 ───────────────────────────────────────────

  /**
   * 计算书签与用户兴趣的匹配权重 [0, 1]
   * @param {object} bookmark
   * @returns {number}
   */
  getQueueWeight(bookmark) {
    if (!bookmark) return 0;

    const category = this._classifyCategory(bookmark);
    if (!category) return 0.1; // 无法分类时给最低基础分

    const vector = this.getInterestVector();
    const score = vector[category] || 0;

    // 确保在 [0, 1] 范围内，最低 0.1
    return Math.min(1, Math.max(0.1, score));
  }

  // ─── 偏好变更历史 ───────────────────────────────────────────────

  /**
   * 记录当前偏好快照到历史
   */
  recordPreferenceSnapshot() {
    const snapshot = {
      timestamp: this._now(),
      interestVector: this.getInterestVector(),
      explicitPreferences: this.getPreferences(),
    };

    this._preferenceHistory.push(snapshot);

    // 限制历史条数
    if (this._preferenceHistory.length > this._maxHistorySize) {
      this._preferenceHistory = this._preferenceHistory.slice(-this._maxHistorySize);
    }
  }

  /**
   * 获取偏好变更历史
   * @returns {Array}
   */
  getPreferenceHistory() {
    return [...this._preferenceHistory];
  }

  // ─── 持久化 ─────────────────────────────────────────────────────

  /**
   * 保存到 storage.sync
   * @returns {Promise<void>}
   */
  async persist() {
    const storage = this._getStorage();
    if (!storage) return;

    return new Promise((resolve) => {
      storage.set({
        [STORAGE_KEY]: {
          version: DATA_VERSION,
          explicitPreferences: this._explicitPreferences,
          implicitPreferences: this._implicitPreferences,
          interestVector: this._interestVector,
        },
        [HISTORY_STORAGE_KEY]: this._preferenceHistory,
      }, resolve);
    });
  }

  /**
   * 从 storage.sync 加载
   * @returns {Promise<void>}
   */
  async load() {
    const storage = this._getStorage();
    if (!storage) return;

    return new Promise((resolve) => {
      storage.get([STORAGE_KEY, HISTORY_STORAGE_KEY], (result) => {
        const profileData = result[STORAGE_KEY];
        const historyData = result[HISTORY_STORAGE_KEY];

        if (profileData && profileData.version === DATA_VERSION) {
          if (profileData.explicitPreferences) {
            this._explicitPreferences = { ...DEFAULT_EXPLICIT_PREFERENCES, ...profileData.explicitPreferences };
          }
          if (profileData.implicitPreferences) {
            this._implicitPreferences = profileData.implicitPreferences;
          }
          if (profileData.interestVector) {
            this._interestVector = profileData.interestVector;
          }
        }

        if (Array.isArray(historyData)) {
          this._preferenceHistory = historyData;
        }

        resolve();
      });
    });
  }

  // ─── 导入导出 ───────────────────────────────────────────────────

  /**
   * 导出为可序列化对象
   * @returns {object}
   */
  exportData() {
    return {
      version: DATA_VERSION,
      preferences: this.getPreferences(),
      interestVector: this.getInterestVector(),
      history: this.getPreferenceHistory(),
    };
  }

  /**
   * 从导出数据恢复
   * @param {object} data
   */
  importData(data) {
    if (!data || data.version !== DATA_VERSION) {
      throw new Error('importData: version mismatch');
    }

    if (data.preferences) {
      this._explicitPreferences = { ...DEFAULT_EXPLICIT_PREFERENCES, ...data.preferences };
    }

    if (data.interestVector) {
      this._interestVector = data.interestVector;
    }

    if (Array.isArray(data.history)) {
      this._preferenceHistory = data.history;
    }
  }

  // ─── 书签更新 ───────────────────────────────────────────────────

  /**
   * 从书签数据更新隐性偏好和兴趣向量
   * @param {Array} bookmarks
   */
  updateFromBookmarks(bookmarks) {
    if (!Array.isArray(bookmarks)) return;

    // 累积书签
    this._allBookmarks.push(...bookmarks);

    // 更新隐性偏好
    this._implicitPreferences = this.inferImplicitPreferences(this._allBookmarks);

    // 重建兴趣向量
    this._rebuildInterestVector();
  }

  // ─── 分类工具 ───────────────────────────────────────────────────

  /**
   * 将书签分类到 14 维领域之一
   * @param {object} bookmark
   * @returns {string|null}
   */
  _classifyCategory(bookmark) {
    if (!bookmark) return null;

    const searchText = [
      bookmark.title || '',
      ...(Array.isArray(bookmark.tags) ? bookmark.tags : []),
      ...(Array.isArray(bookmark.folderPath) ? bookmark.folderPath : []),
      extractDomain(bookmark.url || ''),
    ].join(' ').toLowerCase();

    let bestCategory = null;
    let bestScore = 0;

    for (const cat of DOMAIN_CATEGORIES) {
      let score = 0;
      for (const kw of cat.keywords) {
        if (searchText.includes(kw.toLowerCase())) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCategory = cat.name;
      }
    }

    return bestScore > 0 ? bestCategory : null;
  }

  // ─── 内部方法 ───────────────────────────────────────────────────

  /** 重建兴趣向量 */
  _rebuildInterestVector() {
    // 从零开始
    const vector = {};
    for (const cat of DOMAIN_CATEGORIES) {
      vector[cat.name] = 0;
    }

    // 基于书签分类计算
    for (const bm of this._allBookmarks) {
      const category = this._classifyCategory(bm);
      if (category && category in vector) {
        vector[category]++;
      }
    }

    // 显性偏好增强（+0.5 per explicit area）
    for (const area of this._explicitPreferences.interestAreas) {
      if (area in vector) {
        vector[area] += 0.5;
      }
    }

    // 归一化到 [0, 1]
    this._interestVector = normalizeVector(vector);
  }

  /** 获取 storage 接口 */
  _getStorage() {
    if (this._storage && this._storage.sync) {
      return this._storage.sync;
    }
    return null;
  }
}
