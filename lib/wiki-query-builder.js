/**
 * Wiki Query Builder — 查询构建/过滤/排序
 *
 * 从 wiki-query.js (R280) 拆分:
 *   - estimateTokens — Token 估算
 *   - extractKeywords — 关键词提取（中英文分词 + 停用词过滤）
 *   - scorePage — 页面相关性评分
 *   - selectRelevantPages — 智能选择最相关的 wiki 页面
 *
 * @module wiki-query-builder
 */

// ==================== 常量 ====================

/** 默认查询选项 */
export const DEFAULT_QUERY_OPTIONS = {
  maxPages: 10,        // 最多选择的页面数
  maxTokens: 6000,     // 上下文最大 token 预算
  minScore: 0,         // 最低相关性分数
};

/** Token 估算：中文约 1.5 字符/token，英文约 4 字符/token，折中取 3 */
const CHARS_PER_TOKEN = 3;

// ==================== Token 估算 ====================

/**
 * 粗略估算文本 token 数
 *
 * @param {string} text - 文本
 * @returns {number} 估算 token 数
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ==================== 评分与选择 ====================

/**
 * 将问题分解为关键词
 *
 * @param {string} question - 用户问题
 * @returns {string[]} 关键词数组（已去停用词、小写化）
 */
export function extractKeywords(question) {
  if (!question || typeof question !== 'string') return [];

  // 中英文停用词
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
    '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '吗', '呢',
    '吧', '啊', '哦', '嗯', '哈', '呀', '哪', '怎么', '什么', '为什么',
    '如何', '哪些', '请', '能', '可以', '告诉', '介绍', '解释', '说明',
    '一下', '一些', '关于', '对', '与', '和', '或', '但', '而', '如果', '是什么',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you',
    'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself', 'its', 'itself', 'they', 'them',
    'their', 'theirs', 'themselves', 'about', 'up', 'down',
  ]);

  // 分词：中文逐字拆分 + 英文按空格/标点拆分
  const lower = question.toLowerCase();

  // 先提取英文单词（连续字母/数字）
  const englishWords = lower.match(/[a-z][a-z0-9]*/g) || [];

  // 再提取中文词（连续中文字符，>=2 字符才保留为有意义的词）
  const chineseChunks = lower.match(/[一-鿿]+/g) || [];
  const chineseWords = [];
  for (const chunk of chineseChunks) {
    if (chunk.length === 2) {
      chineseWords.push(chunk);
    }
    if (chunk.length >= 3 && chunk.length <= 4) {
      for (let i = 0; i <= chunk.length - 2; i++) {
        chineseWords.push(chunk.slice(i, i + 2));
      }
    }
    if (chunk.length > 4) {
      for (let i = 0; i <= chunk.length - 2; i++) {
        chineseWords.push(chunk.slice(i, i + 2));
      }
      for (let i = 0; i <= chunk.length - 3; i++) {
        chineseWords.push(chunk.slice(i, i + 3));
      }
    }
  }

  const allTokens = [...englishWords, ...chineseWords];
  const filtered = allTokens.filter(t => t.length > 0 && !stopWords.has(t));

  return [...new Set(filtered)];
}

/**
 * 计算单个页面与问题的相关性分数
 *
 * 评分规则：
 *   - 标题完全匹配关键词: +10
 *   - 标题包含关键词: +5
 *   - 标签匹配关键词: +3
 *   - 内容包含关键词: +1
 *
 * @param {Object} page - Wiki 页面对象
 * @param {string[]} keywords - 问题关键词列表
 * @returns {number} 相关性分数
 */
export function scorePage(page, keywords) {
  if (!page || !Array.isArray(keywords) || keywords.length === 0) return 0;

  let score = 0;
  const titleLower = (page.title || '').toLowerCase();
  const contentLower = (page.content || '').toLowerCase();
  const tags = Array.isArray(page.tags) ? page.tags : [];

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();

    if (titleLower === kw) {
      score += 10;
    }
    else if (titleLower.includes(kw)) {
      score += 5;
    }

    for (const tag of tags) {
      if (tag && tag.toLowerCase().includes(kw)) {
        score += 3;
        break;
      }
    }

    if (contentLower.includes(kw)) {
      score += 1;
    }
  }

  return score;
}

/**
 * 智能选择与问题最相关的 wiki 页面
 *
 * @param {Array<Object>} pages - Wiki 页面数组
 * @param {string} question - 用户问题
 * @param {Object} [options] - 选项
 * @param {number} [options.maxPages=10] - 最多选择的页面数
 * @param {number} [options.maxTokens=6000] - token 预算
 * @param {number} [options.minScore=0] - 最低相关性分数
 * @returns {Array<Object>} 排序后的相关页面列表
 */
export function selectRelevantPages(pages, question, options = {}) {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options };
  const { maxPages, maxTokens, minScore } = opts;

  if (!Array.isArray(pages) || pages.length === 0) return [];
  if (!question || typeof question !== 'string') return [];

  const keywords = extractKeywords(question);
  if (keywords.length === 0) {
    return pages.slice(0, maxPages);
  }

  const scored = [];
  for (const page of pages) {
    if (!page || !page.id) continue;
    const s = scorePage(page, keywords);
    if (s > minScore) {
      scored.push({ page, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  let totalTokens = 0;

  for (const { page } of scored) {
    if (selected.length >= maxPages) break;
    const pageTokens = estimateTokens(page.content || '');
    if (totalTokens + pageTokens > maxTokens && selected.length > 0) break;
    selected.push(page);
    totalTokens += pageTokens;
  }

  return selected;
}

// ==================== 上下文构建 ====================

/** 页面类型中文标签 */
const PAGE_TYPE_DISPLAY = {
  entity: '实体',
  concept: '概念',
  qa: '知识',
};

/**
 * 将选中的页面构建为 LLM 可读的上下文文本
 *
 * @param {Array<Object>} selectedPages - 选中的页面列表
 * @param {Object} [options] - 选项
 * @param {number} [options.maxTokens=6000] - 总 token 预算
 * @param {Function} [options.formatter] - 自定义格式化器 (page) => string
 * @returns {string} 格式化后的上下文文本
 */
export function buildWikiContext(selectedPages, options = {}) {
  if (!Array.isArray(selectedPages) || selectedPages.length === 0) return '';

  const maxTokens = options.maxTokens || 6000;
  const formatter = options.formatter || defaultPageFormatter;

  const parts = [];
  let totalTokens = 0;

  for (const page of selectedPages) {
    if (!page) continue;

    let formatted = formatter(page);
    const partTokens = estimateTokens(formatted);

    if (totalTokens + partTokens > maxTokens) {
      const remainingChars = (maxTokens - totalTokens) * CHARS_PER_TOKEN;
      if (remainingChars <= 0) break;
      formatted = formatted.slice(0, Math.max(0, Math.floor(remainingChars))) + '\n...(已截断)';
    }

    parts.push(formatted);
    totalTokens += estimateTokens(formatted);

    if (totalTokens >= maxTokens) break;
  }

  return parts.join('\n\n');
}

/**
 * 默认页面格式化器
 *
 * @param {Object} page - Wiki 页面
 * @returns {string} 格式化后的文本
 */
function defaultPageFormatter(page) {
  const typeLabel = PAGE_TYPE_DISPLAY[page.type] || page.type || '页面';
  const title = page.title || '未命名';
  const content = page.content || '';

  return `## [${typeLabel}] ${title}\n${content}`;
}
