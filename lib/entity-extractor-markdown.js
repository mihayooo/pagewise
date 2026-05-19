/**
 * EntityExtractor Markdown — Markdown/索引生成
 *
 * 从 entity-extractor.js 拆分：
 *   - generateEntityMarkdown — 实体页 Markdown
 *   - generateConceptMarkdown — 概念页 Markdown
 *   - buildEntityIndex — 索引 Markdown
 *   - sanitizeFilename — 文件名清理
 *   - escapeYamlString — YAML 转义
 *   - groupEntitiesByType — 实体按类型分组
 *
 * 纯 ES Module，无副作用。
 */

/** 实体类型中文映射 */
const ENTITY_TYPE_LABELS = {
  person: '人物',
  tool: '工具',
  framework: '框架',
  api: 'API',
  language: '编程语言',
  platform: '平台',
  library: '库',
  service: '服务',
  other: '其他',
};

/**
 * 清理文件名中的不安全字符
 * @param {string} name — 原始名称
 * @returns {string} 清理后的文件名
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unnamed';

  let cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s-]+|[\s-]+$/g, '');

  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100).replace(/-+$/, '');
  }

  return cleaned || 'unnamed';
}

/**
 * 生成实体页的 Markdown 内容
 * @param {Object} entity — 实体对象
 * @returns {string} Markdown 内容
 */
export function generateEntityMarkdown(entity) {
  const typeLabel = ENTITY_TYPE_LABELS[entity.type] || entity.type || '其他';

  const lines = [];

  lines.push('---');
  lines.push(`title: "${escapeYamlString(entity.name)}"`);
  lines.push(`type: entity`);
  lines.push(`entity_type: "${escapeYamlString(entity.type || 'other')}"`);
  lines.push(`created: "${new Date().toISOString()}"`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${entity.name}`);
  lines.push('');
  lines.push(`> **类型**: ${typeLabel}`);
  lines.push('');
  lines.push('## 概述');
  lines.push('');
  lines.push(entity.description || '暂无描述。');
  lines.push('');

  if (entity.relatedEntries && entity.relatedEntries.length > 0) {
    lines.push('## 相关问答');
    lines.push('');
    for (const entry of entity.relatedEntries) {
      lines.push(`- [${entry.title || `条目 #${entry.id}`}](../entries/${sanitizeFilename(entry.title || String(entry.id))}.md)`);
    }
    lines.push('');
  }

  if (entity.relatedEntities && entity.relatedEntities.length > 0) {
    lines.push('## 关联实体');
    lines.push('');
    for (const related of entity.relatedEntities) {
      lines.push(`- [[${related}]]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 生成概念页的 Markdown 内容
 * @param {Object} concept — 概念对象
 * @returns {string} Markdown 内容
 */
export function generateConceptMarkdown(concept) {
  const lines = [];

  lines.push('---');
  lines.push(`title: "${escapeYamlString(concept.name)}"`);
  lines.push(`type: concept`);
  lines.push(`created: "${new Date().toISOString()}"`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${concept.name}`);
  lines.push('');
  lines.push('## 概述');
  lines.push('');
  lines.push(concept.description || '暂无描述。');
  lines.push('');

  if (concept.relatedEntries && concept.relatedEntries.length > 0) {
    lines.push('## 相关问答');
    lines.push('');
    for (const entry of concept.relatedEntries) {
      lines.push(`- [${entry.title || `条目 #${entry.id}`}](../entries/${sanitizeFilename(entry.title || String(entry.id))}.md)`);
    }
    lines.push('');
  }

  if (concept.relatedEntities && concept.relatedEntities.length > 0) {
    lines.push('## 关联技术');
    lines.push('');
    for (const related of concept.relatedEntities) {
      lines.push(`- [[${related}]]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 生成实体/概念的索引 Markdown
 * @param {Array} entities — 实体列表
 * @param {Array} concepts — 概念列表
 * @returns {string} 索引 Markdown 内容
 */
export function buildEntityIndex(entities, concepts) {
  const lines = [];

  lines.push('# 实体与概念索引');
  lines.push('');
  lines.push(`> 自动生成于 ${new Date().toISOString()}`);
  lines.push(`> 实体: ${entities.length} 个 | 概念: ${concepts.length} 个`);
  lines.push('');

  if (entities.length > 0) {
    lines.push('## 实体');
    lines.push('');

    const grouped = groupEntitiesByType(entities);
    for (const [type, items] of Object.entries(grouped)) {
      const typeLabel = ENTITY_TYPE_LABELS[type] || type;
      lines.push(`### ${typeLabel}`);
      lines.push('');
      for (const entity of items) {
        const link = `entities/${sanitizeFilename(entity.name)}.md`;
        lines.push(`- [${entity.name}](${link}) — ${entity.description || '无描述'} ` +
          `(${entity.relatedEntryIds?.length || 0} 条相关问答)`);
      }
      lines.push('');
    }
  }

  if (concepts.length > 0) {
    lines.push('## 概念');
    lines.push('');
    for (const concept of concepts) {
      const link = `concepts/${sanitizeFilename(concept.name)}.md`;
      lines.push(`- [${concept.name}](${link}) — ${concept.description || '无描述'} ` +
        `(${concept.relatedEntryIds?.length || 0} 条相关问答)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 将实体按类型分组
 * @param {Array} entities
 * @returns {Object} { type: [entity, ...] }
 */
function groupEntitiesByType(entities) {
  const groups = {};
  for (const entity of entities) {
    const type = entity.type || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(entity);
  }
  return groups;
}

/**
 * 转义 YAML 字符串中的特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeYamlString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}
