/**
 * Batch Summary — 分段逻辑
 * 从 batch-summary.js 拆分：splitIntoSections 及其内部策略函数
 *
 * @module lib/batch-summary-split
 */

/**
 * 将内容分段
 * @param {string} content - 原始内容
 * @param {Object} [options] - 分段选项
 * @param {'heading'|'paragraph'|'fixed'} [options.strategy='heading'] - 分段策略
 * @param {number} [options.maxSectionChars=3000] - 每段最大字符数
 * @param {number} [options.minSectionChars=50] - 每段最小字符数（短于此的段会被合并）
 * @returns {Array<{id: number, title: string, content: string, level: number, charCount: number}>}
 */
export function splitIntoSections(content, options = {}) {
  if (!content || typeof content !== "string") return [];

  const {
    strategy = "heading",
    maxSectionChars = 3000,
    minSectionChars = 10
  } = options;

  let sections;

  switch (strategy) {
    case "heading":
      sections = _splitByHeading(content, maxSectionChars);
      break;
    case "paragraph":
      sections = _splitByParagraph(content, maxSectionChars);
      break;
    case "fixed":
      sections = _splitByFixed(content, maxSectionChars);
      break;
    default:
      sections = _splitByHeading(content, maxSectionChars);
  }

  // 合并过短段落
  sections = _mergeShortSections(sections, minSectionChars);

  // 截断过长段落
  sections = sections.map(s => {
    if (s.content.length > maxSectionChars) {
      const truncated = s.content.slice(0, maxSectionChars - 20) + "\n\n[内容已截取…]";
      return { ...s, content: truncated, charCount: truncated.length };
    }
    return s;
  });

  // 重新分配 id
  return sections.map((s, i) => ({ ...s, id: i }));
}

/**
 * 按 Markdown / HTML 标题分段
 * @private
 */
function _splitByHeading(content, _maxChars) {
  const lines = content.split("\n");
  const sections = [];
  let currentTitle = "(无标题)";
  let currentLevel = 1;
  let currentLines = [];

  for (const line of lines) {
    // Markdown heading: # Title / ## Title / ### Title
    const mdMatch = line.match(/^(#{1,3})\s+(.+)/);
    // HTML heading: <h1>...</h1> / <h2>...</h2> / <h3>...</h3>
    const htmlMatch = line.match(/^<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/i);

    if (mdMatch || htmlMatch) {
      // 如果已有内容，保存当前段
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text.length > 0) {
          sections.push({
            id: sections.length,
            title: currentTitle,
            content: text,
            level: currentLevel,
            charCount: text.length
          });
        }
      }
      // 开始新段
      if (mdMatch) {
        currentLevel = mdMatch[1].length;
        currentTitle = mdMatch[2].trim();
      } else {
        currentLevel = parseInt(htmlMatch[1], 10);
        currentTitle = htmlMatch[2].replace(/<[^>]+>/g, "").trim();
      }
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // 保存最后一段
  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      sections.push({
        id: sections.length,
        title: currentTitle,
        content: text,
        level: currentLevel,
        charCount: text.length
      });
    }
  }

  // 如果完全没有标题，整个内容作为一段
  if (sections.length === 0 && content.trim().length > 0) {
    const text = content.trim();
    sections.push({
      id: 0,
      title: "(无标题)",
      content: text,
      level: 0,
      charCount: text.length
    });
  }

  return sections;
}

/**
 * 按双换行分段
 * @private
 */
function _splitByParagraph(content, _maxChars) {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return paragraphs.map((p, i) => {
    const text = p.trim();
    return {
      id: i,
      title: "段落 " + (i + 1),
      content: text,
      level: 0,
      charCount: text.length
    };
  });
}

/**
 * 按固定字符数分段
 * @private
 */
function _splitByFixed(content, maxChars) {
  const sections = [];
  let offset = 0;
  let idx = 0;

  while (offset < content.length) {
    let end = Math.min(offset + maxChars, content.length);
    // 尝试在标点或空格处断开
    if (end < content.length) {
      const breakChars = "。！？.!?\n；;，, ";
      for (let i = end; i > offset + maxChars * 0.5; i--) {
        if (breakChars.includes(content[i])) {
          end = i + 1;
          break;
        }
      }
    }
    const text = content.slice(offset, end).trim();
    if (text.length > 0) {
      sections.push({
        id: idx++,
        title: "段 " + (idx),
        content: text,
        level: 0,
        charCount: text.length
      });
    }
    offset = end;
  }

  return sections;
}

/**
 * 合并过短的段落到相邻段
 * @private
 */
function _mergeShortSections(sections, minChars) {
  if (sections.length <= 1) return sections;

  const merged = [];
  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    if (current.charCount < minChars && merged.length > 0) {
      // 合并到前一段
      const prev = merged[merged.length - 1];
      const combined = prev.content + "\n\n" + current.content;
      merged[merged.length - 1] = {
        ...prev,
        content: combined,
        charCount: combined.length
      };
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}
