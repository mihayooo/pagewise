/**
 * KnowledgeGraphLayout — 图数据构建与力导向布局
 * 从 knowledge-graph.js 拆分
 */

export const MAX_NODES = 100;
/**
 * 力导向布局默认迭代次数
 */
export const DEFAULT_ITERATIONS = 50;

/**
 * 标签颜色方案（15 色）
 */
export const TAG_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
  '#a855f7', '#0ea5e9', '#e11d48', '#22c55e', '#eab308',
];

/**
 * @param {Array} entries - 知识条目
 * * @param {Array} relations - 关系列表
 * * @param {number} [maxNodes=100] - 最大节点数
 * * @returns {{nodes: Array, edges: Array, tagColorMap: object}}
 */
export function buildGraphData(entries, relations, maxNodes = MAX_NODES) {
  if (!entries || !Array.isArray(entries)) return { nodes: [], edges: [], tagColorMap: {} };

  const tagSet = new Set();
  for (const entry of entries) { for (const tag of (entry.tags || [])) tagSet.add(tag); }
  const tagColorMap = {};
  let colorIdx = 0;
  for (const tag of tagSet) { tagColorMap[tag] = TAG_COLORS[colorIdx % TAG_COLORS.length]; colorIdx++; }

  let limitedEntries = entries;
  if (entries.length > maxNodes) {
    const relatedIds = new Set();
    if (relations && Array.isArray(relations)) { for (const rel of relations) { relatedIds.add(rel.source); relatedIds.add(rel.target); } }
    const withRelation = entries.filter(e => relatedIds.has(e.id));
    const withoutRelation = entries.filter(e => !relatedIds.has(e.id));
    limitedEntries = [...withRelation, ...withoutRelation].slice(0, maxNodes);
  }

  const nodeIds = new Set(limitedEntries.map(e => e.id));
  const nodes = limitedEntries.map(entry => {
    const tags = entry.tags || [];
    const primaryTag = tags[0] || entry.category || '未分类';
    return { id: entry.id, label: entry.title || '未命名', group: primaryTag, tags, color: tagColorMap[primaryTag] || TAG_COLORS[0], size: 1, entry };
  });

  const edges = [];
  if (relations && Array.isArray(relations)) {
    for (const rel of relations) {
      if (nodeIds.has(rel.source) && nodeIds.has(rel.target)) {
        edges.push({ source: rel.source, target: rel.target, weight: Math.max(0, Math.min(1, rel.weight || 0.5)) });
      }
    }
  }

  const connectionCount = {};
  for (const node of nodes) connectionCount[node.id] = 0;
  for (const edge of edges) { connectionCount[edge.source] = (connectionCount[edge.source] || 0) + 1; connectionCount[edge.target] = (connectionCount[edge.target] || 0) + 1; }
  for (const node of nodes) { node.size = 6 + Math.min((connectionCount[node.id] || 0) * 3, 20); }

  return { nodes, edges, tagColorMap };
}

/**
 * @param {Array} nodes - 节点数组
 * * @param {Array} edges - 边数组
 * * @param {number} [iterations=50] - 迭代次数
 * * @param {object} [options] - 布局选项
 * * @returns {Array} 更新后的节点
 */
export function forceDirectedLayout(nodes, edges, iterations = DEFAULT_ITERATIONS, options = {}) {
  const width = options.width || 600, height = options.height || 400;
  const centerX = width / 2, centerY = height / 2;
  if (!nodes || nodes.length === 0) return nodes || [];

  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    if (nodes[i].x !== undefined && nodes[i].y !== undefined) continue;
    const angle = (2 * Math.PI * i) / n, radius = Math.min(width, height) * 0.3;
    nodes[i].x = centerX + radius * Math.cos(angle);
    nodes[i].y = centerY + radius * Math.sin(angle);
    nodes[i].vx = 0; nodes[i].vy = 0;
  }

  const adjacency = {};
  for (const node of nodes) adjacency[node.id] = [];
  for (const edge of edges) { if (adjacency[edge.source] && adjacency[edge.target]) { adjacency[edge.source].push(edge); adjacency[edge.target].push(edge); } }

  const repulsionStrength = 3000, attractionStrength = 0.01, damping = 0.85, minDist = 30;
  const idToIdx = {};
  for (let i = 0; i < n; i++) idToIdx[nodes[i].id] = i;

  for (let iter = 0; iter < iterations; iter++) {
    const temperature = 1 - iter / iterations;
    for (let i = 0; i < n; i++) { nodes[i].fx = 0; nodes[i].fy = 0; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) dist = minDist;
        const force = repulsionStrength / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        nodes[i].fx -= fx; nodes[i].fy -= fy; nodes[j].fx += fx; nodes[j].fy += fy;
      }
    }
    for (const edge of edges) {
      const si = idToIdx[edge.source], ti = idToIdx[edge.target];
      if (si === undefined || ti === undefined) continue;
      const dx = nodes[ti].x - nodes[si].x, dy = nodes[ti].y - nodes[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const force = attractionStrength * dist * (edge.weight || 0.5);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      nodes[si].fx += fx; nodes[si].fy += fy; nodes[ti].fx -= fx; nodes[ti].fy -= fy;
    }
    for (let i = 0; i < n; i++) {
      nodes[i].vx = (nodes[i].vx + nodes[i].fx) * damping;
      nodes[i].vy = (nodes[i].vy + nodes[i].fy) * damping;
      const speed = Math.sqrt(nodes[i].vx * nodes[i].vx + nodes[i].vy * nodes[i].vy);
      const maxSpeed = 10 * temperature + 1;
      if (speed > maxSpeed) { nodes[i].vx = (nodes[i].vx / speed) * maxSpeed; nodes[i].vy = (nodes[i].vy / speed) * maxSpeed; }
      nodes[i].x += nodes[i].vx; nodes[i].y += nodes[i].vy;
      const padding = 40;
      if (nodes[i].x < padding) nodes[i].x = padding;
      if (nodes[i].x > width - padding) nodes[i].x = width - padding;
      if (nodes[i].y < padding) nodes[i].y = padding;
      if (nodes[i].y > height - padding) nodes[i].y = height - padding;
    }
  }
  for (const node of nodes) { delete node.vx; delete node.vy; delete node.fx; delete node.fy; }
  return nodes;
}

/**
 * @param {Array} nodes - 节点数组
 * * @param {number} scale - 缩放因子
 * * @param {{x: number, y: number}} offset - 偏移量
 * * @returns {Array} 变换后的节点
 */
export function applyZoomTransform(nodes, transform) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) return [];
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform || {};
  return nodes.map(node => ({ ...node, x: node.x * scale + offsetX, y: node.y * scale + offsetY }));
}

/**
 * @param {number} sx - 屏幕 X 坐标
 * @param {number} sy - 屏幕 Y 坐标
 * @param {object} transform - 变换参数 { scale, offsetX, offsetY }
 * @returns {{x: number, y: number}} 世界坐标
 */
export function screenToWorld(sx, sy, transform) {
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform || {};
  if (scale === 0) return { x: sx, y: sy };
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
}

/**
 * @param {number} canvasW - 画布宽度
 * @param {number} canvasH - 画布高度
 * @param {object} transform - 变换参数
 * @param {number} worldW - 世界宽度
 * @param {number} worldH - 世界高度
 * @param {number} minimapW - 小地图宽度
 * @param {number} minimapH - 小地图高度
 * @returns {{x: number, y: number, w: number, h: number}} 视口矩形
 */
export function computeMinimapViewport(canvasW, canvasH, transform, worldW, worldH, minimapW, minimapH) {
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform || {};
  const mmScaleX = minimapW / worldW, mmScaleY = minimapH / worldH;
  const mmScale = Math.min(mmScaleX, mmScaleY);
  const worldLeft = (-offsetX / scale) || 0, worldTop = (-offsetY / scale) || 0;
  const viewportWorldW = canvasW / scale, viewportWorldH = canvasH / scale;
  let x = worldLeft * mmScale || 0, y = worldTop * mmScale || 0;
  let w = viewportWorldW * mmScale, h = viewportWorldH * mmScale;
  const minX = -w, minY = -h, maxX = minimapW, maxY = minimapH;
  if (x < minX) x = minX; if (y < minY) y = minY; if (x > maxX) x = maxX; if (y > maxY) y = maxY;
  w = Math.max(w, 4); h = Math.max(h, 4);
  return { x, y, w, h };
}

/**
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @param {Set|null} activeTags - 活跃标签集合
 * @returns {{visibleNodes: Array, visibleEdges: Array, hiddenCount: number}}
 */
export function filterGraphByTags(nodes, edges, activeTags) {
  if (!nodes || nodes.length === 0) return { visibleNodes: [], visibleEdges: [], hiddenCount: 0 };
  if (activeTags === null || activeTags === undefined) return { visibleNodes: [...nodes], visibleEdges: [...edges], hiddenCount: 0 };
  if (activeTags.size === 0) return { visibleNodes: [], visibleEdges: [], hiddenCount: nodes.length };
  const visibleNodes = nodes.filter(n => activeTags.has(n.group));
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
  return { visibleNodes, visibleEdges, hiddenCount: nodes.length - visibleNodes.length };
}

/**
 * @param {object} node - 节点对象
 * @param {Array} edges - 边数组
 * @param {object} _nodeMap - 节点映射（预留）
 * @returns {string} 工具提示文本
 */
export function buildTooltipText(node, edges, _nodeMap) {
  const lines = [];
  lines.push(node.label || '未命名');
  if (node.group) lines.push(`🏷️ ${node.group}`);
  let connectionCount = 0;
  if (edges && edges.length > 0) { for (const edge of edges) { if (edge.source === node.id || edge.target === node.id) connectionCount++; } }
  lines.push(`🔗 ${connectionCount} 个关联`);
  if (node.entry && node.entry.content) {
    const preview = node.entry.content.substring(0, 80);
    const suffix = node.entry.content.length > 80 ? '...' : '';
    lines.push(`📝 ${preview}${suffix}`);
  }
  return lines.join('\n');
}
