/**
 * DocMindClient — AI 网关子模块
 *
 * 从 docmind-client.js 拆分的 AI 配置与使用量查询方法。
 * 提供 getAIConfig / syncAIConfig / getAvailableModels / getAIUsage 作为独立函数，
 * 接受 DocMindClient 实例作为第一个参数。
 *
 * @module lib/docmind-client-ai
 */

/**
 * 从 DocMind 获取 AI 配置
 * @param {Object} client — DocMindClient 实例（需要 _request, _ensureConnected, _lastError）
 * @returns {Promise<{success: boolean, config?: Object, error?: string}>}
 */
export async function getAIConfig(client) {
  client._ensureConnected()

  try {
    const data = await client._request('GET', '/api/v1/ai/config')
    return {
      success: true,
      config: {
        provider: data.provider || '',
        model: data.model || '',
        protocol: data.protocol || 'openai',
        baseUrl: data.base_url || data.baseUrl || '',
        maxTokens: data.max_tokens || data.maxTokens || 4096,
        models: data.models || [],
        lastUpdated: data.last_updated || data.lastUpdated || null,
      },
    }
  } catch (err) {
    client._lastError = err.message
    return { success: false, error: err.message }
  }
}

/**
 * 同步 AI 配置到 DocMind
 * @param {Object} client — DocMindClient 实例
 * @param {Object} config - AI 配置
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncAIConfig(client, config) {
  client._ensureConnected()

  if (!config || typeof config !== 'object') {
    return { success: false, error: '配置不能为空' }
  }

  try {
    await client._request('POST', '/api/v1/ai/config', {
      protocol: config.protocol || 'openai',
      model: config.model || '',
      base_url: config.baseUrl || '',
      max_tokens: config.maxTokens || 4096,
    })
    return { success: true }
  } catch (err) {
    client._lastError = err.message
    return { success: false, error: err.message }
  }
}

/**
 * 从 DocMind 获取可用模型列表
 * @param {Object} client — DocMindClient 实例
 * @returns {Promise<{success: boolean, models?: Array<Object>, error?: string}>}
 */
export async function getAvailableModels(client) {
  client._ensureConnected()

  try {
    const data = await client._request('GET', '/api/v1/ai/models')
    const models = (data.models || []).map(m => ({
      id: m.id || m.model || '',
      name: m.name || m.id || m.model || '',
      family: m.family || '',
      available: m.available !== false,
    }))
    return { success: true, models }
  } catch (err) {
    client._lastError = err.message
    return { success: false, error: err.message, models: [] }
  }
}

/**
 * 从 DocMind 获取 AI 使用量统计
 * @param {Object} client — DocMindClient 实例
 * @param {Object} [options] - 查询选项
 * @returns {Promise<{success: boolean, usage?: Object, error?: string}>}
 */
export async function getAIUsage(client, options = {}) {
  client._ensureConnected()

  const queryParams = {}
  if (options.since) queryParams.since = options.since
  if (options.until) queryParams.until = options.until

  const queryString = Object.keys(queryParams).length > 0
    ? '?' + new URLSearchParams(queryParams).toString()
    : ''

  try {
    const data = await client._request('GET', '/api/v1/ai/usage' + queryString)
    return {
      success: true,
      usage: {
        totalTokens: data.total_tokens || data.totalTokens || 0,
        inputTokens: data.input_tokens || data.inputTokens || 0,
        outputTokens: data.output_tokens || data.outputTokens || 0,
        totalCostUsd: data.total_cost_usd || data.totalCostUsd || 0,
        requestCount: data.request_count || data.requestCount || 0,
        modelBreakdown: data.model_breakdown || data.modelBreakdown || {},
        period: data.period || { since: options.since || null, until: options.until || null },
      },
    }
  } catch (err) {
    client._lastError = err.message
    return { success: false, error: err.message }
  }
}
