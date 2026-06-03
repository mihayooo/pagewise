/**
 * Entity Extractor — L1.2 实体/概念自动提取
 *
 * 从 Q&A 知识条目中使用 AI 自动识别和提取：
 *   - 实体: 人名、工具名、框架名、API、技术术语
 *   - 概念: 抽象概念、方法论、设计模式
 *
 * 生成独立的实体页和概念页 Markdown 文件（含 YAML frontmatter），
 * 用于 LLM Wiki 知识编译系统。
 *
 * R157: 提示词拆分至 entity-extractor-prompt.js
 *       Markdown 生成拆分至 entity-extractor-markdown.js
 *
 * @module entity-extractor
 */

import { buildExtractionPrompt } from './entity-extractor-prompt.js';

// Re-export sub-module APIs (API 向后兼容)
export { buildExtractionPrompt } from './entity-extractor-prompt.js';
export {
  generateEntityMarkdown,
  generateConceptMarkdown,
  buildEntityIndex,
  sanitizeFilename,
} from './entity-extractor-markdown.js';

// ==================== 常量 ====================

/** 支持的实体类型 */
export const ENTITY_TYPES = {
  PERSON: 'person',
  TOOL: 'tool',
  FRAMEWORK: 'framework',
  API: 'api',
  LANGUAGE: 'language',
  PLATFORM: 'platform',
  LIBRARY: 'library',
  SERVICE: 'service',
  OTHER: 'other',
};

// ==================== AI 响应解析 ====================

/**
 * 解析 AI 返回的实体/概念提取结果
 *
 * 支持直接 JSON 或 markdown 代码块包裹的 JSON。
 * 解析失败时返回空结构（不抛出异常）。
 *
 * @param {string} response - AI 返回的文本
 * @returns {{ entities: Array, concepts: Array }}
 */
export function parseExtractionResponse(response) {
  const empty = { entities: [], concepts: [] };

  if (!response || typeof response !== 'string') return empty;

  // 尝试提取 JSON（可能包裹在 markdown 代码块中）
  let jsonStr = response.trim();

  // 去除 markdown 代码块包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 尝试找到 JSON 对象
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    const entities = Array.isArray(parsed.entities)
      ? parsed.entities.map(normalizeEntity).filter(Boolean)
      : [];

    const concepts = Array.isArray(parsed.concepts)
      ? parsed.concepts.map(normalizeConcept).filter(Boolean)
      : [];

    return { entities, concepts };
  } catch (e) {
    console.warn('[EntityExtractor]', e?.message || e);
    // 解析失败，返回空结构
    return empty;
  }
}

/**
 * 规范化实体对象
 * @param {Object} raw
 * @returns {Object|null}
 */
function normalizeEntity(raw) {
  if (!raw || !raw.name) return null;
  return {
    name: String(raw.name).trim(),
    type: ENTITY_TYPES[raw.type?.toUpperCase()] || raw.type || ENTITY_TYPES.OTHER,
    description: String(raw.description || '').trim(),
    relatedEntryIds: Array.isArray(raw.relatedEntryIds)
      ? raw.relatedEntryIds.filter(id => typeof id === 'number')
      : [],
  };
}

/**
 * 规范化概念对象
 * @param {Object} raw
 * @returns {Object|null}
 */
function normalizeConcept(raw) {
  if (!raw || !raw.name) return null;
  return {
    name: String(raw.name).trim(),
    description: String(raw.description || '').trim(),
    relatedEntryIds: Array.isArray(raw.relatedEntryIds)
      ? raw.relatedEntryIds.filter(id => typeof id === 'number')
      : [],
  };
}

// ==================== 主提取流程 ====================

/**
 * 使用 AI 从 Q&A 条目中提取实体和概念
 *
 * @param {Array<Object>} entries - Q&A 知识条目
 * @param {Object} aiClient - AI 客户端（需实现 chat() 方法）
 * @param {Object} [options] - 可选配置
 * @param {number} [options.batchSize=10] - 每批处理条目数
 * @param {string} [options.model] - 指定 AI 模型
 * @returns {Promise<{ entities: Array, concepts: Array }>}
 */
export async function extractEntities(entries, aiClient, options = {}) {
  if (!entries || entries.length === 0) {
    return { entities: [], concepts: [] };
  }

  const batchSize = options.batchSize || 10;

  // 小批量直接处理
  if (entries.length <= batchSize) {
    return await extractBatch(entries, aiClient, options);
  }

  // 大批量分批处理，合并结果
  const allEntities = [];
  const allConcepts = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const result = await extractBatch(batch, aiClient, options);
    allEntities.push(...result.entities);
    allConcepts.push(...result.concepts);
  }

  // 去重合并（同名实体/概念合并 relatedEntryIds）
  return {
    entities: deduplicateByName(allEntities),
    concepts: deduplicateByName(allConcepts),
  };
}

/**
 * 提取单批条目的实体和概念
 * @param {Array} entries
 * @param {Object} aiClient
 * @param {Object} options
 * @returns {Promise<{ entities: Array, concepts: Array }>}
 */
async function extractBatch(entries, aiClient, options) {
  const prompt = buildExtractionPrompt(entries);

  const chatOptions = {};
  if (options.model) chatOptions.model = options.model;

  const response = await aiClient.chat(
    [{ role: 'user', content: prompt }],
    chatOptions,
  );

  return parseExtractionResponse(response.content || response);
}

/**
 * 按名称去重，合并 relatedEntryIds
 * @param {Array} items - 实体或概念数组
 * @returns {Array} 去重后的数组
 */
function deduplicateByName(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (map.has(key)) {
      const existing = map.get(key);
      // 合并 relatedEntryIds
      const mergedIds = new Set([
        ...existing.relatedEntryIds,
        ...item.relatedEntryIds,
      ]);
      existing.relatedEntryIds = [...mergedIds];
    } else {
      map.set(key, { ...item });
    }
  }
  return [...map.values()];
}

// (文件名清理/Markdown/索引生成已拆分至 entity-extractor-markdown.js)
