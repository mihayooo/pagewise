/**
 * DocMindClient — DocMind 后端 API 客户端
 *
 * 提供与 DocMind 服务器的连接、知识同步、书签同步等功能。
 * 所有网络请求通过可注入的 fetchFn 实现，便于测试。
 *
 * 作为可选模块，不连接 DocMind 也能独立使用。
 *
 * 子模块:
 *   - docmind-client-ai.js — AI 网关方法 (getAIConfig/syncAIConfig/getAvailableModels/getAIUsage)
 */

import {
  getAIConfig as _getAIConfig,
  syncAIConfig as _syncAIConfig,
  getAvailableModels as _getAvailableModels,
  getAIUsage as _getAIUsage,
} from './docmind-client-ai.js'

// 向后兼容 re-exports
export { getAIConfig, syncAIConfig, getAvailableModels, getAIUsage } from './docmind-client-ai.js'

/** 默认请求超时（毫秒） */
const DEFAULT_TIMEOUT = 15000;

/** DocMind API 端点路径 */
const API_PATHS = {
  status: '/api/v1/status',
  knowledge: '/api/v1/knowledge',
  bookmarks: '/api/v1/bookmarks',
  graph: '/api/v1/graph',
  graphSync: '/api/v1/graph/sync',
  health: '/api/v1/health',
  aiConfig: '/api/v1/ai/config',
  aiModels: '/api/v1/ai/models',
  aiUsage: '/api/v1/ai/usage',
};

/**
 * DocMind API 客户端
 */
export class DocMindClient {
  /**
   * @param {Object} options
   * @param {string} [options.serverUrl] - DocMind 服务器地址
   * @param {string} [options.apiKey] - API Key
   * @param {Function} [options.fetchFn] - 可注入的 fetch 函数（测试用）
   * @param {number} [options.timeout] - 请求超时（毫秒）
   */
  constructor({ serverUrl = '', apiKey = '', fetchFn = null, timeout = DEFAULT_TIMEOUT } = {}) {
    this.serverUrl = serverUrl ? serverUrl.replace(/\/+$/, '') : '';
    this.apiKey = apiKey;
    this._connected = false;
    this._lastSyncAt = null;
    this._lastError = null;
    this._fetchFn = fetchFn || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    this._timeout = timeout;
  }

  /**
   * 连接到 DocMind 服务器并验证 API Key
   * @param {string} serverUrl - 服务器地址
   * @param {string} apiKey - API Key
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  async connect(serverUrl, apiKey) {
    if (!serverUrl || typeof serverUrl !== 'string') {
      return { success: false, error: '服务器地址不能为空' };
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return { success: false, error: 'API Key 不能为空' };
    }

    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;

    try {
      const data = await this._request('GET', API_PATHS.health);
      this._connected = true;
      this._lastError = null;
      return { success: true, version: data.version || 'unknown' };
    } catch (err) {
      this._connected = false;
      this._lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  /**
   * 同步知识条目到 DocMind
   * @param {Array<Object>} entries - 知识条目数组
   * @returns {Promise<{synced: number, skipped: number, errors: string[]}>}
   */
  async syncKnowledge(entries) {
    this._ensureConnected();

    if (!Array.isArray(entries) || entries.length === 0) {
      return { synced: 0, skipped: 0, errors: [] };
    }

    const formatted = entries.map(e => this._formatKnowledgeEntry(e));
    const errors = [];
    let synced = 0;
    let skipped = 0;

    try {
      const result = await this._request('POST', API_PATHS.knowledge, {
        entries: formatted,
      });
      synced = result.synced || 0;
      skipped = result.skipped || 0;
      this._lastSyncAt = new Date().toISOString();
    } catch (err) {
      errors.push(err.message);
      this._lastError = err.message;
    }

    return { synced, skipped, errors };
  }

  /**
   * 同步书签到 DocMind
   * @param {Array<Object>} bookmarks - 书签数组
   * @returns {Promise<{synced: number, skipped: number, errors: string[]}>}
   */
  async syncBookmarks(bookmarks) {
    this._ensureConnected();

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return { synced: 0, skipped: 0, errors: [] };
    }

    const formatted = bookmarks.map(b => this._formatBookmark(b));
    const errors = [];
    let synced = 0;
    let skipped = 0;

    try {
      const result = await this._request('POST', API_PATHS.bookmarks, {
        bookmarks: formatted,
      });
      synced = result.synced || 0;
      skipped = result.skipped || 0;
      this._lastSyncAt = new Date().toISOString();
    } catch (err) {
      errors.push(err.message);
      this._lastError = err.message;
    }

    return { synced, skipped, errors };
  }

  /**
   * 查询连接状态
   * @returns {{connected: boolean, serverUrl: string, lastSyncAt: string|null, lastError: string|null}}
   */
  getStatus() {
    return {
      connected: this._connected,
      serverUrl: this.serverUrl,
      lastSyncAt: this._lastSyncAt,
      lastError: this._lastError,
    };
  }

  /**
   * 同步图谱数据到 DocMind（全量或增量）
   */
  async syncGraph(graphData, options = {}) {
    this._ensureConnected();

    if (!graphData) {
      return { synced: 0, skipped: 0, errors: [] };
    }

    const errors = [];
    let synced = 0;
    let skipped = 0;

    try {
      const body = {
        graph: graphData,
        incremental: !!options.incremental,
      };
      if (options.since) {
        body.since = options.since;
      }

      const result = await this._request('POST', API_PATHS.graphSync, body);
      synced = result.synced || 0;
      skipped = result.skipped || 0;
      this._lastSyncAt = new Date().toISOString();
    } catch (err) {
      errors.push(err.message);
      this._lastError = err.message;
    }

    return { synced, skipped, errors };
  }

  /**
   * 从 DocMind 获取远程图谱数据
   */
  async fetchGraph(options = {}) {
    this._ensureConnected();

    const queryParams = {};
    if (options.since) queryParams.since = options.since;
    if (options.limit) queryParams.limit = String(options.limit);

    const queryString = Object.keys(queryParams).length > 0
      ? '?' + new URLSearchParams(queryParams).toString()
      : '';

    try {
      const data = await this._request('GET', API_PATHS.graph + queryString);
      return {
        entities: data.entities || [],
        relations: data.relations || [],
      };
    } catch (err) {
      this._lastError = err.message;
      return { entities: [], relations: [], error: err.message };
    }
  }

  // ==================== AI 网关（委托给子模块） ====================

  /** @see docmind-client-ai.js */
  async getAIConfig() { return _getAIConfig(this) }
  /** @see docmind-client-ai.js */
  async syncAIConfig(config) { return _syncAIConfig(this, config) }
  /** @see docmind-client-ai.js */
  async getAvailableModels() { return _getAvailableModels(this) }
  /** @see docmind-client-ai.js */
  async getAIUsage(options) { return _getAIUsage(this, options) }

  // ==================== 内部方法 ====================

  _ensureConnected() {
    if (!this._connected) {
      throw new Error('未连接到 DocMind 服务器');
    }
  }

  _formatKnowledgeEntry(entry) {
    return {
      content: entry.content || entry.answer || entry.summary || '',
      source_url: entry.sourceUrl || '',
      title: entry.title || '',
      tags: entry.tags || [],
      entities: entry.entities || [],
      category: entry.category || '',
      created_at: entry.createdAt || new Date().toISOString(),
    };
  }

  _formatBookmark(bookmark) {
    return {
      url: bookmark.url || '',
      title: bookmark.title || '',
      description: bookmark.description || '',
      tags: bookmark.tags || [],
      folder: bookmark.folder || '',
      created_at: bookmark.createdAt || bookmark.dateAdded || new Date().toISOString(),
    };
  }

  async _request(method, path, body = null) {
    if (!this._fetchFn) {
      throw new Error('fetch 不可用，请检查浏览器环境');
    }

    const url = `${this.serverUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const options = { method, headers };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      options.signal = controller.signal;
    }

    let timeoutId = null;
    if (controller && this._timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), this._timeout);
    }

    try {
      const response = await this._fetchFn(url, options);

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`DocMind API ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new Error('请求超时');
      }
      throw err;
    }
  }
}
