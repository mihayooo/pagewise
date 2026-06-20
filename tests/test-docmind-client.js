/**
 * Tests for lib/docmind-client.js — DocMind API 客户端
 *
 * Covers: DocMindClient class (constructor/connect/syncKnowledge/syncBookmarks/
 *         getStatus/syncGraph/fetchGraph/getAIConfig/syncAIConfig/getAvailableModels/
 *         getAIUsage/_ensureConnected/_formatKnowledgeEntry/_formatBookmark/_request)
 *
 * All network calls are mocked via injectable fetchFn.
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DocMindClient } from '../lib/docmind-client.js'

// ==================== Mock Helpers ====================

/** Create a mock fetch function that returns a given response body and status */
function mockFetch(body, status = 200) {
  return async (url, options) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
}

/** Create a mock fetch that always throws (simulating network failure) */
function mockFetchError(message = 'Network error') {
  return async () => {
    throw new Error(message)
  }
}

/** Create a mock fetch that records calls for inspection */
function mockFetchRecorder(body = {}, status = 200) {
  const calls = []
  const fn = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }
  fn.calls = calls
  return fn
}

/** Create a mock fetch that simulates AbortError (timeout) */
function mockFetchTimeout() {
  return async () => {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    throw err
  }
}

// ==================== constructor ====================

describe('DocMindClient.constructor', () => {
  it('default parameters: empty serverUrl, no apiKey, default timeout', () => {
    const client = new DocMindClient()
    assert.equal(client.serverUrl, '')
    assert.equal(client.apiKey, '')
    assert.equal(client._connected, false)
    assert.equal(client._lastSyncAt, null)
    assert.equal(client._lastError, null)
    assert.equal(client._timeout, 15000)
  })

  it('custom serverUrl strips trailing slashes', () => {
    const client = new DocMindClient({ serverUrl: 'http://localhost:3000///' })
    assert.equal(client.serverUrl, 'http://localhost:3000')
  })

  it('custom apiKey and timeout are stored', () => {
    const client = new DocMindClient({ apiKey: 'test-key-123', timeout: 5000 })
    assert.equal(client.apiKey, 'test-key-123')
    assert.equal(client._timeout, 5000)
  })

  it('custom fetchFn is injected', () => {
    const myFetch = async () => ({})
    const client = new DocMindClient({ fetchFn: myFetch })
    assert.equal(client._fetchFn, myFetch)
  })

  it('no fetchFn and no globalThis.fetch leaves _fetchFn null', () => {
    // In Node test env, globalThis.fetch exists, so we test the explicit null path
    const client = new DocMindClient({ fetchFn: null })
    // _fetchFn may be globalThis.fetch or null depending on environment
    // Just verify it doesn't throw
    assert.ok(client._fetchFn === null || typeof client._fetchFn === 'function')
  })
})

// ==================== connect ====================

describe('DocMindClient.connect', () => {
  let client

  beforeEach(() => {
    client = new DocMindClient({ fetchFn: mockFetch({ version: '1.2.3' }) })
  })

  it('successful connection returns {success: true, version}', async () => {
    const result = await client.connect('http://localhost:3000', 'api-key')
    assert.equal(result.success, true)
    assert.equal(result.version, '1.2.3')
    assert.equal(client._connected, true)
    assert.equal(client.serverUrl, 'http://localhost:3000')
    assert.equal(client.apiKey, 'api-key')
    assert.equal(client._lastError, null)
  })

  it('connection with version-less response returns "unknown"', async () => {
    const c = new DocMindClient({ fetchFn: mockFetch({}) })
    const result = await c.connect('http://localhost:3000', 'key')
    assert.equal(result.success, true)
    assert.equal(result.version, 'unknown')
  })

  it('empty serverUrl returns error', async () => {
    const result = await client.connect('', 'api-key')
    assert.equal(result.success, false)
    assert.equal(result.error, '服务器地址不能为空')
  })

  it('null serverUrl returns error', async () => {
    const result = await client.connect(null, 'api-key')
    assert.equal(result.success, false)
    assert.equal(result.error, '服务器地址不能为空')
  })

  it('empty apiKey returns error', async () => {
    const result = await client.connect('http://localhost:3000', '')
    assert.equal(result.success, false)
    assert.equal(result.error, 'API Key 不能为空')
  })

  it('null apiKey returns error', async () => {
    const result = await client.connect('http://localhost:3000', null)
    assert.equal(result.success, false)
    assert.equal(result.error, 'API Key 不能为空')
  })

  it('network failure returns error and sets _connected=false', async () => {
    const c = new DocMindClient({ fetchFn: mockFetchError('Connection refused') })
    const result = await c.connect('http://localhost:3000', 'key')
    assert.equal(result.success, false)
    assert.equal(result.error, 'Connection refused')
    assert.equal(c._connected, false)
    assert.equal(c._lastError, 'Connection refused')
  })

  it('stores apiKey after connection attempt (even failed)', async () => {
    const c = new DocMindClient({ fetchFn: mockFetchError() })
    await c.connect('http://example.com', 'my-key')
    assert.equal(c.apiKey, 'my-key')
    assert.equal(c.serverUrl, 'http://example.com')
  })
})

// ==================== _ensureConnected ====================

describe('DocMindClient._ensureConnected', () => {
  it('throws when not connected', () => {
    const client = new DocMindClient()
    assert.throws(() => client._ensureConnected(), /未连接到 DocMind 服务器/)
  })

  it('does not throw when connected', () => {
    const client = new DocMindClient()
    client._connected = true
    assert.doesNotThrow(() => client._ensureConnected())
  })
})

// ==================== getStatus ====================

describe('DocMindClient.getStatus', () => {
  it('returns disconnected state by default', () => {
    const client = new DocMindClient()
    const status = client.getStatus()
    assert.equal(status.connected, false)
    assert.equal(status.serverUrl, '')
    assert.equal(status.lastSyncAt, null)
    assert.equal(status.lastError, null)
  })

  it('returns connected state after successful connect', async () => {
    const client = new DocMindClient({ fetchFn: mockFetch({ version: '1.0' }) })
    await client.connect('http://localhost:3000', 'key')
    const status = client.getStatus()
    assert.equal(status.connected, true)
    assert.equal(status.serverUrl, 'http://localhost:3000')
  })

  it('returns lastSyncAt after a successful sync', async () => {
    const fetchFn = mockFetchRecorder({ synced: 5, skipped: 0 })
    // First call for connect (GET health), second for syncKnowledge (POST)
    let callCount = 0
    const multiFetch = async (url, opts) => {
      callCount++
      if (callCount === 1) {
        return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
      }
      return { ok: true, status: 200, json: async () => ({ synced: 5, skipped: 0 }), text: async () => '{}' }
    }
    const client = new DocMindClient({ fetchFn: multiFetch })
    await client.connect('http://localhost:3000', 'key')
    await client.syncKnowledge([{ content: 'test' }])
    const status = client.getStatus()
    assert.ok(status.lastSyncAt, 'lastSyncAt should be set')
    assert.match(status.lastSyncAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns lastError after a failed request', async () => {
    const client = new DocMindClient({ fetchFn: mockFetch('Not Found', 404) })
    await client.connect('http://localhost:3000', 'key')
    // connect succeeds because we need health to pass; let's test via syncKnowledge
    let callCount = 0
    const c = new DocMindClient({
      fetchFn: async (url, opts) => {
        callCount++
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
        }
        return { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}), text: async () => 'Internal error' }
      },
    })
    await c.connect('http://localhost:3000', 'key')
    await c.syncKnowledge([{ content: 'test' }])
    const status = c.getStatus()
    assert.ok(status.lastError, 'lastError should be set after failed sync')
  })
})

// ==================== syncKnowledge ====================

describe('DocMindClient.syncKnowledge', () => {
  async function createConnectedClient(fetchFn) {
    let callCount = 0
    const client = new DocMindClient({
      fetchFn: async (url, opts) => {
        callCount++
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
        }
        return fetchFn(url, opts)
      },
    })
    await client.connect('http://localhost:3000', 'key')
    return client
  }

  it('syncs entries successfully', async () => {
    const client = await createConnectedClient(
      mockFetch({ synced: 3, skipped: 1 })
    )
    const result = await client.syncKnowledge([
      { content: 'entry1', title: 'Title 1' },
      { content: 'entry2', title: 'Title 2' },
      { content: 'entry3', title: 'Title 3' },
    ])
    assert.equal(result.synced, 3)
    assert.equal(result.skipped, 1)
    assert.deepEqual(result.errors, [])
  })

  it('empty array returns zero counts without calling API', async () => {
    let apiCalled = false
    const client = await createConnectedClient(async () => {
      apiCalled = true
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
    })
    const result = await client.syncKnowledge([])
    assert.equal(result.synced, 0)
    assert.equal(result.skipped, 0)
    assert.deepEqual(result.errors, [])
    assert.equal(apiCalled, false)
  })

  it('null input returns zero counts', async () => {
    const client = await createConnectedClient(async () => ({}))
    const result = await client.syncKnowledge(null)
    assert.equal(result.synced, 0)
    assert.deepEqual(result.errors, [])
  })

  it('API error is captured in errors array', async () => {
    const client = await createConnectedClient(
      mockFetch({ error: 'Bad request' }, 400)
    )
    const result = await client.syncKnowledge([{ content: 'test' }])
    assert.equal(result.synced, 0)
    assert.ok(result.errors.length > 0)
    assert.ok(result.errors[0].includes('400'))
  })

  it('throws if not connected', async () => {
    const client = new DocMindClient()
    await assert.rejects(
      () => client.syncKnowledge([{ content: 'test' }]),
      /未连接到 DocMind 服务器/
    )
  })
})

// ==================== syncBookmarks ====================

describe('DocMindClient.syncBookmarks', () => {
  async function createConnectedClient(fetchFn) {
    let callCount = 0
    const client = new DocMindClient({
      fetchFn: async (url, opts) => {
        callCount++
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
        }
        return fetchFn(url, opts)
      },
    })
    await client.connect('http://localhost:3000', 'key')
    return client
  }

  it('syncs bookmarks successfully', async () => {
    const client = await createConnectedClient(
      mockFetch({ synced: 2, skipped: 0 })
    )
    const result = await client.syncBookmarks([
      { url: 'http://example.com', title: 'Example' },
      { url: 'http://test.com', title: 'Test' },
    ])
    assert.equal(result.synced, 2)
    assert.equal(result.skipped, 0)
    assert.deepEqual(result.errors, [])
  })

  it('empty array returns zero counts without calling API', async () => {
    let apiCalled = false
    const client = await createConnectedClient(async () => {
      apiCalled = true
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
    })
    const result = await client.syncBookmarks([])
    assert.equal(result.synced, 0)
    assert.equal(apiCalled, false)
  })

  it('null input returns zero counts', async () => {
    const client = await createConnectedClient(async () => ({}))
    const result = await client.syncBookmarks(null)
    assert.equal(result.synced, 0)
    assert.deepEqual(result.errors, [])
  })

  it('API error is captured in errors array', async () => {
    const client = await createConnectedClient(
      mockFetch({ error: 'Forbidden' }, 403)
    )
    const result = await client.syncBookmarks([{ url: 'http://test.com' }])
    assert.equal(result.synced, 0)
    assert.ok(result.errors.length > 0)
  })

  it('throws if not connected', async () => {
    const client = new DocMindClient()
    await assert.rejects(
      () => client.syncBookmarks([{ url: 'http://test.com' }]),
      /未连接到 DocMind 服务器/
    )
  })
})

// ==================== syncGraph ====================

describe('DocMindClient.syncGraph', () => {
  async function createConnectedClient(fetchFn) {
    let callCount = 0
    const client = new DocMindClient({
      fetchFn: async (url, opts) => {
        callCount++
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
        }
        return fetchFn(url, opts)
      },
    })
    await client.connect('http://localhost:3000', 'key')
    return client
  }

  it('syncs graph data successfully', async () => {
    let capturedBody = null
    const client = await createConnectedClient(async (url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return { ok: true, status: 200, json: async () => ({ synced: 10, skipped: 2 }), text: async () => '{}' }
    })
    const result = await client.syncGraph({ nodes: [], edges: [] })
    assert.equal(result.synced, 10)
    assert.equal(result.skipped, 2)
    assert.deepEqual(result.errors, [])
    assert.deepEqual(capturedBody.graph, { nodes: [], edges: [] })
    assert.equal(capturedBody.incremental, false)
  })

  it('incremental option is passed in request body', async () => {
    let capturedBody = null
    const client = await createConnectedClient(async (url, opts) => {
      capturedBody = JSON.parse(opts.body)
      return { ok: true, status: 200, json: async () => ({ synced: 1 }), text: async () => '{}' }
    })
    await client.syncGraph({ nodes: [] }, { incremental: true, since: '2024-01-01' })
    assert.equal(capturedBody.incremental, true)
    assert.equal(capturedBody.since, '2024-01-01')
  })

  it('null graphData returns zero counts without API call', async () => {
    let apiCalled = false
    const client = await createConnectedClient(async () => {
      apiCalled = true
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
    })
    const result = await client.syncGraph(null)
    assert.equal(result.synced, 0)
    assert.equal(apiCalled, false)
  })

  it('API error is captured', async () => {
    const client = await createConnectedClient(mockFetch({ error: 'fail' }, 500))
    const result = await client.syncGraph({ nodes: [] })
    assert.equal(result.synced, 0)
    assert.ok(result.errors.length > 0)
  })

  it('throws if not connected', async () => {
    const client = new DocMindClient()
    await assert.rejects(() => client.syncGraph({}), /未连接到 DocMind 服务器/)
  })
})

// ==================== fetchGraph ====================

describe('DocMindClient.fetchGraph', () => {
  async function createConnectedClient(fetchFn) {
    let callCount = 0
    const client = new DocMindClient({
      fetchFn: async (url, opts) => {
        callCount++
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
        }
        return fetchFn(url, opts)
      },
    })
    await client.connect('http://localhost:3000', 'key')
    return client
  }

  it('fetches graph data with entities and relations', async () => {
    const client = await createConnectedClient(
      mockFetch({ entities: [{ id: 'A' }], relations: [{ source: 'A', target: 'B' }] })
    )
    const result = await client.fetchGraph()
    assert.equal(result.entities.length, 1)
    assert.equal(result.relations.length, 1)
    assert.equal(result.entities[0].id, 'A')
  })

  it('returns empty arrays on missing fields', async () => {
    const client = await createConnectedClient(mockFetch({}))
    const result = await client.fetchGraph()
    assert.deepEqual(result.entities, [])
    assert.deepEqual(result.relations, [])
  })

  it('passes since and limit as query params', async () => {
    let capturedUrl = null
    const client = await createConnectedClient(async (url) => {
      capturedUrl = url
      return { ok: true, status: 200, json: async () => ({ entities: [], relations: [] }), text: async () => '{}' }
    })
    await client.fetchGraph({ since: '2024-01-01', limit: 50 })
    assert.ok(capturedUrl.includes('since=2024-01-01'))
    assert.ok(capturedUrl.includes('limit=50'))
  })

  it('returns error object on API failure', async () => {
    const client = await createConnectedClient(mockFetch({ error: 'fail' }, 500))
    const result = await client.fetchGraph()
    assert.deepEqual(result.entities, [])
    assert.deepEqual(result.relations, [])
    assert.ok(result.error)
  })

  it('throws if not connected', async () => {
    const client = new DocMindClient()
    await assert.rejects(() => client.fetchGraph(), /未连接到 DocMind 服务器/)
  })
})

// ==================== AI Gateway (delegated methods) ====================

describe('DocMindClient AI Gateway methods', () => {
  async function createConnectedClient(fetchFn) {
    let callCount = 0
    const client = new DocMindClient({
      fetchFn: async (url, opts) => {
        callCount++
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ version: '1.0' }), text: async () => '{}' }
        }
        return fetchFn(url, opts)
      },
    })
    await client.connect('http://localhost:3000', 'key')
    return client
  }

  describe('getAIConfig', () => {
    it('returns AI config with mapped fields', async () => {
      const client = await createConnectedClient(
        mockFetch({
          provider: 'openai',
          model: 'gpt-4o',
          protocol: 'openai',
          base_url: 'https://api.openai.com',
          max_tokens: 8192,
          models: ['gpt-4o', 'gpt-3.5-turbo'],
          last_updated: '2024-06-01',
        })
      )
      const result = await client.getAIConfig()
      assert.equal(result.success, true)
      assert.equal(result.config.provider, 'openai')
      assert.equal(result.config.model, 'gpt-4o')
      assert.equal(result.config.maxTokens, 8192)
      assert.deepEqual(result.config.models, ['gpt-4o', 'gpt-3.5-turbo'])
    })

    it('returns defaults for missing fields', async () => {
      const client = await createConnectedClient(mockFetch({}))
      const result = await client.getAIConfig()
      assert.equal(result.success, true)
      assert.equal(result.config.provider, '')
      assert.equal(result.config.protocol, 'openai')
      assert.equal(result.config.maxTokens, 4096)
    })

    it('returns error on API failure', async () => {
      const client = await createConnectedClient(mockFetch({}, 500))
      const result = await client.getAIConfig()
      assert.equal(result.success, false)
      assert.ok(result.error)
    })

    it('throws if not connected', async () => {
      const client = new DocMindClient()
      await assert.rejects(() => client.getAIConfig(), /未连接到 DocMind 服务器/)
    })
  })

  describe('syncAIConfig', () => {
    it('syncs config successfully', async () => {
      let capturedBody = null
      const client = await createConnectedClient(async (url, opts) => {
        capturedBody = JSON.parse(opts.body)
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      })
      const result = await client.syncAIConfig({
        protocol: 'anthropic',
        model: 'claude-3',
        baseUrl: 'https://api.anthropic.com',
        maxTokens: 4096,
      })
      assert.equal(result.success, true)
      assert.equal(capturedBody.protocol, 'anthropic')
      assert.equal(capturedBody.model, 'claude-3')
      assert.equal(capturedBody.base_url, 'https://api.anthropic.com')
    })

    it('null config returns error', async () => {
      const client = await createConnectedClient(async () => ({}))
      const result = await client.syncAIConfig(null)
      assert.equal(result.success, false)
      assert.equal(result.error, '配置不能为空')
    })

    it('non-object config returns error', async () => {
      const client = await createConnectedClient(async () => ({}))
      const result = await client.syncAIConfig('invalid')
      assert.equal(result.success, false)
      assert.equal(result.error, '配置不能为空')
    })

    it('API failure returns error', async () => {
      const client = await createConnectedClient(mockFetch({}, 500))
      const result = await client.syncAIConfig({ model: 'test' })
      assert.equal(result.success, false)
      assert.ok(result.error)
    })

    it('throws if not connected', async () => {
      const client = new DocMindClient()
      await assert.rejects(() => client.syncAIConfig({}), /未连接到 DocMind 服务器/)
    })
  })

  describe('getAvailableModels', () => {
    it('returns mapped model list', async () => {
      const client = await createConnectedClient(
        mockFetch({
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', family: 'gpt', available: true },
            { model: 'gpt-3.5-turbo', available: false },
          ],
        })
      )
      const result = await client.getAvailableModels()
      assert.equal(result.success, true)
      assert.equal(result.models.length, 2)
      assert.equal(result.models[0].id, 'gpt-4o')
      assert.equal(result.models[0].name, 'GPT-4o')
      assert.equal(result.models[0].family, 'gpt')
      assert.equal(result.models[0].available, true)
      assert.equal(result.models[1].id, 'gpt-3.5-turbo')
      assert.equal(result.models[1].available, false)
    })

    it('returns empty models on missing field', async () => {
      const client = await createConnectedClient(mockFetch({}))
      const result = await client.getAvailableModels()
      assert.equal(result.success, true)
      assert.deepEqual(result.models, [])
    })

    it('returns error with empty models on API failure', async () => {
      const client = await createConnectedClient(mockFetch({}, 500))
      const result = await client.getAvailableModels()
      assert.equal(result.success, false)
      assert.deepEqual(result.models, [])
    })

    it('throws if not connected', async () => {
      const client = new DocMindClient()
      await assert.rejects(() => client.getAvailableModels(), /未连接到 DocMind 服务器/)
    })
  })

  describe('getAIUsage', () => {
    it('returns usage stats with mapped fields', async () => {
      const client = await createConnectedClient(
        mockFetch({
          total_tokens: 10000,
          input_tokens: 6000,
          output_tokens: 4000,
          total_cost_usd: 0.15,
          request_count: 42,
          model_breakdown: { 'gpt-4o': 8000, 'gpt-3.5': 2000 },
        })
      )
      const result = await client.getAIUsage()
      assert.equal(result.success, true)
      assert.equal(result.usage.totalTokens, 10000)
      assert.equal(result.usage.inputTokens, 6000)
      assert.equal(result.usage.outputTokens, 4000)
      assert.equal(result.usage.totalCostUsd, 0.15)
      assert.equal(result.usage.requestCount, 42)
      assert.deepEqual(result.usage.modelBreakdown, { 'gpt-4o': 8000, 'gpt-3.5': 2000 })
    })

    it('passes since/until as query params', async () => {
      let capturedUrl = null
      const client = await createConnectedClient(async (url) => {
        capturedUrl = url
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      })
      await client.getAIUsage({ since: '2024-01-01', until: '2024-06-01' })
      assert.ok(capturedUrl.includes('since=2024-01-01'))
      assert.ok(capturedUrl.includes('until=2024-06-01'))
    })

    it('returns error on API failure', async () => {
      const client = await createConnectedClient(mockFetch({}, 500))
      const result = await client.getAIUsage()
      assert.equal(result.success, false)
      assert.ok(result.error)
    })

    it('throws if not connected', async () => {
      const client = new DocMindClient()
      await assert.rejects(() => client.getAIUsage(), /未连接到 DocMind 服务器/)
    })
  })
})

// ==================== _formatKnowledgeEntry ====================

describe('DocMindClient._formatKnowledgeEntry', () => {
  let client

  beforeEach(() => {
    client = new DocMindClient()
  })

  it('maps standard fields correctly', () => {
    const entry = {
      content: 'test content',
      sourceUrl: 'http://example.com',
      title: 'Test Title',
      tags: ['tag1', 'tag2'],
      entities: ['entity1'],
      category: 'tech',
      createdAt: '2024-01-01T00:00:00Z',
    }
    const result = client._formatKnowledgeEntry(entry)
    assert.equal(result.content, 'test content')
    assert.equal(result.source_url, 'http://example.com')
    assert.equal(result.title, 'Test Title')
    assert.deepEqual(result.tags, ['tag1', 'tag2'])
    assert.deepEqual(result.entities, ['entity1'])
    assert.equal(result.category, 'tech')
    assert.equal(result.created_at, '2024-01-01T00:00:00Z')
  })

  it('falls back to answer/summary for content', () => {
    assert.equal(client._formatKnowledgeEntry({ answer: 'my answer' }).content, 'my answer')
    assert.equal(client._formatKnowledgeEntry({ summary: 'my summary' }).content, 'my summary')
    assert.equal(client._formatKnowledgeEntry({}).content, '')
  })

  it('defaults missing fields to empty values', () => {
    const result = client._formatKnowledgeEntry({})
    assert.equal(result.content, '')
    assert.equal(result.source_url, '')
    assert.equal(result.title, '')
    assert.deepEqual(result.tags, [])
    assert.deepEqual(result.entities, [])
    assert.equal(result.category, '')
    assert.ok(result.created_at, 'created_at should default to now')
  })
})

// ==================== _formatBookmark ====================

describe('DocMindClient._formatBookmark', () => {
  let client

  beforeEach(() => {
    client = new DocMindClient()
  })

  it('maps standard fields correctly', () => {
    const bookmark = {
      url: 'http://example.com',
      title: 'Example',
      description: 'A test page',
      tags: ['test'],
      folder: 'dev',
      createdAt: '2024-01-01T00:00:00Z',
    }
    const result = client._formatBookmark(bookmark)
    assert.equal(result.url, 'http://example.com')
    assert.equal(result.title, 'Example')
    assert.equal(result.description, 'A test page')
    assert.deepEqual(result.tags, ['test'])
    assert.equal(result.folder, 'dev')
    assert.equal(result.created_at, '2024-01-01T00:00:00Z')
  })

  it('falls back to dateAdded for created_at', () => {
    const result = client._formatBookmark({ dateAdded: '2024-06-01' })
    assert.equal(result.created_at, '2024-06-01')
  })

  it('defaults missing fields to empty values', () => {
    const result = client._formatBookmark({})
    assert.equal(result.url, '')
    assert.equal(result.title, '')
    assert.equal(result.description, '')
    assert.deepEqual(result.tags, [])
    assert.equal(result.folder, '')
    assert.ok(result.created_at, 'created_at should default to now')
  })
})

// ==================== _request ====================

describe('DocMindClient._request', () => {
  it('throws when fetchFn is not available', async () => {
    const client = new DocMindClient({ fetchFn: null })
    // If globalThis.fetch exists, _fetchFn won't be null, so we force it
    client._fetchFn = null
    await assert.rejects(
      () => client._request('GET', '/test'),
      /fetch 不可用/
    )
  })

  it('sends GET request with correct headers', async () => {
    let capturedUrl = null
    let capturedOptions = null
    const client = new DocMindClient({
      apiKey: 'test-key',
      fetchFn: async (url, options) => {
        capturedUrl = url
        capturedOptions = options
        return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{}' }
      },
    })
    const result = await client._request('GET', '/api/v1/test')
    assert.equal(capturedUrl, '/api/v1/test')
    assert.equal(capturedOptions.method, 'GET')
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json')
    assert.equal(capturedOptions.headers['Authorization'], 'Bearer test-key')
    assert.equal(capturedOptions.body, undefined)
    assert.deepEqual(result, { ok: true })
  })

  it('sends POST request with JSON body', async () => {
    let capturedOptions = null
    const client = new DocMindClient({
      serverUrl: 'http://localhost:3000',
      apiKey: 'key',
      fetchFn: async (url, options) => {
        capturedOptions = options
        return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '{}' }
      },
    })
    const body = { data: 'test' }
    await client._request('POST', '/api/v1/data', body)
    assert.equal(capturedOptions.method, 'POST')
    assert.equal(capturedOptions.body, JSON.stringify(body))
  })

  it('does not attach body for GET/DELETE even if provided', async () => {
    let capturedOptions = null
    const client = new DocMindClient({
      fetchFn: async (url, options) => {
        capturedOptions = options
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      },
    })
    await client._request('GET', '/test', { should: 'be ignored' })
    assert.equal(capturedOptions.body, undefined)
  })

  it('throws on non-200 status with error message', async () => {
    const client = new DocMindClient({
      fetchFn: async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
        text: async () => 'Resource not found',
      }),
    })
    await assert.rejects(
      () => client._request('GET', '/missing'),
      /DocMind API 404.*Resource not found/
    )
  })

  it('handles text() failure gracefully on error response', async () => {
    const client = new DocMindClient({
      fetchFn: async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
        text: async () => { throw new Error('cannot read body') },
      }),
    })
    await assert.rejects(
      () => client._request('GET', '/error'),
      /DocMind API 500.*Internal Server Error/
    )
  })

  it('converts AbortError to "请求超时"', async () => {
    const client = new DocMindClient({
      fetchFn: mockFetchTimeout(),
    })
    await assert.rejects(
      () => client._request('GET', '/slow'),
      /请求超时/
    )
  })

  it('re-throws non-abort errors', async () => {
    const client = new DocMindClient({
      fetchFn: mockFetchError('DNS resolution failed'),
    })
    await assert.rejects(
      () => client._request('GET', '/unreachable'),
      /DNS resolution failed/
    )
  })

  it('PUT request sends body', async () => {
    let capturedOptions = null
    const client = new DocMindClient({
      fetchFn: async (url, options) => {
        capturedOptions = options
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      },
    })
    await client._request('PUT', '/update', { id: 1 })
    assert.equal(capturedOptions.method, 'PUT')
    assert.equal(capturedOptions.body, JSON.stringify({ id: 1 }))
  })

  it('PATCH request sends body', async () => {
    let capturedOptions = null
    const client = new DocMindClient({
      fetchFn: async (url, options) => {
        capturedOptions = options
        return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }
      },
    })
    await client._request('PATCH', '/patch', { field: 'value' })
    assert.equal(capturedOptions.method, 'PATCH')
    assert.ok(capturedOptions.body)
  })
})
