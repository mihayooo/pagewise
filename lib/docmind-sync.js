/**
 * DocMindSyncManager — DocMind 同步管理器
 *
 * 管理自动同步、增量同步（基于时间戳）、冲突处理、同步状态。
 * 依赖 DocMindClient 进行网络通信，依赖 chrome.storage 存储配置。
 *
 * 作为可选模块，不连接 DocMind 也能独立使用。
 */

import {
  STORAGE_KEY,
  initClient,
  filterIncremental,
  startAutoSync,
  stopAutoSync,
  saveConfigSilent,
  getDefaultStorageGet,
  getDefaultStorageSet,
} from './docmind-sync-helpers.js'

/** 默认同步间隔（毫秒） */
const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000

/** 同步状态枚举 */
export const SyncStatus = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  ERROR: 'error',
  DISABLED: 'disabled',
}

/** 冲突策略枚举 */
export const ConflictStrategy = {
  LOCAL_WINS: 'local_wins',
  REMOTE_WINS: 'remote_wins',
  SKIP: 'skip',
}

/**
 * DocMind 同步管理器
 */
export class DocMindSyncManager {
  /**
   * @param {Object} options
   * @param {Object} [options.client] - DocMind 客户端实例
   * @param {Function} [options.storageGet] - storage.get 替代（测试用）
   * @param {Function} [options.storageSet] - storage.set 替代（测试用）
   * @param {number} [options.syncInterval] - 同步间隔（毫秒）
   */
  constructor({ client = null, storageGet = null, storageSet = null, syncInterval = DEFAULT_SYNC_INTERVAL } = {}) {
    this._client = client
    this._storageGet = storageGet
    this._storageSet = storageSet
    this._syncInterval = syncInterval

    this._config = {
      enabled: false,
      serverUrl: '',
      apiKey: '',
      lastSyncAt: null,
      conflictStrategy: ConflictStrategy.LOCAL_WINS,
    }

    this._status = SyncStatus.DISABLED
    this._lastError = null
    this._autoSyncTimer = null
    this._lastSyncTimestamp = null
  }

  async loadConfig() {
    const getter = this._storageGet || getDefaultStorageGet()

    return new Promise((resolve) => {
      getter({ [STORAGE_KEY]: this._config }, (result) => {
        this._config = { ...this._config, ...result[STORAGE_KEY] }

        if (this._config.enabled && this._config.serverUrl && this._config.apiKey) {
          this._client = initClient(this._client, this._config)
          this._status = SyncStatus.IDLE
        } else {
          this._status = SyncStatus.DISABLED
        }

        if (this._config.lastSyncAt) {
          this._lastSyncTimestamp = new Date(this._config.lastSyncAt).getTime()
        }

        resolve(this._config)
      })
    })
  }

  async saveConfig(config) {
    this._config = { ...this._config, ...config }
    const setter = this._storageSet || getDefaultStorageSet()

    return new Promise((resolve) => {
      setter({ [STORAGE_KEY]: this._config }, () => {
        if (this._config.enabled && this._config.serverUrl && this._config.apiKey) {
          this._client = initClient(this._client, this._config)
          this._status = SyncStatus.IDLE
        } else {
          this._status = SyncStatus.DISABLED
          this._autoSyncTimer = startAutoSync(this._autoSyncTimer, 0)
        }
        resolve()
      })
    })
  }

  async toggleAutoSync(enabled) {
    await this.saveConfig({ enabled })

    if (enabled) {
      this._autoSyncTimer = startAutoSync(this._autoSyncTimer, this._syncInterval)
    } else {
      stopAutoSync(this._autoSyncTimer)
      this._autoSyncTimer = null
    }
  }

  async sync({ entries = [], bookmarks = [], graph = null } = {}) {
    if (!this._config.enabled) {
      return { status: SyncStatus.DISABLED, knowledge: null, bookmarks: null, graph: null }
    }

    if (!this._client) {
      return { status: SyncStatus.ERROR, knowledge: null, bookmarks: null, graph: null }
    }

    this._status = SyncStatus.SYNCING
    this._lastError = null

    try {
      const incrementalEntries = filterIncremental(entries, this._lastSyncTimestamp)
      const incrementalBookmarks = filterIncremental(bookmarks, this._lastSyncTimestamp)

      const results = { knowledge: null, bookmarks: null, graph: null }

      if (incrementalEntries.length > 0) {
        results.knowledge = await this._client.syncKnowledge(incrementalEntries)
      } else {
        results.knowledge = { synced: 0, skipped: 0, errors: [] }
      }

      if (incrementalBookmarks.length > 0) {
        results.bookmarks = await this._client.syncBookmarks(incrementalBookmarks)
      } else {
        results.bookmarks = { synced: 0, skipped: 0, errors: [] }
      }

      if (graph && this._client.syncGraph) {
        const syncOptions = {}
        if (this._lastSyncTimestamp) {
          syncOptions.incremental = true
          syncOptions.since = new Date(this._lastSyncTimestamp).toISOString()
        }
        results.graph = await this._client.syncGraph(graph, syncOptions)
      } else {
        results.graph = { synced: 0, skipped: 0, errors: [] }
      }

      const hasErrors = (results.knowledge.errors && results.knowledge.errors.length > 0) ||
                        (results.bookmarks.errors && results.bookmarks.errors.length > 0) ||
                        (results.graph.errors && results.graph.errors.length > 0)

      if (hasErrors) {
        this._status = SyncStatus.ERROR
        const allErrors = [
          ...(results.knowledge.errors || []),
          ...(results.bookmarks.errors || []),
          ...(results.graph.errors || []),
        ]
        this._lastError = allErrors.join('; ')
      } else {
        this._status = SyncStatus.SUCCESS
        const now = new Date().toISOString()
        this._lastSyncTimestamp = Date.now()
        this._config.lastSyncAt = now
        const setter = this._storageSet || getDefaultStorageSet()
        this._config = await saveConfigSilent(setter, this._config, { lastSyncAt: now }, STORAGE_KEY)
      }

      return { status: this._status, ...results }
    } catch (err) {
      this._status = SyncStatus.ERROR
      this._lastError = err.message
      return { status: SyncStatus.ERROR, knowledge: null, bookmarks: null, graph: null }
    }
  }

  async syncGraphBidirectional(localGraphData) {
    if (!this._config.enabled) {
      return { sent: null, received: null, status: SyncStatus.DISABLED }
    }
    if (!this._client) {
      return { sent: null, received: null, status: SyncStatus.ERROR }
    }

    this._status = SyncStatus.SYNCING

    try {
      const syncOptions = {}
      if (this._lastSyncTimestamp) {
        syncOptions.incremental = true
        syncOptions.since = new Date(this._lastSyncTimestamp).toISOString()
      }
      const sent = await this._client.syncGraph(localGraphData, syncOptions)

      const fetchOptions = {}
      if (this._lastSyncTimestamp) {
        fetchOptions.since = new Date(this._lastSyncTimestamp).toISOString()
      }
      const received = await this._client.fetchGraph(fetchOptions)

      this._status = SyncStatus.SUCCESS
      const now = new Date().toISOString()
      this._lastSyncTimestamp = Date.now()
      this._config.lastSyncAt = now
      const setter = this._storageSet || getDefaultStorageSet()
      this._config = await saveConfigSilent(setter, this._config, { lastSyncAt: now }, STORAGE_KEY)

      return { sent, received, status: SyncStatus.SUCCESS }
    } catch (err) {
      this._status = SyncStatus.ERROR
      this._lastError = err.message
      return { sent: null, received: null, status: SyncStatus.ERROR }
    }
  }

  getSyncStatus() {
    return {
      status: this._status,
      lastSyncAt: this._config.lastSyncAt,
      lastError: this._lastError,
      autoSyncEnabled: this._config.enabled,
      conflictStrategy: this._config.conflictStrategy,
    }
  }

  getConfigSummary() {
    return {
      enabled: this._config.enabled,
      serverUrl: this._config.serverUrl,
      hasApiKey: !!this._config.apiKey,
      lastSyncAt: this._config.lastSyncAt,
      conflictStrategy: this._config.conflictStrategy,
    }
  }

  resolveConflict(local, remote) {
    switch (this._config.conflictStrategy) {
      case ConflictStrategy.LOCAL_WINS:
        return local
      case ConflictStrategy.REMOTE_WINS:
        return remote
      case ConflictStrategy.SKIP:
        return null
      default:
        return local
    }
  }

  destroy() {
    stopAutoSync(this._autoSyncTimer)
    this._autoSyncTimer = null
  }
}
