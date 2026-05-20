/**
 * AI Client — 上下文感知业务方法子模块
 *
 * 从 ai-client.js 拆分，负责 R164 新增的上下文感知业务方法:
 *   - askAboutPageWithContext()  — RAG 增强问答
 *   - askAboutPageWithContextStream() — RAG 增强问答（流式）
 *   - explainTerm() — 术语解释专用方法
 *
 * 通过依赖注入（chat / chatStream / model）实现，
 * 不直接依赖 AIClient 实例，保持可测试性和低耦合。
 *
 * @module lib/ai-client-context-methods
 */

import {
  getContextAwareSystemPrompt,
  buildContextAwarePrompt,
  buildExplainTermPrompt,
  trimConversationHistory,
} from './ai-client-context.js'

/**
 * RAG 增强问答 — 自动上下文感知 + 知识注入
 *
 * @param {Object}  pageContent — 页面内容 {content, title, url, selection, ...}
 * @param {string}  question — 用户问题
 * @param {Object}  options
 * @param {Function} options.chat — chat(messages, opts) 调用函数
 * @param {string}  options.model — 当前模型名
 * @param {Array}   [options.conversationHistory=[]]
 * @param {number}  [options.maxHistoryRounds=5]
 * @param {Object}  [options.contextRetriever=null]
 * @param {string}  [options.pageType='generic']
 * @param {Array}   [options.pageBookmarks=[]]
 * @returns {Promise<Object>} {content, model, usage, contextUsed}
 */
export async function askAboutPageWithContextFn(pageContent, question, options = {}) {
  const {
    chat,
    model: _model,
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
  const systemPrompt = getContextAwareSystemPrompt({ pageType, bookmarks: pageBookmarks })

  // 构建增强版 user prompt
  const userPrompt = buildContextAwarePrompt(pageContent, question, knowledgeRefs)

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: userPrompt },
  ]

  const result = await chat(messages, { systemPrompt })

  return { ...result, contextUsed }
}

/**
 * RAG 增强问答 — 流式版本
 *
 * @param {Object}  pageContent
 * @param {string}  question
 * @param {Object}  options — 同 askAboutPageWithContextFn
 * @yields {string} 流式文本片段
 */
export async function* askAboutPageWithContextStreamFn(pageContent, question, options = {}) {
  const {
    chatStream,
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
  const systemPrompt = getContextAwareSystemPrompt({ pageType, bookmarks: pageBookmarks })

  // 构建增强版 user prompt
  const userPrompt = buildContextAwarePrompt(pageContent, question, knowledgeRefs)

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: userPrompt },
  ]

  yield* chatStream(messages, { systemPrompt })
}

/**
 * 术语解释专用方法
 *
 * @param {string}  term — 选中的术语
 * @param {Object}  pageContent
 * @param {Object}  options
 * @param {Object}  [options.contextRetriever=null]
 * @param {Array}   [options.conversationHistory=[]]
 * @param {Function} options.chat — chat(messages, opts)
 * @param {string}  options.model — 当前模型名
 * @returns {Promise<Object>} {content, model, usage}
 */
export async function explainTermFn(term, pageContent, options = {}) {
  if (!term || typeof term !== 'string' || term.trim().length < 2) {
    const { model } = options
    return {
      content: '选中的文本太短，无法进行术语解释。请选中至少 2 个字符的文本。',
      model,
      usage: null,
    }
  }

  const { contextRetriever = null, conversationHistory = [], chat, model: _model } = options

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

  const trimmedHistory = trimConversationHistory(conversationHistory, 2)
  const messages = [
    ...trimmedHistory,
    { role: 'user', content: userPrompt },
  ]

  return chat(messages, { systemPrompt })
}
