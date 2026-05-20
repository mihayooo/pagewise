/**
 * ArchitectureHealthMonitor — 架构健康监控与模块瘦身
 *
 * R183: 建立自动化架构治理机制，遏制模块持续膨胀
 * R203: 依赖图分析 → architecture-health-graph.js
 *
 * @module lib/architecture-health-monitor
 */

import {
  buildDependencyGraph, resolveImportPath, detectCircularDependencies,
  getFanInOut, findOrphanModules, DEFAULT_TOP_N,
} from './architecture-health-graph.js';
import { detectDeadExports } from './architecture-health-deadcode.js';

// Re-export for backward compatibility
export { buildDependencyGraph, resolveImportPath, detectCircularDependencies, getFanInOut, findOrphanModules, DEFAULT_TOP_N };
export { detectDeadExports };

// ==================== 常量 ====================

/** 模块总数上限 */
export const MODULE_COUNT_LIMIT = 220;

/** 单文件行数上限 */
export const LINE_COUNT_LIMIT = 400;

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
    if (hasA && hasB) matches.push(pair);
  }
  return matches;
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
 */
export function checkArchitectureLimits({
  moduleCount,
  moduleLimit = MODULE_COUNT_LIMIT,
  fileLineCounts = [],
  lineLimit = LINE_COUNT_LIMIT,
}) {
  const moduleCheck = { pass: moduleCount <= moduleLimit, count: moduleCount, limit: moduleLimit };
  const lineViolations = fileLineCounts.filter(f => f.lines > lineLimit).sort((a, b) => b.lines - a.lines);
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
  return { pass, moduleCheck, lineChecks: lineViolations, summary: parts.join('\n') };
}

// ==================== 合并建议 ====================

/**
 * 生成模块合并方案
 *
 * @param {{ moduleA: string, moduleB: string, overlap: string, suggestion: string }[]} overlaps
 * @returns {string} Markdown 格式的合并建议
 */
export function generateMergeSuggestions(overlaps) {
  if (overlaps.length === 0) return '未发现功能重叠的模块对。';
  const lines = ['# 模块合并建议', ''];
  for (let i = 0; i < overlaps.length; i++) {
    const pair = overlaps[i];
    lines.push(`## ${i + 1}. ${pair.moduleA} ↔ ${pair.moduleB}`, '');
    lines.push(`**重叠**: ${pair.overlap}`, `**建议**: ${pair.suggestion}`, '');
  }
  return lines.join('\n');
}

// ==================== 导出 ====================

export default {
  MODULE_COUNT_LIMIT, LINE_COUNT_LIMIT, DEFAULT_TOP_N,
  KNOWN_OVERLAPPING_PAIRS, ITERATION_MODULE_COUNTS,
  buildDependencyGraph, resolveImportPath, detectCircularDependencies,
  getFanInOut, findOrphanModules, findOverlappingModules,
  detectDeadExports, getModuleGrowthTrend, checkArchitectureLimits, generateMergeSuggestions,
};
