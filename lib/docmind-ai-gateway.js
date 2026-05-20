/**
 * DocMind AI Gateway — AI 配置和模型管理 API
 *
 * 从 DocMindClient 中提取的 AI 相关网关方法。
 * 这些函数设计为通过 call/apply 在 DocMindClient 实例上下文中调用。
 *
 * @module docmind-ai-gateway
 */

import { API_PATHS } from './docmind-api-paths.js'

/**
 * 从 DocMind 获取 AI 配置
 * @param {Object} client - DocMindClient 实例
 * @returns {Promise<{success: boolean, config?: Object, error?: string}>}
 */
export async function getAIConfig(client) {
  client._ensureConnected()
  try {
    const data = await client._request('GET', API_PATHS.aiConfig)
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
 * @param {Object} client - DocMindClient 实例
 * @param {Object} config - AI 配置
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncAIConfig(client, config) {
  client._ensureConnected()
  if (!config || typeof config !== 'object') {
    return { success: false, error: '配置不能为空' }
  }
  try {
    await client._request('POST', API_PATHS.aiConfig, {
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
 * @param {Object} client - DocMindClient 实例
 * @returns {Promise<{success: boolean, models?: Array<Object>, error?: string}>}
 */
export async function getAvailableModels(client) {
  client._ensureConnected()
  try {
    const data = await client._request('GET', API_PATHS.aiModels)
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
 * @param {Object} client - DocMindClient 实例
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
    const data = await client._request('GET', API_PATHS.aiUsage + queryString)
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
