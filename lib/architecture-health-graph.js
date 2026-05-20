/**
 * ArchitectureHealthGraph — 依赖图分析
 *
 * R203: 从 architecture-health-monitor.js 拆分
 * 包含: buildDependencyGraph / resolveImportPath / detectCircularDependencies
 *       getFanInOut / findOrphanModules
 *
 * @module lib/architecture-health-graph
 */

/** 默认 Top-N */
export const DEFAULT_TOP_N = 10;

/**
 * 从文件内容映射构建依赖图
 *
 * @param {Record<string, string>} fileContents — { filePath: content }
 * @returns {{ nodes: string[], edges: Map<string, string[]>, reverseEdges: Map<string, string[]> }}
 */
export function buildDependencyGraph(fileContents) {
  const nodes = [];
  /** @type {Map<string, string[]>} filePath → imported paths */
  const edges = new Map();
  /** @type {Map<string, string[]>} filePath → files that import it */
  const reverseEdges = new Map();

  // Import regex: match `from './xxx.js'` and `import './xxx.js'`
  const IMPORT_RE = /(?:from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"])/g;

  for (const [filePath, content] of Object.entries(fileContents)) {
    nodes.push(filePath);
    if (!edges.has(filePath)) edges.set(filePath, []);
    if (!reverseEdges.has(filePath)) reverseEdges.set(filePath, []);

    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      if (!importPath) continue;

      // Resolve relative import to a normalized key
      const resolved = resolveImportPath(filePath, importPath);
      if (resolved) {
        edges.get(filePath).push(resolved);
        if (!reverseEdges.has(resolved)) reverseEdges.set(resolved, []);
        reverseEdges.get(resolved).push(filePath);
      }
    }
  }

  // Ensure all imported nodes are in the graph
  for (const target of edges.values()) {
    for (const t of target) {
      if (!nodes.includes(t)) nodes.push(t);
    }
  }

  return { nodes, edges, reverseEdges };
}

/**
 * 解析相对导入路径
 *
 * @param {string} fromFile — 当前文件路径
 * @param {string} importPath — 导入路径（相对）
 * @returns {string} 标准化路径
 */
export function resolveImportPath(fromFile, importPath) {
  if (!fromFile || !importPath) return importPath || '';

  // Get directory of the importing file
  const dir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/')) : '';

  // Handle relative path
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const parts = [...dir.split('/').filter(Boolean), ...importPath.split('/').filter(Boolean)];
    const resolved = [];
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return resolved.join('/');
  }

  return importPath;
}

/**
 * 检测循环依赖 — 使用 DFS 着色法
 *
 * @param {{ edges: Map<string, string[]> }} graph
 * @returns {string[][]} — 每条路径是一个循环依赖链
 */
export function detectCircularDependencies(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cycles = [];

  for (const node of graph.edges.keys()) {
    color.set(node, WHITE);
  }

  function dfs(node, path) {
    color.set(node, GRAY);

    const neighbors = graph.edges.get(node) || [];
    for (const neighbor of neighbors) {
      if (!color.has(neighbor)) {
        color.set(neighbor, WHITE);
      }
      const c = color.get(neighbor);
      if (c === GRAY) {
        // Found a cycle — extract it from path
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      } else if (c === WHITE) {
        dfs(neighbor, [...path, neighbor]);
      }
    }

    color.set(node, BLACK);
  }

  for (const node of graph.edges.keys()) {
    if (color.get(node) === WHITE) {
      dfs(node, [node]);
    }
  }

  return cycles;
}

/**
 * 计算扇入/扇出 Top-N
 *
 * @param {{ edges: Map<string, string[]>, reverseEdges: Map<string, string[]> }} graph
 * @param {number} [topN=10]
 * @returns {{ fanIn: { module: string, count: number }[], fanOut: { module: string, count: number }[] }}
 */
export function getFanInOut(graph, topN = DEFAULT_TOP_N) {
  const fanIn = [];
  const fanOut = [];

  for (const [mod, imports] of graph.reverseEdges.entries()) {
    fanIn.push({ module: mod, count: imports.length });
  }

  for (const [mod, deps] of graph.edges.entries()) {
    fanOut.push({ module: mod, count: deps.length });
  }

  fanIn.sort((a, b) => b.count - a.count);
  fanOut.sort((a, b) => b.count - a.count);

  return {
    fanIn: fanIn.slice(0, topN),
    fanOut: fanOut.slice(0, topN),
  };
}

/**
 * 查找孤立模块（0 引用）
 *
 * @param {{ nodes: string[], reverseEdges: Map<string, string[]> }} graph
 * @param {Set<string>} [entryPoints] — 入口文件集合（不算孤立）
 * @returns {string[]}
 */
export function findOrphanModules(graph, entryPoints = new Set()) {
  const orphans = [];
  for (const node of graph.nodes) {
    if (entryPoints.has(node)) continue;
    const reverseDeps = graph.reverseEdges.get(node) || [];
    if (reverseDeps.length === 0) {
      orphans.push(node);
    }
  }
  return orphans;
}
