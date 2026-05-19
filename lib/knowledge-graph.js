/**
 * KnowledgeGraph — 知识图谱模块（向后兼容门面）
 * 拆分: layout / wiki / utils
 */
export { buildGraphData, forceDirectedLayout, applyZoomTransform, screenToWorld, computeMinimapViewport, filterGraphByTags, buildTooltipText, TAG_COLORS, MAX_NODES, DEFAULT_ITERATIONS } from './knowledge-graph-layout.js';
export { buildWikiGraphData, classifyEdgeType, NODE_SHAPES, EDGE_TYPES } from './knowledge-graph-wiki.js';
export { extractSubgraph, exportGraphToDataURL, importGraphData } from './knowledge-graph-utils.js';
