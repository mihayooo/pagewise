/**
 * Wiki Query — Prompt 构建与引用提取
 *
 * 从 wiki-query.js (R150) 拆分:
 *   - buildWikiSystemPrompt — 系统提示词
 *   - buildWikiQuestionPrompt — 用户消息组装
 *   - extractPageReferences — 从 AI 回答中提取引用
 *   - isAnswerWorthArchiving — 归档判断
 *   - buildAnswerArchivePrompt — 归档提示词构建
 */

/**
 * 生成 Wiki 查询专用的系统提示词
 *
 * @returns {string} 系统提示词
 */
export function buildWikiSystemPrompt() {
  return `你是一个知识库助手，基于用户的个人 Wiki 知识库来回答问题。

你的职责：
1. 基于提供的 Wiki 页面内容回答用户问题，优先引用 Wiki 中已有的知识
2. 在回答中明确标注引用来源，使用格式：[来源: 页面标题]
3. 如果 Wiki 中没有相关信息，基于你的知识补充说明，并标注为「外部知识」
4. 将相关知识点进行归纳总结，帮助用户建立知识关联
5. 如果发现 Wiki 中存在可能过时或矛盾的知识，主动提醒用户

回答风格：
- 条理清晰，使用标题和列表
- 每个关键点标注来源
- 适当补充 Wiki 中没有的扩展知识`;
}

/**
 * 组装 Wiki 查询的完整用户消息
 *
 * @param {string} context - wiki 上下文文本
 * @param {string} question - 用户问题
 * @returns {string} 完整的用户消息
 */
export function buildWikiQuestionPrompt(context, question) {
  if (!question || typeof question !== 'string') return '';

  let prompt = '';

  if (context && typeof context === 'string' && context.trim()) {
    prompt += `以下是从 Wiki 知识库中检索到的相关页面：\n\n${context}\n\n`;
  } else {
    prompt += `（Wiki 知识库中没有找到与问题直接相关的页面）\n\n`;
  }

  prompt += `用户的问题：${question}\n\n`;
  prompt += `请基于以上 Wiki 知识回答。每引用一个知识点时标注来源。`;

  return prompt;
}

/**
 * 从 AI 回答中提取引用的 wiki 页面
 *
 * 支持的引用格式：
 *   - [来源: 页面标题]
 *   - [来源: 页面标题](pageId)
 *   - （来源：页面标题）
 *
 * @param {string} response - AI 回答文本
 * @param {Map<string, Object>} pageMap - 页面 ID → 页面对象的映射
 * @returns {Array<Object>} 被引用的页面对象列表（去重）
 */
export function extractPageReferences(response, pageMap) {
  if (!response || typeof response !== 'string') return [];
  if (!pageMap || !(pageMap instanceof Map)) return [];

  const seen = new Set();
  const references = [];

  // 匹配 [来源: xxx] 或 [来源: xxx](yyy)
  const regex = /\[来源[:：]\s*([^\]\)]+)\](?:\(([^\)]+)\))?/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    const titleOrId = (match[2] || match[1] || '').trim();
    if (!titleOrId || seen.has(titleOrId)) continue;

    // 先按 ID 查找
    let page = pageMap.get(titleOrId);

    // 按标题查找
    if (!page) {
      for (const [id, p] of pageMap) {
        if (p.title && p.title.toLowerCase() === titleOrId.toLowerCase()) {
          page = p;
          break;
        }
      }
    }

    if (page) {
      seen.add(titleOrId);
      references.push(page);
    }
  }

  // 也匹配 （来源：xxx）
  const regex2 = /（来源[：:]\s*([^）]+)）/g;
  while ((match = regex2.exec(response)) !== null) {
    const titleOrId = (match[1] || '').trim();
    if (!titleOrId || seen.has(titleOrId)) continue;

    let page = pageMap.get(titleOrId);
    if (!page) {
      for (const [id, p] of pageMap) {
        if (p.title && p.title.toLowerCase() === titleOrId.toLowerCase()) {
          page = p;
          break;
        }
      }
    }

    if (page) {
      seen.add(titleOrId);
      references.push(page);
    }
  }

  return references;
}

/** 归档最低回答长度（字符数） */
const ARCHIVE_MIN_LENGTH = 100;

/**
 * 判断回答是否值得归档回 wiki
 *
 * 启发式规则：
 *   - 回答长度 >= 100 字符
 *   - 非空内容
 *
 * @param {string} question - 用户问题
 * @param {string} answer - AI 回答
 * @returns {boolean} 是否值得归档
 */
export function isAnswerWorthArchiving(question, answer) {
  if (!answer || typeof answer !== 'string') return false;
  const trimmed = answer.trim();
  if (trimmed.length < ARCHIVE_MIN_LENGTH) return false;
  // 排除错误消息
  if (trimmed.startsWith('⚠️') || trimmed.startsWith('❌')) return false;
  return true;
}

/**
 * 构建归档提示词
 *
 * 生成用于 AI 的提示词，让 AI 将问答对整理为 wiki 页面格式。
 *
 * @param {string} question - 用户问题
 * @param {string} answer - AI 回答
 * @returns {string} 归档提示词
 */
export function buildAnswerArchivePrompt(question, answer) {
  if (!question || !answer) return '';

  return `请将以下问答整理为知识库条目格式，返回 JSON：

问答内容：
问题：${question}
回答：${answer}

请返回如下 JSON 格式：
{
  "title": "简洁的标题（10字以内）",
  "question": "整理后的规范问题",
  "answer": "整理后的完整回答",
  "tags": ["相关标签1", "相关标签2"]
}

只返回 JSON，不要其他内容。`;
}
