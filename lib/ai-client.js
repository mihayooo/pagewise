/**
 * AI Client - 统一支持 Claude / OpenAI / 兼容协议
 *
 * 子模块:
 *   - ai-client-tokens.js — Token 估算
 *   - ai-client-stream.js — 流式解析
 *   - ai-client-request.js — 请求构建与响应解析
 *   - ai-client-prompts.js — 提示词与业务方法
 */

import { generateCacheKey } from './ai-cache.js'
import { classifyAIError } from './error-handler.js'
import { buildClaudeRequest, buildOpenAIRequest, parseClaudeResponse, parseOpenAIResponse } from './ai-client-request.js'
import { parseClaudeStream, parseOpenAIStream } from './ai-client-stream.js'
import { buildPageQuestionPrompt, getSystemPrompt } from './ai-client-prompts.js'
import {
  getContextAwareSystemPrompt,
  buildContextAwarePrompt,
  buildExplainTermPrompt,
  trimConversationHistory,
} from './ai-client-context.js'

export class AIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || ''
    this.baseUrl = (options.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/v1\/?$/, '')
    this.model = options.model || 'claude-sonnet-4-6'
    this.maxTokens = options.maxTokens || 4096
    this.protocol = options.protocol || 'openai'
  }

  isClaude() {
    return this.protocol === 'claude'
  }

  isOpenAI() {
    return this.protocol === 'openai'
  }

  // ==================== 核心调用 ====================

  async chat(messages, options = {}) {
    const { url, headers, body } = this.buildRequest(messages, options)
    const signal = options.signal || undefined
    let response
    try {
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (fetchError) {
      const classified = classifyAIError(fetchError)
      const error = new Error(`网络错误: ${fetchError.message}`)
      error.classified = classified
      throw error
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const errMsg = errorBody.error?.message || errorBody.message || 'Unknown error'
      const rawError = new Error(`API ${response.status}: ${errMsg}`)
      const classified = classifyAIError(rawError)
      rawError.classified = classified
      throw rawError
    }

    const data = await response.json()
    return this.parseResponse(data)
  }

  async *chatStream(messages, options = {}) {
    const { url, headers, body } = this.buildRequest(messages, { ...options, stream: true })
    const signal = options.signal || undefined

    let response
    try {
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (fetchError) {
      const classified = classifyAIError(fetchError)
      const error = new Error(`网络错误: ${fetchError.message}`)
      error.classified = classified
      throw error
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const errMsg = errorBody.error?.message || errorBody.message || 'Unknown error'
      const rawError = new Error(`API ${response.status}: ${errMsg}`)
      const classified = classifyAIError(rawError)
      rawError.classified = classified
      throw rawError
    }

    if (!response.body) {
      const result = await this.chat(messages, options)
      yield result.content
      return
    }

    if (this.isClaude()) {
      yield* parseClaudeStream(response)
    } else {
      yield* parseOpenAIStream(response)
    }
  }

  // ==================== 缓存增强 ====================

  async cachedChat(messages, options = {}, cache) {
    const cacheKey = generateCacheKey({
      messages,
      systemPrompt: options.systemPrompt || '',
      model: options.model || this.model,
      maxTokens: options.maxTokens || this.maxTokens,
      protocol: this.protocol
    })

    if (cacheKey && cache) {
      const cached = cache.get(cacheKey)
      if (cached) {
        return { ...cached, fromCache: true }
      }
    }

    const result = await this.chat(messages, options)

    if (cacheKey && cache) {
      cache.set(cacheKey, { content: result.content, model: result.model, usage: result.usage })
    }

    return { ...result, fromCache: false }
  }

  async *cachedChatStream(messages, options = {}, cache) {
    const cacheKey = generateCacheKey({
      messages,
      systemPrompt: options.systemPrompt || '',
      model: options.model || this.model,
      maxTokens: options.maxTokens || this.maxTokens,
      protocol: this.protocol
    })

    if (cacheKey && cache) {
      const cached = cache.get(cacheKey)
      if (cached) {
        yield cached.content
        return
      }
    }

    let fullContent = ''
    for await (const chunk of this.chatStream(messages, options)) {
      fullContent += chunk
      yield chunk
    }

    if (cacheKey && cache && fullContent) {
      cache.set(cacheKey, { content: fullContent, model: this.model })
    }
  }

  // ==================== 请求构建 ====================

  buildRequest(messages, options = {}) {
    const systemPrompt = options.systemPrompt || this.getSystemPrompt()
    const model = options.model || this.model
    const maxTokens = options.maxTokens || this.maxTokens
    const stream = options.stream || false

    const opts = { messages, systemPrompt, model, maxTokens, stream, apiKey: this.apiKey, baseUrl: this.baseUrl }

    if (this.isClaude()) {
      return buildClaudeRequest(opts)
    } else {
      return buildOpenAIRequest(opts)
    }
  }

  buildOpenAIRequest(messages, options = {}) {
    const opts = {
      messages,
      systemPrompt: options.systemPrompt || '',
      model: options.model || this.model,
      maxTokens: options.maxTokens || this.maxTokens,
      stream: options.stream || false,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    }
    return buildOpenAIRequest(opts)
  }

  buildClaudeRequest(messages, options = {}) {
    const opts = {
      messages,
      systemPrompt: options.systemPrompt || '',
      model: options.model || this.model,
      maxTokens: options.maxTokens || this.maxTokens,
      stream: options.stream || false,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    }
    return buildClaudeRequest(opts)
  }

  // ==================== 响应解析 ====================

  parseResponse(data) {
    if (this.isClaude()) {
      return parseClaudeResponse(data)
    } else {
      return parseOpenAIResponse(data)
    }
  }

  // ==================== 模型发现 ====================

  async listModels() {
    if (this.isClaude()) {
      return [
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'claude-haiku-4-5'
      ]
    }

    const url = `${this.baseUrl}/v1/models`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const rawError = new Error(`API ${response.status}: 获取模型列表失败`)
      rawError.classified = classifyAIError(rawError)
      throw rawError
    }

    const data = await response.json()
    return (data.data || [])
      .map(m => m.id)
      .filter(id => id && typeof id === 'string')
      .sort()
  }

  // ==================== 测试连接 ====================

  async testConnection() {
    try {
      const result = await this.chat([{
        role: 'user',
        content: 'Hi, reply with "OK" only.'
      }], {
        maxTokens: 10,
        systemPrompt: 'Reply with "OK" only.'
      })

      return {
        success: true,
        model: result.model,
        protocol: this.protocol === 'claude' ? 'Claude' : 'OpenAI',
        content: result.content.slice(0, 50)
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        protocol: this.protocol === 'claude' ? 'Claude' : 'OpenAI'
      }
    }
  }

  // ==================== 业务方法 (委托) ====================

  async askAboutPage(pageContent, userQuestion, conversationHistory = []) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: buildPageQuestionPrompt(pageContent, userQuestion) }
    ]
    return this.chat(messages)
  }

  async *askAboutPageStream(pageContent, userQuestion, conversationHistory = []) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: buildPageQuestionPrompt(pageContent, userQuestion) }
    ]
    yield* this.chatStream(messages)
  }

  async generateSummaryAndTags(content) {
    const response = await this.chat([{
      role: 'user',
      content: `请为以下内容生成：
1. 一段简洁的摘要（2-3句话）
2. 3-5个相关标签（用于分类检索）

内容：
${content.slice(0, 3000)}

请以 JSON 格式返回：
{"summary": "...", "tags": ["tag1", "tag2", "tag3"]}`
    }], {
      maxTokens: 500,
      systemPrompt: '你是一个内容分析助手。只返回 JSON，不要其他文字。'
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      return JSON.parse(jsonMatch[0])
    } catch (_e) {
      return { summary: content.slice(0, 200), tags: ['未分类'] }
    }
  }

  buildPageQuestionPrompt(pageContent, question) {
    return buildPageQuestionPrompt(pageContent, question)
  }

  getSystemPrompt() {
    return getSystemPrompt()
  }

  // ==================== 上下文感知增强 (R164) ====================

  /**
   * 增强版问答 — 自动上下文感知 + RAG 知识注入
   *
   * 与 askAboutPage() 签名不同，上下文增强通过 options.contextRetriever 注入。
   * 原有 askAboutPage() / askAboutPageStream() 签名和行为完全不变。
   *
   * @param {Object} pageContent
   * @param {string} question
   * @param {Object} [options]
   * @param {Array}  [options.conversationHistory] — 对话历史
   * @param {number} [options.maxHistoryRounds=5]  — 最大保留轮数
   * @param {Object} [options.contextRetriever]    — ContextRetriever 实例
   * @param {Object} [options.pageType]            — 页面类型标识
   * @param {Array}  [options.pageBookmarks]       — 当前页面关联书签
   * @returns {Promise<{content: string, model: string, usage: Object, contextUsed: Object}>}
   */
  async askAboutPageWithContext(pageContent, question, options = {}) {
    const {
      conversationHistory = [],
      maxHistoryRounds = 5,
      contextRetriever = null,
      pageType = 'generic',
      pageBookmarks = [],
    } = options

    const contextUsed = { knowledgeRefs: [], pageBookmarks: pageBookmarks || [] }

    // RAG: 从知识库检索相关条目
    let knowledgeRefs = []
    if (contextRetriever) {
      try {
        knowledgeRefs = await contextRetriever.retrieveContext(question, { limit: 3 })
        contextUsed.knowledgeRefs = knowledgeRefs
      } catch {
        // 静默降级
      }
    }

    // 裁剪对话历史
    const trimmedHistory = trimConversationHistory(conversationHistory, maxHistoryRounds)

    // 动态 system prompt
    const systemPrompt = getContextAwareSystemPrompt({
      pageType,
      bookmarks: pageBookmarks,
    })

    // 构建增强版 user prompt
    const userPrompt = buildContextAwarePrompt(pageContent, question, knowledgeRefs)

    const messages = [
      ...trimmedHistory,
      { role: 'user', content: userPrompt },
    ]

    const result = await this.chat(messages, { systemPrompt })

    return {
      ...result,
      contextUsed,
    }
  }

  /**
   * 增强版问答 — 流式版本
   *
   * @param {Object} pageContent
   * @param {string} question
   * @param {Object} [options] — 同 askAboutPageWithContext
   * @yields {string} 流式文本片段
   */
  async *askAboutPageWithContextStream(pageContent, question, options = {}) {
    const {
      conversationHistory = [],
      maxHistoryRounds = 5,
      contextRetriever = null,
      pageType = 'generic',
      pageBookmarks = [],
    } = options

    // RAG: 从知识库检索相关条目
    let knowledgeRefs = []
    if (contextRetriever) {
      try {
        knowledgeRefs = await contextRetriever.retrieveContext(question, { limit: 3 })
      } catch {
        // 静默降级
      }
    }

    // 裁剪对话历史
    const trimmedHistory = trimConversationHistory(conversationHistory, maxHistoryRounds)

    // 动态 system prompt
    const systemPrompt = getContextAwareSystemPrompt({
      pageType,
      bookmarks: pageBookmarks,
    })

    // 构建增强版 user prompt
    const userPrompt = buildContextAwarePrompt(pageContent, question, knowledgeRefs)

    const messages = [
      ...trimmedHistory,
      { role: 'user', content: userPrompt },
    ]

    yield* this.chatStream(messages, { systemPrompt })
  }

  /**
   * 解释术语专用方法
   *
   * 以专用 prompt 发送请求，系统角色切换为"术语解释专家"。
   *
   * @param {string} term
   * @param {Object} pageContent
   * @param {Object} [options]
   * @param {Object} [options.contextRetriever]
   * @param {Array}  [options.conversationHistory]
   * @returns {Promise<{content: string, model: string, usage: Object}>}
   */
  async explainTerm(term, pageContent, options = {}) {
    if (!term || typeof term !== 'string' || term.trim().length < 2) {
      return {
        content: '选中的文本太短，无法进行术语解释。请选中至少 2 个字符的文本。',
        model: this.model,
        usage: null,
      }
    }

    const { contextRetriever = null, conversationHistory = [] } = options

    // 术语解释专用 system prompt
    const systemPrompt = `你是一个术语解释专家，擅长用简洁清晰的语言解释专业术语和概念。

回答格式：
1. **定义** — 一句话简洁定义
2. **类比** — 用日常生活的例子帮助理解
3. **代码示例** — 如适用，给出简短的代码示例和注释
4. **相关术语** — 列出 2-3 个相关概念

请用中文回答，专业术语保留英文原文。`

    // 检索相关知识
    let knowledgeRefs = []
    if (contextRetriever) {
      try {
        knowledgeRefs = await contextRetriever.retrieveForTerm(term, { limit: 2 })
      } catch {
        // 静默降级
      }
    }

    // 构建 prompt
    let userPrompt = buildExplainTermPrompt(term, pageContent)

    // 注入知识参考
    if (knowledgeRefs.length > 0) {
      const refText = knowledgeRefs
        .map((r, i) => `${i + 1}. [${r.title}]${r.summary ? ` — ${r.summary.slice(0, 150)}` : ''}${r.url ? ` (${r.url})` : ''}`)
        .join('\n')
      userPrompt += `\n\n【已有知识参考】\n${refText}`
    }

    const trimmedHistory = trimConversationHistory(conversationHistory, 2) // 术语解释保留更少历史
    const messages = [
      ...trimmedHistory,
      { role: 'user', content: userPrompt },
    ]

    return this.chat(messages, { systemPrompt })
  }
}

// ==================== 向后兼容 re-export ====================
export { estimateTokens, estimateMessagesTokens } from './ai-client-tokens.js'
