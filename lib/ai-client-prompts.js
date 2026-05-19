/**
 * AI Client — 提示词与业务方法子模块
 *
 * 从 ai-client.js 拆分，负责:
 *   - 系统提示词
 *   - 页面提问提示词构建
 *   - 摘要与标签生成
 *
 * @module lib/ai-client-prompts
 */

/**
 * 构建页面问答提示词
 *
 * @param {Object} pageContent
 * @param {string} question
 * @returns {string}
 */
export function buildPageQuestionPrompt(pageContent, question) {
  const content = pageContent?.content || ''
  const title = pageContent?.title || '未知页面'
  const url = pageContent?.url || ''
  const selection = pageContent?.selection || ''
  const codeBlocks = pageContent?.codeBlocks || []
  const siteName = pageContent?.meta?.siteName

  let prompt = ''

  if (selection) {
    prompt += `用户在页面中选中了以下文本：\n\n"${selection}"\n\n`
  }

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

  prompt += `\n\n用户的问题：${question}\n\n`
  prompt += `请给出清晰、有条理的解答。如果涉及代码，请给出具体示例。`
  return prompt
}

/**
 * 获取默认系统提示词
 * @returns {string}
 */
export function getSystemPrompt() {
  return `你是一个技术知识助手，帮助用户理解他们在浏览网页时遇到的技术内容。

你的职责：
1. 根据用户提供的网页内容，回答他们的技术问题
2. 用清晰、简洁的语言解释复杂概念
3. 如果涉及代码，给出具体示例和解释
4. 将关键知识点整理成结构化的形式，方便后续学习
5. 如果页面内容不足以回答问题，基于你的知识补充说明
6. 当用户需要深入分析代码、诊断错误、生成学习路径时，主动调用可用的技能（Skills）

回答风格：
- 条理清晰，使用标题和列表
- 关键术语给出解释
- 代码示例要有注释
- 适当类比帮助理解`
}
