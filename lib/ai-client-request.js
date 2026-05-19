/**
 * AI Client — 请求构建与响应解析子模块
 *
 * 从 ai-client.js 拆分，负责:
 *   - Claude 协议请求构建
 *   - OpenAI 协议请求构建
 *   - 响应解析
 *
 * @module lib/ai-client-request
 */

/**
 * 构建 Claude API 请求
 *
 * @param {Object} opts
 * @param {Array}  opts.messages
 * @param {string} opts.systemPrompt
 * @param {string} opts.model
 * @param {number} opts.maxTokens
 * @param {boolean} opts.stream
 * @param {string} opts.apiKey
 * @param {string} opts.baseUrl
 * @returns {{ url: string, headers: Object, body: Object }}
 */
export function buildClaudeRequest(opts) {
  const { messages, systemPrompt, model, maxTokens, stream, apiKey, baseUrl } = opts

  const claudeMessages = messages.map(msg => {
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map(part => {
          if (part.type === 'text') return { type: 'text', text: part.text }
          if (part.type === 'image_url') {
            return { type: 'image', source: { type: 'url', url: part.image_url.url } }
          }
          if (part.type === 'image') return part
          return part
        })
      }
    }
    return msg
  })

  return {
    url: `${baseUrl}/v1/messages`,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json'
    },
    body: {
      model,
      max_tokens: maxTokens,
      stream,
      system: systemPrompt,
      messages: claudeMessages
    }
  }
}

/**
 * 构建 OpenAI 兼容 API 请求
 *
 * @param {Object} opts
 * @returns {{ url: string, headers: Object, body: Object }}
 */
export function buildOpenAIRequest(opts) {
  const { messages, systemPrompt, model, maxTokens, stream, apiKey, baseUrl } = opts

  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(msg => {
      if (typeof msg.content === 'string') return msg
      if (Array.isArray(msg.content)) {
        const hasVision = msg.content.some(
          c => c.type === 'image_url' || c.type === 'image'
        )
        if (hasVision) {
          return {
            ...msg,
            content: msg.content.map(c => {
              if (c.type === 'text') return { type: 'text', text: c.text }
              if (c.type === 'image_url') return c
              if (c.type === 'image' && c.source?.url) {
                return { type: 'image_url', image_url: { url: c.source.url } }
              }
              return c
            })
          }
        }
        return { ...msg, content: msg.content.map(c => c.text || c.content || '').join('\n') }
      }
      return msg
    })
  ]

  return {
    url: `${baseUrl}/v1/chat/completions`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: {
      model,
      max_tokens: maxTokens,
      stream,
      messages: openaiMessages
    }
  }
}

/**
 * 解析 Claude 响应
 */
export function parseClaudeResponse(data) {
  return {
    content: data.content[0].text,
    usage: data.usage,
    model: data.model
  }
}

/**
 * 解析 OpenAI 响应
 */
export function parseOpenAIResponse(data) {
  return {
    content: data.choices[0].message.content,
    usage: data.usage,
    model: data.model
  }
}
