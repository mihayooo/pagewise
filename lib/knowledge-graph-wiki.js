/**
 * KnowledgeGraphWiki — Wiki 图谱数据构建
 * 从 knowledge-graph.js 拆分
 */

export const NODE_SHAPES = { CIRCLE: 'circle', SQUARE: 'square', DIAMOND: 'diamond' };
export const EDGE_TYPES = { REFERENCE: 'reference', RELATION: 'relation', CONTRADICTION: 'contradiction' };

import { TAG_COLORS } from './knowledge-graph-layout.js';

export function classifyEdgeType(sourceNode, targetNode, contradictions) {
  if (Array.isArray(contradictions) && contradictions.length > 0) {
    const srcEntryId = extractEntryId(sourceNode.id || '');
    const tgtEntryId = extractEntryId(targetNode.id || '');
    if (srcEntryId !== null && tgtEntryId !== null) {
      for (const c of contradictions) {
        if ((c.entryId1 === srcEntryId && c.entryId2 === tgtEntryId) || (c.entryId1 === tgtEntryId && c.entryId2 === srcEntryId)) {
          return EDGE_TYPES.CONTRADICTION;
        }
      }
    }
  }
  const srcType = sourceNode.nodeType || '', tgtType = targetNode.nodeType || '';
  const types = [srcType, tgtType];
  if ((types.includes('entity') && types.includes('qa')) || (types.includes('concept') && types.includes('qa'))) {
    return EDGE_TYPES.REFERENCE;
  }
  return EDGE_TYPES.RELATION;
}

function extractEntryId(pageId) {
  if (pageId === null || pageId === undefined) return null;
  if (typeof pageId === 'number') return pageId;
  if (typeof pageId !== 'string') return null;
  const match = pageId.match(/^qa:(\d+)$/);
  if (match) return parseInt(match[1], 10);
  if (/^\d+$/.test(pageId)) return parseInt(pageId, 10);
  return null;
}

export function buildWikiGraphData(options) {
  const { entries, entities, concepts, relations, contradictions, maxNodes = 100 } = options || {};

  const hasEntries = Array.isArray(entries) && entries.length > 0;
  const hasEntities = Array.isArray(entities) && entities.length > 0;
  const hasConcepts = Array.isArray(concepts) && concepts.length > 0;
  if (!hasEntries && !hasEntities && !hasConcepts) return { nodes: [], edges: [], tagColorMap: {} };

  const tagSet = new Set();
  const collectTags = (items) => { if (!Array.isArray(items)) return; for (const item of items) { for (const tag of (item.tags || [])) tagSet.add(tag); } };
  collectTags(entries); collectTags(entities); collectTags(concepts);

  const tagColorMap = {};
  let colorIdx = 0;
  for (const tag of tagSet) { tagColorMap[tag] = TAG_COLORS[colorIdx % TAG_COLORS.length]; colorIdx++; }

  const allNodes = [];

  if (hasEntities) {
    for (const entity of entities) {
      const tags = entity.tags || [];
      const primaryTag = tags[0] || entity.type || '实体';
      allNodes.push({
        id: `entity:${entity.name}`, label: entity.displayName || entity.name, group: primaryTag, tags,
        color: tagColorMap[primaryTag] || TAG_COLORS[0], size: 1, shape: NODE_SHAPES.CIRCLE,
        nodeType: 'entity', entry: { ...entity, type: entity.type || 'other' },
      });
    }
  }

  if (hasConcepts) {
    for (const concept of concepts) {
      const tags = concept.tags || [];
      const primaryTag = tags[0] || '概念';
      allNodes.push({
        id: `concept:${concept.name}`, label: concept.displayName || concept.name, group: primaryTag, tags,
        color: tagColorMap[primaryTag] || TAG_COLORS[1], size: 1, shape: NODE_SHAPES.SQUARE,
        nodeType: 'concept', entry: { ...concept },
      });
    }
  }

  if (hasEntries) {
    for (const entry of entries) {
      const tags = entry.tags || [];
      const primaryTag = tags[0] || entry.category || '未分类';
      allNodes.push({
        id: entry.id, label: entry.title || '未命名', group: primaryTag, tags,
        color: tagColorMap[primaryTag] || TAG_COLORS[0], size: 1, shape: NODE_SHAPES.DIAMOND,
        nodeType: 'qa', entry,
      });
    }
  }

  let nodes = allNodes;
  if (allNodes.length > maxNodes) {
    const relatedIds = new Set();
    if (Array.isArray(relations)) { for (const rel of relations) { relatedIds.add(String(rel.source)); relatedIds.add(String(rel.target)); } }
    const withRelation = allNodes.filter(n => relatedIds.has(String(n.id)));
    const withoutRelation = allNodes.filter(n => !relatedIds.has(String(n.id)));
    nodes = [...withRelation, ...withoutRelation].slice(0, maxNodes);
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const nodeById = {};
  for (const node of nodes) nodeById[node.id] = node;

  const edges = [];
  if (Array.isArray(relations)) {
    for (const rel of relations) {
      if (!nodeIds.has(rel.source) || !nodeIds.has(rel.target)) continue;
      const srcNode = nodeById[rel.source], tgtNode = nodeById[rel.target];
      const edgeType = classifyEdgeType(srcNode, tgtNode, contradictions);
      edges.push({
        source: rel.source, target: rel.target,
        weight: Math.max(0, Math.min(1, rel.weight || 0.5)),
        edgeType, label: edgeType === EDGE_TYPES.CONTRADICTION ? '矛盾' : '',
      });
    }
  }

  const connectionCount = {};
  for (const node of nodes) connectionCount[node.id] = 0;
  for (const edge of edges) { connectionCount[edge.source] = (connectionCount[edge.source] || 0) + 1; connectionCount[edge.target] = (connectionCount[edge.target] || 0) + 1; }
  for (const node of nodes) { node.size = 6 + Math.min((connectionCount[node.id] || 0) * 3, 20); }

  return { nodes, edges, tagColorMap };
}
