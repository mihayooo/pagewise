/**
 * bookmark-user-profile-io.js — 用户画像持久化/集成方法及常量
 *
 * R196: 从 bookmark-user-profile.js 拆分
 * 包含: 常量定义、persist/load/exportData/importData/updateFromBookmarks
 *       buildAIPromptContext/getQueueWeight
 *       recordPreferenceSnapshot/getPreferenceHistory
 *       _classifyCategory/_rebuildInterestVector
 *
 * @module lib/bookmark-user-profile-io
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

/**
 * 用户显式偏好的默认值
 */
export const DEFAULT_EXPLICIT_PREFERENCES = {
  interestAreas: [],
  difficultyPreference: 'intermediate',
  dailyLearningMinutes: 30,
};

/**
 * chrome.storage 存储键名
 */
export const STORAGE_KEY = 'pagewise_user_profile';
/**
 * 偏好历史存储键名
 */
export const HISTORY_STORAGE_KEY = 'pagewise_user_profile_history';
/**
 * 数据格式版本号
 */
export const DATA_VERSION = 1;

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

// ==================== IO 方法（挂载到 UserProfileEngine.prototype） ====================

/**
 * 持久化用户画像数据到 storage
 */
export const persist = async function persist() {
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
};

/**
 * 从 storage 加载用户画像数据
 */
export const load = async function load() {
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
};

/**
 * 导出用户画像数据为 JSON 对象
 */
export const exportData = function exportData() {
  return {
    version: DATA_VERSION,
    preferences: this.getPreferences(),
    interestVector: this.getInterestVector(),
    history: this.getPreferenceHistory(),
  };
};

/**
 * @param {object} data - 导入的用户画像数据
 */
export const importData = function importData(data) {
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
};

/**
 * @param {Array} bookmarks - 书签列表，用于更新兴趣向量
 */
export const updateFromBookmarks = function updateFromBookmarks(bookmarks) {
  if (!Array.isArray(bookmarks)) return;

  this._allBookmarks.push(...bookmarks);
  this._implicitPreferences = this.inferImplicitPreferences(this._allBookmarks);
  this._rebuildInterestVector();
};

/**
 * 构建供 AI 使用的用户上下文摘要
 */
export const buildAIPromptContext = function buildAIPromptContext() {
  const profile = this.getProfile();
  const prefs = profile.explicitPreferences;

  const parts = ['用户学习画像：'];

  const topInterests = profile.topInterests.filter(i => i.score > 0);
  if (topInterests.length > 0) {
    const domains = topInterests.slice(0, 5).map(i => `${i.domain}(${(i.score * 100).toFixed(0)}%)`);
    parts.push(`兴趣领域: ${domains.join('、')}`);
  } else {
    parts.push('兴趣领域: 暂无偏好数据');
  }

  parts.push(`难度偏好: ${prefs.difficultyPreference}`);
  parts.push(`每日学习时长: ${prefs.dailyLearningMinutes} 分钟`);

  const imp = profile.implicitPreferences;
  if (imp.completionRate > 0) {
    parts.push(`阅读完成率: ${(imp.completionRate * 100).toFixed(0)}%`);
  }

  return parts.join('；');
};

/**
 * @param {string} category - 领域分类
 * * @returns {number} 学习队列权重
 */
export const getQueueWeight = function getQueueWeight(bookmark) {
  if (!bookmark) return 0;

  const category = this._classifyCategory(bookmark);
  if (!category) return 0.1;

  const vector = this.getInterestVector();
  const score = vector[category] || 0;

  return Math.min(1, Math.max(0.1, score));
};

/**
 * 记录当前偏好的快照
 */
export const recordPreferenceSnapshot = function recordPreferenceSnapshot() {
  const snapshot = {
    timestamp: this._now(),
    interestVector: this.getInterestVector(),
    explicitPreferences: this.getPreferences(),
  };

  this._preferenceHistory.push(snapshot);

  if (this._preferenceHistory.length > this._maxHistorySize) {
    this._preferenceHistory = this._preferenceHistory.slice(-this._maxHistorySize);
  }
};

/**
 * @returns {Array} 偏好历史快照列表
 */
export const getPreferenceHistory = function getPreferenceHistory() {
  return [...this._preferenceHistory];
};

/**
 * @param {object} bookmark - 书签对象
 * * @returns {string} 分类名称
 */
export const _classifyCategory = function _classifyCategory(bookmark) {
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
};

/**
 * 从书签历史重建兴趣向量
 */
export const _rebuildInterestVector = function _rebuildInterestVector() {
  const vector = {};
  for (const cat of DOMAIN_CATEGORIES) {
    vector[cat.name] = 0;
  }

  for (const bm of this._allBookmarks) {
    const category = this._classifyCategory(bm);
    if (category && category in vector) {
      vector[category]++;
    }
  }

  for (const area of this._explicitPreferences.interestAreas) {
    if (area in vector) {
      vector[area] += 0.5;
    }
  }

  this._interestVector = normalizeVector(vector);
};

/** _getStorage 常量 */
export const _getStorage = function _getStorage() {
  if (this._storage && this._storage.sync) {
    return this._storage.sync;
  }
  return null;
};

export { extractDomain, normalizeVector };
