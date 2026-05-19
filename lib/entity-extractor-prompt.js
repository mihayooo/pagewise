/**
 * EntityExtractor Prompt — 提示词构建
 *
 * 从 entity-extractor.js 拆分：
 *   - buildExtractionPrompt — 构建 AI 提示词
 *   - truncateText — 文本截断
 *
 * 纯 ES Module，无副作用。
 */

/**
 * 构建实体/概念提取的 AI 提示词
 *
 * @param {Array<Object>} entries - Q&A 知识条目数组
 * @returns {string} 发送给 AI 的提示词
 */
export function buildExtractionPrompt(entries) {
  if (!entries || entries.length === 0) {
    return '请从以下 Q&A 条目中提取实体和概念，以 JSON 格式返回。无输入条目时返回空数组。';
  }

  const entryTexts = entries.map((entry, idx) => {
    const parts = [];
    parts.push(`[ID: ${entry.id || idx + 1}]`);
    if (entry.title) parts.push(`标题: ${entry.title}`);
    if (entry.question) parts.push(`问题: ${entry.question}`);
    if (entry.answer) parts.push(`回答: ${truncateText(entry.answer, 500)}`);
    if (entry.tags && entry.tags.length > 0) parts.push(`标签: ${entry.tags.join(', ')}`);
    return parts.join('\n');
  }).join('\n---\n');

  return `你是一个知识分析专家。请从以下 Q&A 条目中提取所有提到的**实体**和**概念**。

## 提取规则

### 实体 (entities)
识别以下类型的实体：
- **person**: 人名（如 Linus Torvalds、Kent Beck）
- **tool**: 工具名（如 Docker、Webpack、Git）
- **framework**: 框架名（如 React、Spring、Django）
- **api**: API/协议名（如 REST API、GraphQL、WebSocket）
- **language**: 编程语言（如 JavaScript、Python、Rust）
- **platform**: 平台名（如 GitHub、AWS、Kubernetes）
- **library**: 库名（如 Lodash、Axios、NumPy）
- **service**: 服务名（如 GitHub Actions、Vercel、Netlify）
- **other**: 其他技术实体

### 概念 (concepts)
识别以下类型的概念：
- 技术概念（如容器化、微服务、依赖注入）
- 设计模式（如 MVC、观察者模式）
- 方法论（如 CI/CD、TDD、DevOps）
- 抽象术语（如并发、幂等性、缓存策略）

## 输出要求

请严格以 JSON 格式输出，不要添加其他文字：

\`\`\`json
{
  "entities": [
    {
      "name": "实体名称",
      "type": "tool",
      "description": "简要描述（1-2 句）",
      "relatedEntryIds": [条目ID列表]
    }
  ],
  "concepts": [
    {
      "name": "概念名称",
      "description": "简要描述（1-2 句）",
      "relatedEntryIds": [条目ID列表]
    }
  ]
}
\`\`\`

## Q&A 条目

${entryTexts}`;
}

/**
 * 截断文本到指定长度
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateText(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen) + '…';
}
