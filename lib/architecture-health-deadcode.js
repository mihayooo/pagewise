/**
 * ArchitectureHealthDeadCode — 死代码检测
 *
 * R183: 从 architecture-health-monitor.js 拆分
 * 检测从未被 import 的导出函数/类
 *
 * @module lib/architecture-health-deadcode
 */

/**
 * 获取字符串中某个 index 所在的行号
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
export function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * 检测从未被 import 的导出函数/类
 *
 * @param {Record<string, string>} fileContents — { filePath: content }
 * @returns {{ file: string, exportName: string, line: number }[]}
 */
export function detectDeadExports(fileContents) {
  const allExports = [];
  const allImports = new Set();

  const EXPORT_RE = /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/g;
  const EXPORT_DEFAULT_RE = /export\s+default\s+(?:class|function)\s*(\w+)?/g;
  const EXPORT_NAMED_RE = /export\s*\{([^}]+)\}/g;

  for (const [filePath, content] of Object.entries(fileContents)) {
    let match;

    EXPORT_RE.lastIndex = 0;
    while ((match = EXPORT_RE.exec(content)) !== null) {
      allExports.push({ file: filePath, exportName: match[1], line: getLineNumber(content, match.index) });
    }

    EXPORT_DEFAULT_RE.lastIndex = 0;
    while ((match = EXPORT_DEFAULT_RE.exec(content)) !== null) {
      if (match[1]) {
        allExports.push({ file: filePath, exportName: match[1], line: getLineNumber(content, match.index) });
      }
    }

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

  const deadExports = [];
  for (const exp of allExports) {
    if (!allImports.has(exp.exportName)) {
      deadExports.push(exp);
    }
  }

  return deadExports;
}

export default { detectDeadExports, getLineNumber };
