/**
 * KnowledgeGraphUtils — 图谱工具函数
 * 从 knowledge-graph.js 拆分: 子图提取、导出、导入/去重/合并
 */

import { TAG_COLORS } from './knowledge-graph-layout.js';

export function extractSubgraph(nodes, edges, nodeId, depth = 1) {
  if (!Array.isArray(nodes) || nodes.length === 0) return { nodes: [], edges: [] };
  if (!Array.isArray(edges)) return { nodes: [], edges: [] };
  const maxDepth = Math.min(Math.max(1, depth || 1), 5);
  const adjacency = {};
  for (const node of nodes) adjacency[node.id] = [];
  for (const edge of edges) {
    if (adjacency[edge.source] && adjacency[edge.target]) {
      adjacency[edge.source].push(edge.target); adjacency[edge.target].push(edge.source);
    }
  }
  if (!adjacency[nodeId]) return { nodes: [], edges: [] };

  const visited = new Set(); visited.add(nodeId);
  let frontier = [nodeId];
  for (let d = 0; d < maxDepth; d++) {
    const nextFrontier = [];
    for (const current of frontier) {
      for (const neighbor of (adjacency[current] || [])) {
        if (!visited.has(neighbor)) { visited.add(neighbor); nextFrontier.push(neighbor); }
      }
    }
    frontier = nextFrontier;
  }

  const nodeMap = {};
  for (const node of nodes) nodeMap[node.id] = node;
  const subgraphNodes = [];
  for (const id of visited) { if (nodeMap[id]) subgraphNodes.push(nodeMap[id]); }
  const subgraphEdges = edges.filter(e => visited.has(e.source) && visited.has(e.target));
  return { nodes: subgraphNodes, edges: subgraphEdges };
}

export function exportGraphToDataURL(canvas, type, quality) {
  if (!canvas || typeof canvas.toDataURL !== 'function') return null;
  const mimeType = type || 'image/png';
  return quality !== undefined ? canvas.toDataURL(mimeType, quality) : canvas.toDataURL(mimeType);
}

// ==================== 导入 / 去重 / 合并 ====================

function _normalizeEntityName(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function _normalizeEntityType(type) { return String(type || 'other').trim().toLowerCase(); }
function _entityKey(entity) {
  const name = _normalizeEntityName(entity.name || entity.label || entity.displayName || '');
  const type = _normalizeEntityType(entity.type || entity.nodeType || entity.group || '');
  return `${type}::${name}`;
}
function _edgeKey(edge) { return `${String(edge.source)}→${String(edge.target)}::${edge.edgeType || edge.type || 'relation'}`; }
function _remoteEdgeKey(relation) { return `${String(relation.source)}→${String(relation.target)}::${relation.type || 'relation'}`; }
function findExistingEdgeIndex(localEdges, remoteRelation) {
  const rSrc = String(remoteRelation.source), rTgt = String(remoteRelation.target), rType = remoteRelation.type || 'relation';
  for (let i = 0; i < localEdges.length; i++) {
    const e = localEdges[i];
    const eSrc = String(e.source), eTgt = String(e.target), eType = e.edgeType || e.type || 'relation';
    if (eType === rType && ((eSrc === rSrc && eTgt === rTgt) || (eSrc === rTgt && eTgt === rSrc))) return i;
  }
  return -1;
}
function generateLocalNodeId(name, type) { return `imported:${_normalizeEntityType(type)}:${_normalizeEntityName(name)}`; }

export function importGraphData(localGraph, remoteGraphData, options = {}) {
  const strategy = options.conflictStrategy || 'local_wins';
  const localNodes = (localGraph && localGraph.nodes) ? [...localGraph.nodes] : [];
  const localEdges = (localGraph && localGraph.edges) ? [...localGraph.edges] : [];

  let remoteEntities = [], remoteRelations = [];
  if (remoteGraphData) {
    if (Array.isArray(remoteGraphData.entities)) {
      remoteEntities = remoteGraphData.entities; remoteRelations = remoteGraphData.relations || [];
    } else if (Array.isArray(remoteGraphData.nodes)) {
      remoteEntities = remoteGraphData.nodes.map(node => ({
        id: node.id, name: node.label || node.name || '', type: node.nodeType || node.group || 'other',
        properties: node.entry || node.properties || {},
      }));
      remoteRelations = (remoteGraphData.edges || []).map(edge => ({
        source: String(edge.source), target: String(edge.target), type: edge.edgeType || edge.type || 'relation', weight: edge.weight || 0.5,
      }));
    }
  }

  const localByKey = {}, localIdByKey = {};
  for (let i = 0; i < localNodes.length; i++) {
    const key = _entityKey(localNodes[i]);
    localByKey[key] = localNodes[i]; localIdByKey[key] = String(localNodes[i].id);
  }

  let added = 0, updated = 0, skipped = 0;

  for (const remoteEntity of remoteEntities) {
    const key = _entityKey(remoteEntity);
    if (localByKey[key]) {
      const localNode = localByKey[key];
      if (strategy === 'skip') { skipped++; continue; }
      if (strategy === 'remote_wins') {
        const props = remoteEntity.properties || {};
        for (const [k, v] of Object.entries(props)) {
          if (v !== undefined && v !== null) { localNode.entry = localNode.entry || {}; if (localNode.entry[k] === undefined || localNode.entry[k] === null) localNode.entry[k] = v; }
        }
        updated++; continue;
      }
      const remoteProps = remoteEntity.properties || {};
      let hasNewProps = false;
      for (const [k, v] of Object.entries(remoteProps)) {
        if (v !== undefined && v !== null) { localNode.entry = localNode.entry || {}; if (localNode.entry[k] === undefined || localNode.entry[k] === null) { localNode.entry[k] = v; hasNewProps = true; } }
      }
      if (hasNewProps) updated++; else skipped++;
    } else {
      const remoteId = remoteEntity.id || generateLocalNodeId(remoteEntity.name, remoteEntity.type);
      localNodes.push({
        id: remoteId, label: remoteEntity.name || remoteEntity.displayName || '未命名',
        group: remoteEntity.type || 'other', tags: (remoteEntity.properties && remoteEntity.properties.tags) || [],
        color: TAG_COLORS[added % TAG_COLORS.length], size: 1, nodeType: remoteEntity.type || 'other',
        entry: { ...(remoteEntity.properties || {}), type: remoteEntity.type || 'other' },
      });
      localByKey[key] = localNodes[localNodes.length - 1]; localIdByKey[key] = String(remoteId); added++;
    }
  }

  const edgeKeySet = new Set();
  for (const edge of localEdges) edgeKeySet.add(_edgeKey(edge));

  for (const remoteRelation of remoteRelations) {
    const eKey = _remoteEdgeKey(remoteRelation);
    const existingIdx = findExistingEdgeIndex(localEdges, remoteRelation);
    if (existingIdx >= 0) {
      const existing = localEdges[existingIdx];
      if ((remoteRelation.weight || 0.5) > (existing.weight || 0.5)) existing.weight = remoteRelation.weight;
    } else if (!edgeKeySet.has(eKey)) {
      const srcExists = localNodes.some(n => String(n.id) === String(remoteRelation.source));
      const tgtExists = localNodes.some(n => String(n.id) === String(remoteRelation.target));
      if (srcExists && tgtExists) {
        localEdges.push({ source: remoteRelation.source, target: remoteRelation.target, weight: Math.max(0, Math.min(1, remoteRelation.weight || 0.5)), edgeType: remoteRelation.type || 'relation' });
        edgeKeySet.add(eKey);
      }
    }
  }

  return { mergedNodes: localNodes, mergedEdges: localEdges, added, updated, skipped };
}
