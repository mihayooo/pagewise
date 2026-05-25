/**
 * JSDocAudit — JSDoc 完整性审计工具
 *
 * 提供模块级 JSDoc 覆盖率审计功能，用于自动化检测 lib/ 下
 * 导出符号（export function / export class / export const）是否
 * 具有 JSDoc 注释。
 *
 * R282: 多个 lib 模块缺少 JSDoc 注释，影响 IDE 智能提示和维护效率
 *
 * @module lib/jsdoc-audit
 */

// ==================== 内部常量 ====================

/** 匹配 export 声明行的正则 */
const _EXPORT_RE = /^export\s+(async\s+)?(function|class|const|let|var)\s+(\w+)/;

/** 匹配 export default 声明的正则 */
const _EXPORT_DEFAULT_RE = /^export\s+default\s+(function|class)\s+(\w+)?/;

/** 匹配 re-export 语句 */
const _RE_EXPORT_RE = /^export\s+\{[^}]+\}\s+from\s+/;

/** 匹配 JSDoc 起始标记 */
const _JSDOC_START_RE = /^\s*\/\*\*/;

/** 匹配 JSDoc 结束标记 */
const _JSDOC_END_RE = /\*\/\s*$/;

// ==================== 导出检测 ====================

/**
 * 解析文件内容，提取所有顶层导出符号及其 JSDoc 状态
 *
 * @param {string} content - 文件源码内容
 * @returns {Array<{name: string, kind: string, line: number, hasJSDoc: boolean, jsdocSummary: string|null}>}
 */
export function parseExports(content) {
  if (typeof content !== 'string') return [];

  const lines = content.split('\n');
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 跳过 re-export
    if (_RE_EXPORT_RE.test(line)) continue;

    let match = _EXPORT_RE.exec(line);
    let kind = match ? (match[2] || 'function') : null;
    let name = match ? match[3] : null;

    if (!match) {
      const defMatch = _EXPORT_DEFAULT_RE.exec(line);
      if (defMatch) {
        kind = 'default';
        name = defMatch[2] || 'default';
      }
    }

    if (match || _EXPORT_DEFAULT_RE.test(line)) {
      const jsdocResult = _findPrecedingJSDoc(lines, i);
      results.push({
        name: name || 'default',
        kind: kind || 'unknown',
        line: i + 1,
        hasJSDoc: jsdocResult.found,
        jsdocSummary: jsdocResult.summary,
      });
    }
  }

  return results;
}

/**
 * 在指定行之前查找 JSDoc 注释
 * @param {string[]} lines
 * @param {number} exportLineIndex
 * @returns {{found: boolean, summary: string|null}}
 * @private
 */
function _findPrecedingJSDoc(lines, exportLineIndex) {
  for (let j = exportLineIndex - 1; j >= 0; j--) {
    const prevLine = lines[j].trim();
    if (prevLine === '') continue;
    if (prevLine === '*/' || prevLine.endsWith(' */')) {
      for (let k = j; k >= 0; k--) {
        const commentLine = lines[k].trim();
        if (commentLine.startsWith('/**')) {
          const summary = _extractJSDocSummary(lines, k, j);
          return { found: true, summary };
        }
      }
    }
    break;
  }
  return { found: false, summary: null };
}

/**
 * 从 JSDoc 块中提取摘要文本
 * @param {string[]} lines
 * @param {number} startLine
 * @param {number} endLine
 * @returns {string|null}
 * @private
 */
function _extractJSDocSummary(lines, startLine, endLine) {
  const summaryParts = [];
  for (let k = startLine; k <= endLine; k++) {
    let line = lines[k].trim();
    line = line.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '');
    line = line.replace(/^\*\s?/, '');
    if (line === '' && summaryParts.length > 0) break;
    if (line.startsWith('@')) break;
    if (line.length > 0) summaryParts.push(line);
  }
  return summaryParts.join(' ').trim() || null;
}

// ==================== 覆盖率计算 ====================

/**
 * 计算单个文件的 JSDoc 覆盖率
 *
 * @param {string} content - 文件源码内容
 * @returns {{total: number, covered: number, missing: number, coverage: number, symbols: Array}}
 */
export function calculateFileCoverage(content) {
  const symbols = parseExports(content);
  const total = symbols.length;
  const covered = symbols.filter(s => s.hasJSDoc).length;
  const missing = total - covered;
  const coverage = total > 0 ? Math.round((covered / total) * 1000) / 10 : 100;
  return { total, covered, missing, coverage, symbols };
}

/**
 * 批量计算多文件 JSDoc 覆盖率
 *
 * @param {Array<{name: string, content: string}>} files - 文件数组
 * @returns {{summary: object, files: Array}}
 */
export function calculateBatchCoverage(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      summary: { totalFiles: 0, filesWithMissing: 0, totalExports: 0, coveredExports: 0, missingExports: 0, overallCoverage: 100 },
      files: [],
    };
  }

  const fileResults = [];
  let totalExports = 0;
  let coveredExports = 0;

  for (const file of files) {
    const result = calculateFileCoverage(file.content);
    totalExports += result.total;
    coveredExports += result.covered;
    fileResults.push({
      name: file.name,
      total: result.total,
      covered: result.covered,
      missing: result.missing,
      coverage: result.coverage,
      missingSymbols: result.symbols.filter(s => !s.hasJSDoc).map(s => s.name),
    });
  }

  const missingExports = totalExports - coveredExports;
  const overallCoverage = totalExports > 0 ? Math.round((coveredExports / totalExports) * 1000) / 10 : 100;
  const filesWithMissing = fileResults.filter(f => f.missing > 0).length;

  return {
    summary: {
      totalFiles: files.length,
      filesWithMissing,
      totalExports,
      coveredExports,
      missingExports,
      overallCoverage,
    },
    files: fileResults.sort((a, b) => b.missing - a.missing),
  };
}

// ==================== 报告生成 ====================

/**
 * 生成 Markdown 格式的 JSDoc 审计报告
 *
 * @param {object} batchResult - calculateBatchCoverage 的返回值
 * @returns {string} Markdown 报告
 */
export function generateReport(batchResult) {
  const { summary, files } = batchResult;
  const lines = [];

  lines.push('# JSDoc 完整性审计报告');
  lines.push('');
  lines.push('> 生成时间: ' + new Date().toISOString());
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|-----|');
  lines.push('| 文件总数 | ' + summary.totalFiles + ' |');
  lines.push('| 缺少 JSDoc 的文件 | ' + summary.filesWithMissing + ' |');
  lines.push('| 导出符号总数 | ' + summary.totalExports + ' |');
  lines.push('| 已覆盖 | ' + summary.coveredExports + ' |');
  lines.push('| 缺失 | ' + summary.missingExports + ' |');
  lines.push('| 总覆盖率 | ' + summary.overallCoverage + '% |');
  lines.push('');

  const filesWithMissing = files.filter(f => f.missing > 0);
  if (filesWithMissing.length > 0) {
    lines.push('## 缺少 JSDoc 的文件');
    lines.push('');
    lines.push('| 文件 | 导出数 | 已覆盖 | 缺失 | 覆盖率 | 缺失符号 |');
    lines.push('|------|--------|--------|------|--------|---------|');
    for (const f of filesWithMissing) {
      lines.push('| ' + f.name + ' | ' + f.total + ' | ' + f.covered + ' | ' + f.missing + ' | ' + f.coverage + '% | ' + f.missingSymbols.join(', ') + ' |');
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 生成控制台友好的摘要文本
 *
 * @param {object} batchResult - calculateBatchCoverage 的返回值
 * @returns {string} 单行摘要
 */
export function generateSummary(batchResult) {
  const { summary } = batchResult;
  return 'JSDoc 覆盖率: ' + summary.overallCoverage + '% (' + summary.coveredExports + '/' + summary.totalExports + ' 导出, ' + summary.filesWithMissing + '/' + summary.totalFiles + ' 文件有缺失)';
}
