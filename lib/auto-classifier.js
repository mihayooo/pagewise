/**
 * Auto Classifier — L2.1 Q&A 自动分类
 *
 * 每次 AI 回答后，自动识别并标记涉及的实体/概念。
 * 面向「实时分类」：单条 Q&A 即时处理，非阻塞。
 *
 * 存储层已拆分至 auto-classifier-store.js。
 *
 * @module auto-classifier
 */

import { ENTITY_TYPES } from './entity-extractor.js';
import { AutoClassifierStore, CLASSIFICATION_STATUS } from './auto-classifier-store.js';

export { CLASSIFICATION_STATUS };

// ==================== AutoClassifier ====================

/**
 * Q&A 自动分类器
 *
 * @param {Object} aiClient — AI 客户端（需实现 chat(messages, options) 方法）
 */
export class AutoClassifier {
  constructor(aiClient) {
    this.aiClient = aiClient;
    this._store = new AutoClassifierStore();
    /** @deprecated 使用 _store.db */
    Object.defineProperty(this, 'db', {
      get() { return this._store.db; },
      set(v) { this._store.db = v; },
      configurable: true,
    });
  }

  // ==================== 初始化 ====================

  async _ensureInit() { return this._store.ensureInit(); }

  // ==================== 提示词构建 ====================

  _buildClassificationPrompt(entry) {
    const parts = [];
    if (entry.title) parts.push(`标题: ${entry.title}`);
    if (entry.question) parts.push(`问题: ${entry.question}`);
    if (entry.answer) parts.push(`回答: ${this._truncateText(entry.answer, 800)}`);
    if (entry.tags && entry.tags.length > 0) parts.push(`标签: ${entry.tags.join(', ')}`);
    const entryText = parts.join('\n');
    return `你是一个知识分析专家。请从以下 Q&A 条目中提取提到的**实体**和**概念**。

## 提取规则

### 实体 (entities)
识别以下类型的实体：
- **person**: 人名（如 Linus Torvalds）
- **tool**: 工具名（如 Docker, Git, Webpack）
- **framework**: 框架名（如 React, Spring, Django）
- **api**: API/协议名（如 REST API, GraphQL, WebSocket）
- **language**: 编程语言（如 JavaScript, Python）
- **platform**: 平台名（如 GitHub, AWS, Kubernetes）
- **library**: 库名（如 Lodash, Axios, NumPy）
- **service**: 服务名（如 GitHub Actions, Vercel）
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
      "description": "简要描述（1-2 句）"
    }
  ],
  "concepts": [
    {
      "name": "概念名称",
      "description": "简要描述（1-2 句）"
    }
  ]
}
\`\`\`

## Q&A 条目

${entryText}`;
  }

  _truncateText(text, maxLen) {
    if (!text || text.length <= maxLen) return text || '';
    return text.slice(0, maxLen) + '…';
  }

  // ==================== AI 响应解析 ====================

  _parseClassificationResponse(response) {
    const empty = { entities: [], concepts: [] };
    if (!response || typeof response !== 'string') return empty;
    let jsonStr = response.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      const entities = Array.isArray(parsed.entities) ? parsed.entities.map(this._normalizeEntity).filter(Boolean) : [];
      const concepts = Array.isArray(parsed.concepts) ? parsed.concepts.map(this._normalizeConcept).filter(Boolean) : [];
      return { entities, concepts };
    } catch (e) {
      console.warn('[AutoClassifier]', e?.message || e);
      return empty;
    }
  }

  _normalizeEntity(raw) {
    if (!raw || !raw.name) return null;
    return {
      name: String(raw.name).trim(),
      type: ENTITY_TYPES[raw.type?.toUpperCase()] || raw.type || ENTITY_TYPES.OTHER,
      description: String(raw.description || '').trim(),
    };
  }

  _normalizeConcept(raw) {
    if (!raw || !raw.name) return null;
    return {
      name: String(raw.name).trim(),
      description: String(raw.description || '').trim(),
    };
  }

  // ==================== 分类主流程 ====================

  async classifyEntry(entry, options = {}) {
    if (!entry || !entry.question) return { entities: [], concepts: [] };
    try {
      const prompt = this._buildClassificationPrompt(entry);
      const chatOptions = {};
      if (options.model) chatOptions.model = options.model;
      const response = await this.aiClient.chat([{ role: 'user', content: prompt }], chatOptions);
      return this._parseClassificationResponse(response.content || response);
    } catch (e) {
      console.warn('[AutoClassifier]', e?.message || e);
      return { entities: [], concepts: [] };
    }
  }

  async classifyBatch(entries, options = {}) {
    const results = new Map();
    if (!entries || entries.length === 0) return results;
    for (const entry of entries) {
      const result = await this.classifyEntry(entry, options);
      results.set(entry.id, result);
    }
    return results;
  }

  // ==================== 存储操作（委托到 Store） ====================

  async saveClassification(entryId, result) {
    await this._store.ensureInit();
    for (const entity of result.entities) {
      await this._store.findOrCreateEntity(entity.name, entity.type, entity.description, entryId);
    }
    for (const concept of result.concepts) {
      await this._store.findOrCreateConcept(concept.name, concept.description, entryId);
    }
    await this._store.updateClassificationStatus(entryId, CLASSIFICATION_STATUS.CLASSIFIED);
  }

  // ==================== 查询操作（委托到 Store） ====================

  async getEntitiesByEntry(entryId) { return this._store.getEntitiesByEntry(entryId); }
  async getConceptsByEntry(entryId) { return this._store.getConceptsByEntry(entryId); }
  async getEntriesByEntity(name) { return this._store.getEntriesByEntity(name); }
  async getEntriesByConcept(name) { return this._store.getEntriesByConcept(name); }
  async getAllEntities() { return this._store.getAllEntities(); }
  async getAllConcepts() { return this._store.getAllConcepts(); }
  async getClassificationStatus(entryId) { return this._store.getClassificationStatus(entryId); }

  async getStats() {
    await this._store.ensureInit();
    const entities = await this._store.getAllEntities();
    const concepts = await this._store.getAllConcepts();
    return { entityCount: entities.length, conceptCount: concepts.length };
  }

  // ==================== 批量操作 ====================

  async rebuildAll(entries, aiClient) {
    await this._store.ensureInit();
    const client = aiClient || this.aiClient;
    if (!entries || entries.length === 0) return;
    await this._store.clearAll();
    for (const entry of entries) {
      const temp = new AutoClassifier(client);
      temp._store = this._store;
      const result = await temp.classifyEntry(entry);
      if (result.entities.length > 0 || result.concepts.length > 0) {
        await this.saveClassification(entry.id, result);
      }
    }
  }
}
