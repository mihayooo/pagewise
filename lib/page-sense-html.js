/**
 * Page Sense HTML Extraction — HTML 内容提取方法
 *
 * 从 PageSense 中提取的 HTML 解析方法，包括:
 *   - extractContent: 提取可见文本
 *   - extractImages: 提取图片 src
 *   - extractMetadata: 提取 title/description
 *   - extractHeadings: 提取 h1-h3 标题
 *
 * @module page-sense-html
 */

/**
 * 从 HTML 中提取可见文本内容，去除 script/style 标签
 * @param {string} html
 * @returns {string}
 */
export function extractContent(html) {
  if (!html) return '';
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * 从 HTML 中提取所有 img src
 * @param {string} html
 * @returns {string[]}
 */
export function extractImages(html) {
  if (!html) return [];
  const images = [];
  const regex = /<img\b[^>]*\bsrc\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    images.push(match[1]);
  }
  return images;
}

/**
 * 从 HTML 中提取元数据（title、description）
 * @param {string} html
 * @returns {{ title: string, description: string }}
 */
export function extractMetadata(html) {
  if (!html) return { title: '', description: '' };
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["'][^>]*>/i);
  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
  };
}

/**
 * 从 HTML 中提取 h1-h3 标题
 * @param {string} html
 * @returns {{ level: number, text: string }[]}
 */
export function extractHeadings(html) {
  if (!html) return [];
  const headings = [];
  const regex = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    if (text) {
      headings.push({ level, text });
    }
  }
  return headings;
}
