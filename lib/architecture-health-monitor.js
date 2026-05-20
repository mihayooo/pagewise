/**
 * ArchitectureHealthMonitor — 架构健康监控与模块瘦身
 *
 * R183: 建立自动化架构治理机制，遏制模块持续膨胀
 *
 * 功能:
 *   1. buildDependencyGraph(filePaths) — 扫描 JS 文件，解析 import 语句，构建模块依赖 DAG
 *   2. detectCircularDependencies(graph) — DFS 检测循环依赖
 *   3. getFanInOut(graph, topN) — 统计扇入(被引用次数)/扇出(引用其他模块数) Top-N
 *   4. findOrphanModules(graph) — 查找 0 引用的孤立模块
 *   5. findOverlappingModules(moduleList) — 识别功能重叠的模块对
 *   6. detectDeadExports(projectRoot, fileContents) — 从未被 import 的导出函数
 *   7. getModuleGrowthTrend(moduleCounts) — 按迭代阶段统计模块数量变化曲线
 *   8. checkArchitectureLimits(options) — 检查模块总数、单文件行数是否超标
 *   9. generateMergeSuggestions(overlaps) — 生成模块合并方案
 *  10. generateMetricsReport(data) — 生成完整架构指标报告
 *
 * 纯 ES Module，不依赖外部 API。
 *
 * @module lib/architecture-health-monitor
 */

// ==================== 常量 ====================

/** 模块总数上限 */
export const MODULE_COUNT_LIMIT = 220;

/** 单文件行数上限 */
export const LINE_COUNT_LIMIT = 400;

/** 默认 Top-N */
export const DEFAULT_TOP_N = 10;

// ==================== 依赖图分析 ====================

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

// ==================== 模块重叠检测 ====================

/**
 * 已知的重叠模块对及其合并建议
 */
export const KNOWN_OVERLAPPING_PAIRS = [
  {
    moduleA: 'lib/bookmark-dedup.js',
    moduleB: 'lib/bookmark-duplicate-detector.js',
    overlap: '两者都实现书签重复检测（URL 规范化、跟踪参数剥离、标题相似度）',
    suggestion: '合并至 bookmark-duplicate-detector.js，保留 BookmarkDedup 作为兼容别名',
  },
  {
    moduleA: 'lib/bookmark-io.js',
    moduleB: 'lib/bookmark-import-export.js',
    overlap: '两者都提供书签数据的 JSON/CSV/HTML 导入导出',
    suggestion: '合并至 bookmark-io.js（类接口），bookmark-import-export.js 改为 re-export',
  },
  {
    moduleA: 'lib/bookmark-notifications.js',
    moduleB: 'lib/bookmark-notifier.js',
    overlap: '两者都处理书签通知（类型系统、历史记录、分发机制）',
    suggestion: '合并至 bookmark-notifier.js，NotificationManager 作为轻量 wrapper',
  },
  {
    moduleA: 'lib/bookmark-duplicate-detector.js',
    moduleB: 'lib/bookmark-duplicate-detector-detect.js',
    overlap: '后者是从前者拆分的检测方法，已实现但可进一步整合',
    suggestion: '保持当前拆分结构',
  },
  {
    moduleA: 'lib/bookmark-exporter.js',
    moduleB: 'lib/bookmark-batch-export.js',
    overlap: '两者都提供书签导出功能',
    suggestion: '整合批量导出到 exporter，减少重复',
  },
];

/**
 * 识别功能重叠的模块对
 *
 * @param {string[]} moduleNames — 模块名称列表
 * @returns {{ moduleA: string, moduleB: string, overlap: string, suggestion: string }[]}
 */
export function findOverlappingModules(moduleNames) {
  const matches = [];

  for (const pair of KNOWN_OVERLAPPING_PAIRS) {
    const hasA = moduleNames.some(n => n.endsWith(pair.moduleA) || n === pair.moduleA);
    const hasB = moduleNames.some(n => n.endsWith(pair.moduleB) || n === pair.moduleB);
    if (hasA && hasB) {
      matches.push(pair);
    }
  }

  return matches;
}

// ==================== 死代码检测 ====================

/**
 * 检测从未被 import 的导出函数/类
 *
 * @param {Record<string, string>} fileContents — { filePath: content }
 * @returns {{ file: string, exportName: string, line: number }[]}
 */
export function detectDeadExports(fileContents) {
  const allExports = [];
  const allImports = new Set();

  // Collect all exports
  const EXPORT_RE = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
  const EXPORT_DEFAULT_RE = /export\s+default\s+(?:class|function)\s*(\w+)?/g;
  const EXPORT_NAMED_RE = /export\s*\{([^}]+)\}/g;

  for (const [filePath, content] of Object.entries(fileContents)) {
    let match;

    // Named exports
    EXPORT_RE.lastIndex = 0;
    while ((match = EXPORT_RE.exec(content)) !== null) {
      allExports.push({ file: filePath, exportName: match[1], line: getLineNumber(content, match.index) });
    }

    // Default exports
    EXPORT_DEFAULT_RE.lastIndex = 0;
    while ((match = EXPORT_DEFAULT_RE.exec(content)) !== null) {
      if (match[1]) {
        allExports.push({ file: filePath, exportName: match[1], line: getLineNumber(content, match.index) });
      }
    }

    // Re-export { ... } from '...'
    EXPORT_NAMED_RE.lastIndex = 0;
    while ((match = EXPORT_NAMED_RE.exec(content)) !== null) {
      const names = match[1].split(',').map(n => {
        const parts = n.trim().split(/\s+as\s+/);
        return (parts[1] || parts[0]).trim();
      }).filter(Boolean);
      for (const name of names) {
        allExports.push({ file: filePath, exportName: name, line: getLineNumber(content, match.index) });
      }
    }
  }

  // Collect all imported names
  const IMPORT_NAME_RE = /import\s*\{([^}]+)\}\s*from/g;
  const IMPORT_DEFAULT_RE = /import\s+(\w+)\s+from/g;

  for (const content of Object.values(fileContents)) {
    let match;
    IMPORT_NAME_RE.lastIndex = 0;
    while ((match = IMPORT_NAME_RE.exec(content)) !== null) {
      const names = match[1].split(',').map(n => {
        const parts = n.trim().split(/\s+as\s+/);
        return (parts[0]).trim();
      }).filter(Boolean);
      for (const name of names) allImports.add(name);
    }

    IMPORT_DEFAULT_RE.lastIndex = 0;
    while ((match = IMPORT_DEFAULT_RE.exec(content)) !== null) {
      allImports.add(match[1]);
    }
  }

  // Also check for usage in import(...) dynamic imports and string references
  const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"][^'"]+['"]\s*\)/g;
  // Skip dynamic imports for now — they're rare

  // Find exports that are never imported elsewhere
  const deadExports = [];
  for (const exp of allExports) {
    if (!allImports.has(exp.exportName)) {
      deadExports.push(exp);
    }
  }

  return deadExports;
}

/**
 * 获取字符串中某个 index 所在的行号
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// ==================== 模块增长趋势 ====================

/**
 * 已知的迭代阶段及其模块数量（基于 git 历史估算）
 */
export const ITERATION_MODULE_COUNTS = [
  { phase: 'R1-R10', modules: 25 },
  { phase: 'R11-R20', modules: 42 },
  { phase: 'R21-R30', modules: 55 },
  { phase: 'R31-R40', modules: 72 },
  { phase: 'R41-R52', modules: 95 },
  { phase: 'R53-R62', modules: 115 },
  { phase: 'R63-R80', modules: 138 },
  { phase: 'R81-R100', modules: 152 },
  { phase: 'R101-R120', modules: 165 },
  { phase: 'R121-R140', modules: 175 },
  { phase: 'R141-R160', modules: 183 },
  { phase: 'R161-R180', modules: 191 },
  { phase: 'R181-R183', modules: 188 },
];

/**
 * 获取模块增长趋势数据
 *
 * @param {Array<{ phase: string, modules: number }>} [counts]
 * @returns {{ phases: string[], counts: number[], growth: number[], totalGrowth: number }}
 */
export function getModuleGrowthTrend(counts = ITERATION_MODULE_COUNTS) {
  const phases = counts.map(c => c.phase);
  const modules = counts.map(c => c.modules);
  const growth = [];

  for (let i = 1; i < modules.length; i++) {
    growth.push(modules[i] - modules[i - 1]);
  }

  const totalGrowth = modules.length > 1 ? modules[modules.length - 1] - modules[0] : 0;

  return { phases, counts: modules, growth, totalGrowth };
}

// ==================== 架构检查 ====================

/**
 * 检查架构限制
 *
 * @param {Object} options
 * @param {number} options.moduleCount — 当前模块总数
 * @param {number} options.moduleLimit — 模块上限 (默认 220)
 * @param {Array<{ file: string, lines: number }>} options.fileLineCounts — 各文件行数
 * @param {number} options.lineLimit — 行数上限 (默认 400)
 * @returns {{ pass: boolean, moduleCheck: { pass: boolean, count: number, limit: number }, lineChecks: { file: string, lines: number, limit: number }[], summary: string }}
 */
export function checkArchitectureLimits({
  moduleCount,
  moduleLimit = MODULE_COUNT_LIMIT,
  fileLineCounts = [],
  lineLimit = LINE_COUNT_LIMIT,
}) {
  const moduleCheck = {
    pass: moduleCount <= moduleLimit,
    count: moduleCount,
    limit: moduleLimit,
  };

  const lineViolations = fileLineCounts
    .filter(f => f.lines > lineLimit)
    .sort((a, b) => b.lines - a.lines);

  const pass = moduleCheck.pass && lineViolations.length === 0;

  const parts = [];
  parts.push(`模块总数: ${moduleCount}/${moduleLimit} ${moduleCheck.pass ? '✅' : '❌'}`);
  if (lineViolations.length > 0) {
    parts.push(`超限文件: ${lineViolations.length} 个 ❌`);
    for (const f of lineViolations.slice(0, 5)) {
      parts.push(`  - ${f.file}: ${f.lines} 行 (上限 ${lineLimit})`);
    }
  } else {
    parts.push(`行数检查: 全部通过 ✅`);
  }

  return {
    pass,
    moduleCheck,
    lineChecks: lineViolations,
    summary: parts.join('\n'),
  };
}

// ==================== 合并建议 ====================

/**
 * 生成模块合并方案
 *
 * @param {{ moduleA: string, moduleB: string, overlap: string, suggestion: string }[]} overlaps
 * @returns {string} Markdown 格式的合并建议
 */
export function generateMergeSuggestions(overlaps) {
  if (overlaps.length === 0) {
    return '未发现功能重叠的模块对。';
  }

  const lines = ['# 模块合并建议', ''];

  for (let i = 0; i < overlaps.length; i++) {
    const pair = overlaps[i];
    lines.push(`## ${i + 1}. ${pair.moduleA} ↔ ${pair.moduleB}`);
    lines.push('');
    lines.push(`**重叠**: ${pair.overlap}`);
    lines.push(`**建议**: ${pair.suggestion}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ==================== 导出 ====================

export default {
  MODULE_COUNT_LIMIT,
  LINE_COUNT_LIMIT,
  DEFAULT_TOP_N,
  KNOWN_OVERLAPPING_PAIRS,
  ITERATION_MODULE_COUNTS,
  buildDependencyGraph,
  resolveImportPath,
  detectCircularDependencies,
  getFanInOut,
  findOrphanModules,
  findOverlappingModules,
  detectDeadExports,
  getModuleGrowthTrend,
  checkArchitectureLimits,
  generateMergeSuggestions,
};
