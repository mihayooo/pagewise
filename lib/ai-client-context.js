/**
 * AI Client — 上下文感知 Prompt 构建子模块
 *
 * 从 ai-client.js 的上下文增强逻辑拆分，负责:
 *   - 动态 system prompt 生成（页面类型 + 用户知识背景）
 *   - 知识增强 prompt 构建（RAG 注入）
 *   - 术语解释 prompt 模板
 *   - 对话历史窗口裁剪
 *   - 内容安全 sanitization
 *
 * @module lib/ai-client-context
 */

// ==================== 页面类型 → 提示语映射 ====================

const PAGE_TYPE_HINTS = Object.freeze({
  'api-doc':      '当前页面是 API 文档。请侧重解释端点用法、请求/响应结构、参数含义。示例代码优先展示 cURL 或 fetch 调用。',
  'github-repo':  '当前页面是 GitHub 仓库。请侧重代码结构分析、文件组织、依赖关系和仓库功能说明。',
  'code-repo':    '当前页面是代码仓库。请侧重代码结构、文件组织和仓库功能说明。',
  'youtube':      '当前页面是 YouTube 视频页面。请结合视频标题和描述回答，如有代码相关内容给出具体示例。',
  'qa-page':      '当前页面是技术问答（如 Stack Overflow）。请侧重问题诊断、解决方案对比和最佳实践推荐。',
  'tech-blog':    '当前页面是技术博客。请结合博文内容深入分析，补充相关背景知识和实践建议。',
  'generic':      '',
})

/**
 * 获取动态 system prompt（上下文感知）
 *
 * 拼接策略: 基础角色 + 页面类型提示 + 用户已存书签上下文
 *
 * 不修改 getSystemPrompt() 原有签名，本函数为独立入口。
 *
 * @param {Object} [context]
 * @param {string} [context.pageType]   — 页面类型标识（来自 page-detector / page-sense）
 * @param {Array}  [context.bookmarks]  — 当前页面关联的已存书签 [{title, tags, summary}]
 * @param {string} [context.userLevel]  — 用户水平 (beginner/intermediate/advanced)
 * @returns {string}
 */
export function getContextAwareSystemPrompt(context = {}) {
  // 基础角色（与原 getSystemPrompt 一致）
  let prompt = `你是一个技术知识助手，帮助用户理解他们在浏览网页时遇到的技术内容。

你的职责：
1. 根据用户提供的网页内容，回答他们的技术问题
2. 用清晰、简洁的语言解释复杂概念
3. 如果涉及代码，给出具体示例和解释
4. 将关键知识点整理成结构化的形式，方便后续学习
5. 如果页面内容不足以回答问题，基于你的知识补充说明

回答风格：
- 条理清晰，使用标题和列表
- 关键术语给出解释
- 代码示例要有注释
- 适当类比帮助理解`

  // 页面类型提示
  const pageType = context.pageType || 'generic'
  const typeHint = PAGE_TYPE_HINTS[pageType]
  if (typeHint) {
    prompt += `\n\n【页面类型提示】${typeHint}`
  }

  // 用户已存书签上下文
  if (context.bookmarks && context.bookmarks.length > 0) {
    const bmList = context.bookmarks
      .slice(0, 3)
      .map(bm => {
        const tags = bm.tags && bm.tags.length > 0 ? ` [${bm.tags.join(', ')}]` : ''
        const summary = bm.summary ? ` — ${bm.summary.slice(0, 100)}` : ''
        return `- ${bm.title}${tags}${summary}`
      })
      .join('\n')

    prompt += `\n\n【用户知识背景】用户已收藏以下相关书签：\n${bmList}\n请在回答时适当关联用户已有知识。`
  }

  return prompt
}

/**
 * 构建上下文增强版 user prompt
 *
 * 在原有 buildPageQuestionPrompt 基础上注入 RAG 知识参考。
 *
 * @param {Object} pageContent
 * @param {string} question
 * @param {Array}  [knowledgeRefs]  — ContextRetriever.retrieveContext() 返回的条目
 * @param {Object} [options]
 * @param {number} [options.maxRefLength=2000] — 知识参考总字符数上限
 * @returns {string}
 */
export function buildContextAwarePrompt(pageContent, question, knowledgeRefs = [], options = {}) {
  const content = pageContent?.content || ''
  const title = pageContent?.title || '未知页面'
  const url = pageContent?.url || ''
  const selection = pageContent?.selection || ''
  const codeBlocks = pageContent?.codeBlocks || []
  const siteName = pageContent?.meta?.siteName

  let prompt = ''

  // 选中文本高亮
  if (selection) {
    prompt += `用户在页面中选中了以下文本：\n\n"${selection}"\n\n`
  }

  // 页面信息
  if (content) {
    prompt += `当前浏览的网页信息：\n`
    prompt += `- 标题：${title}\n`
    prompt += `- 网址：${url}\n`
    if (siteName) prompt += `- 来源：${siteName}\n`
    prompt += `\n页面内容：\n${content.slice(0, 8000)}`

    if (codeBlocks.length > 0) {
      prompt += `\n\n页面中的代码：\n`
      codeBlocks.slice(0, 5).forEach((block) => {
        prompt += `\`\`\`${block.lang || 'text'}\n${(block.code || '').slice(0, 2000)}\n\`\`\`\n\n`
      })
    }
  } else {
    prompt += `（未能获取到页面内容，请基于你的知识直接回答）\n`
    if (title) prompt += `用户当前页面标题：${title}\n`
  }

  // RAG 知识参考注入
  if (knowledgeRefs && knowledgeRefs.length > 0) {
    const maxRefLength = options.maxRefLength || 2000
    const refSection = buildKnowledgeRefSection(knowledgeRefs, maxRefLength)
    if (refSection) {
      prompt += `\n\n${refSection}`
    }
  }

  prompt += `\n\n用户的问题：${question}\n\n`
  prompt += `请给出清晰、有条理的解答。如果涉及代码，请给出具体示例。`
  return prompt
}

/**
 * 构建知识参考注入文本
 *
 * @param {Array}  refs — [{title, summary, url}]
 * @param {number} maxLength — 总字符数上限
 * @returns {string} 格式化的知识参考文本，或空字符串
 */
export function buildKnowledgeRefSection(refs, maxLength = 2000) {
  if (!refs || refs.length === 0) return ''

  const lines = ['【已有知识参考】']
  let totalLen = lines[0].length

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]
    const source = ref.url ? ` (来源: ${ref.url})` : ''
    const summary = ref.summary ? ` — ${ref.summary.slice(0, 200)}` : ''
    const line = `${i + 1}. [${ref.title}]${summary}${source}`

    if (totalLen + line.length > maxLength && lines.length > 1) break

    lines.push(line)
    totalLen += line.length
  }

  return lines.join('\n')
}

/**
 * 构建术语解释专用 prompt
 *
 * @param {string} term         — 选中的术语文本
 * @param {Object} pageContent  — 当前页面内容
 * @returns {string} prompt 文本；若 term 无效返回空字符串
 */
export function buildExplainTermPrompt(term, pageContent) {
  if (!term || typeof term !== 'string') return ''

  const trimmed = term.trim()
  if (trimmed.length < 2) return ''

  // 超长截断
  const MAX_TERM_LENGTH = 500
  const actualTerm = trimmed.length > MAX_TERM_LENGTH
    ? trimmed.slice(0, MAX_TERM_LENGTH)
    : trimmed

  const title = pageContent?.title || ''
  const url = pageContent?.url || ''
  const selection = pageContent?.selection || ''

  let prompt = ''
  if (selection) {
    prompt += `用户在页面中选中了以下文本：\n\n"${selection}"\n\n`
  }

  prompt += `请解释以下术语/概念：「${actualTerm}」\n\n`

  if (title || url) {
    prompt += `当前页面信息：\n`
    if (title) prompt += `- 标题：${title}\n`
    if (url) prompt += `- 网址：${url}\n`
    prompt += `\n`
  }

  prompt += `要求：\n`
  prompt += `1. 给出清晰的定义\n`
  prompt += `2. 用简单类比帮助理解\n`
  prompt += `3. 如有可能，给出代码示例\n`
  prompt += `4. 列出相关术语\n`
  prompt += `5. 结合当前页面上下文解释`

  return prompt
}

/**
 * 裁剪对话历史至最近 N 轮
 *
 * 一轮 = 1 user + 1 assistant（共 2 条 messages）
 * 超出窗口的历史消息自动丢弃最早轮次。
 * 单轮 assistant 消息超 2000 字符时截断。
 *
 * @param {Array<{role: string, content: string}>} history
 * @param {number} [maxRounds=5]
 * @returns {Array} 裁剪后的 messages
 */
export function trimConversationHistory(history, maxRounds = 5) {
  if (!Array.isArray(history) || history.length === 0) return []

  const maxMessages = maxRounds * 2

  // 先截断超长 assistant 消息
  const processed = history.map(msg => {
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 2000) {
      return { ...msg, content: msg.content.slice(0, 2000) }
    }
    return msg
  })

  if (processed.length <= maxMessages) {
    return processed
  }

  // 丢弃最早轮次
  return processed.slice(processed.length - maxMessages)
}

/**
 * 安全消毒 — 移除潜在 prompt injection 内容
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeContent(text) {
  if (!text || typeof text !== 'string') return ''

  let sanitized = text

  // 移除控制字符（保留换行和制表符）
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // 移除 system: / assistant: / user: 前缀（行首）
  sanitized = sanitized.replace(/^(system|assistant|user)\s*:\s*/gim, '')

  // 移除连续 --- 分隔符（3个以上）
  sanitized = sanitized.replace(/-{3,}\n/g, '\n')
  sanitized = sanitized.replace(/-{3,}$/gm, '')

  // 移除 <<< 和 >>> 指令标记
  sanitized = sanitized.replace(/<<<[\s\S]*?>>>/g, '')

  return sanitized.trim()
}
