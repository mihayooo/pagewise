/**
 * ArchitectureHealthReport — 架构健康报告生成
 *
 * R183: 从 architecture-health-monitor.js 拆分
 * 报告生成、合并建议、模块增长趋势
 *
 * @module lib/architecture-health-report
 */

import { getModuleGrowthTrend, findOverlappingModules, generateMergeSuggestions } from './architecture-health-monitor.js';

/** 模块总数上限 */
const MODULE_COUNT_LIMIT = 220;
/** 单文件行数上限 */
const LINE_COUNT_LIMIT = 400;

/**
 * 已知的迭代阶段及其模块数量（基于 git 历史估算）
 */
export const ITERATION_MODULE_COUNTS = [
  { phase: 'R1-R10 (基础迭代)', modules: 25 },
  { phase: 'R11-R20 (学习模式)', modules: 42 },
  { phase: 'R21-R30 (图谱增强)', modules: 55 },
  { phase: 'R31-R40 (UI 拆分)', modules: 72 },
  { phase: 'R41-R52 (BookmarkGraph MVP)', modules: 95 },
  { phase: 'R53-R62 (BookmarkGraph V1)', modules: 115 },
  { phase: 'R63-R80 (知识库+分享)', modules: 138 },
  { phase: 'R81-R100 (AI 增强)', modules: 152 },
  { phase: 'R101-R120 (模块拆分一期)', modules: 165 },
  { phase: 'R121-R140 (模块拆分二期)', modules: 175 },
  { phase: 'R141-R160 (覆盖率提升)', modules: 183 },
  { phase: 'R161-R180 (学习旅程+隐私)', modules: 191 },
  { phase: 'R181-R183 (架构治理)', modules: 188 },
];

/**
 * 生成完整的架构指标报告
 *
 * @param {Object} data
 * @param {number} data.moduleCount
 * @param {Array<{ file: string, lines: number }>} data.fileLineCounts
 * @param {{ fanIn: Array, fanOut: Array }} data.fanData
 * @param {string[][]} data.cycles
 * @param {string[]} data.orphans
 * @param {{ file: string, exportName: string, line: number }[]} data.deadExports
 * @returns {string} Markdown 格式报告
 */
export function generateMetricsReport(data) {
  const lines = [
    '# 架构健康指标报告',
    '',
    `> 生成时间: ${new Date().toISOString()}`,
    '',
    '## 📊 模块概览',
    '',
    `- 总模块数: **${data.moduleCount}** (上限 ${MODULE_COUNT_LIMIT})`,
    `- 超限文件 (>${LINE_COUNT_LIMIT} 行): **${(data.fileLineCounts || []).filter(f => f.lines > LINE_COUNT_LIMIT).length}** 个`,
    '',
  ];

  // Growth trend
  const trend = getModuleGrowthTrend(ITERATION_MODULE_COUNTS);
  lines.push('## 📈 模块增长趋势', '');
  lines.push('| 迭代阶段 | 模块数 | 增长 |');
  lines.push('|----------|--------|------|');
  for (let i = 0; i < trend.phases.length; i++) {
    const g = i > 0 ? trend.growth[i - 1] : '-';
    const sign = typeof g === 'number' && g > 0 ? '+' : '';
    lines.push(`| ${trend.phases[i]} | ${trend.counts[i]} | ${sign}${g} |`);
  }
  lines.push('');

  // Fan-in/out
  if (data.fanData) {
    lines.push('## 🔗 扇入 Top-10（被引用最多的模块）', '');
    lines.push('| 模块 | 被引用次数 |');
    lines.push('|------|-----------|');
    for (const f of data.fanData.fanIn.slice(0, 10)) {
      lines.push(`| ${f.module} | ${f.count} |`);
    }
    lines.push('');

    lines.push('## 🔗 扇出 Top-10（引用最多模块的模块）', '');
    lines.push('| 模块 | 引用数 |');
    lines.push('|------|--------|');
    for (const f of data.fanData.fanOut.slice(0, 10)) {
      lines.push(`| ${f.module} | ${f.count} |`);
    }
    lines.push('');
  }

  // Cycles
  if (data.cycles && data.cycles.length > 0) {
    lines.push('## 🔄 循环依赖', '');
    for (const cycle of data.cycles) {
      lines.push(`- \`${cycle.join(' → ')}\``);
    }
    lines.push('');
  } else {
    lines.push('## 🔄 循环依赖', '', '✅ 未发现循环依赖', '');
  }

  // Orphans
  if (data.orphans && data.orphans.length > 0) {
    lines.push('## 🏝️ 孤立模块（0 引用）', '');
    for (const o of data.orphans) {
      lines.push(`- \`${o}\``);
    }
    lines.push('');
  } else {
    lines.push('## 🏝️ 孤立模块', '', '✅ 未发现孤立模块', '');
  }

  // Dead exports
  if (data.deadExports && data.deadExports.length > 0) {
    lines.push('## 💀 死代码（未被引用的导出）', '');
    lines.push('| 文件 | 导出名 | 行号 |');
    lines.push('|------|--------|------|');
    for (const d of data.deadExports.slice(0, 20)) {
      lines.push(`| ${d.file} | ${d.exportName} | L${d.line} |`);
    }
    lines.push('');
  }

  // Line count violations
  const violations = (data.fileLineCounts || []).filter(f => f.lines > LINE_COUNT_LIMIT);
  if (violations.length > 0) {
    lines.push(`## 📏 超限文件 (>${LINE_COUNT_LIMIT} 行)`, '');
    lines.push('| 文件 | 行数 | 超出 |');
    lines.push('|------|------|------|');
    for (const v of violations.sort((a, b) => b.lines - a.lines)) {
      lines.push(`| ${v.file} | ${v.lines} | +${v.lines - LINE_COUNT_LIMIT} |`);
    }
    lines.push('');
  }

  // Merge suggestions
  const merges = findOverlappingModules(
    (data.fileLineCounts || []).map(f => f.file)
  );
  if (merges.length > 0) {
    lines.push('## 🔀 合并建议', '');
    lines.push(generateMergeSuggestions(merges));
    lines.push('');
  }

  lines.push('---');
  lines.push(`*ArchitectureHealthMonitor R183 — PageWise 智阅*`);

  return lines.join('\n');
}

export default { generateMetricsReport, ITERATION_MODULE_COUNTS };
