/**
 * BookmarkTagEditorV2 — 常量与辅助方法
 *
 * 从 bookmark-tag-editor-v2.js (R150) 拆分:
 *   - TECH_KEYWORDS — 技术关键词集合
 *   - DOMAIN_TAG_MAP — 域名→标签映射
 *   - _extractDomainTag — 域名标签提取
 *   - _extractPathTags — URL 路径标签提取
 *   - _escapeRegex — 正则转义
 */

/**
 * 技术关键词 — 用于智能标签推荐
 */
export const TECH_KEYWORDS = new Set([
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'ruby',
  'go', 'golang', 'rust', 'c', 'cpp', 'csharp', 'php', 'perl', 'scala',
  'react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'remix',
  'css', 'scss', 'tailwind', 'bootstrap', 'sass',
  'node', 'nodejs', 'express', 'fastify', 'koa', 'nestjs', 'django',
  'flask', 'fastapi', 'spring', 'rails', 'laravel',
  'mysql', 'postgresql', 'sqlite', 'mongodb', 'redis', 'elasticsearch',
  'neo4j', 'dynamodb', 'supabase', 'prisma',
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins',
  'aws', 'azure', 'gcp', 'firebase', 'vercel', 'netlify', 'cloudflare', 'nginx',
  'tensorflow', 'pytorch', 'keras', 'openai', 'gpt', 'llm', 'chatgpt',
  'transformer', 'bert', 'huggingface', 'langchain', 'ollama',
  'flutter', 'react-native', 'expo', 'android', 'ios', 'swiftui',
  'jest', 'mocha', 'vitest', 'cypress', 'playwright', 'selenium', 'pytest',
  'webpack', 'vite', 'rollup', 'esbuild', 'parcel',
  'git', 'github', 'gitlab', 'jira', 'notion', 'figma',
  'graphql', 'rest', 'grpc', 'websocket', 'trpc', 'openapi',
  'oauth', 'jwt', 'cors', 'csrf', 'xss', 'https',
  'linux', 'bash', 'shell', 'vim', 'vscode', 'eslint', 'prettier',
  'markdown', 'json', 'yaml',
  'machine-learning', 'deep-learning', 'nlp', 'computer-vision',
  'data-science', 'data-analysis', 'data-visualization',
  'algorithm', 'leetcode', 'competitive-programming',
  'design-pattern', 'microservice', 'serverless', 'api',
  'tutorial', 'documentation', 'guide', 'cheatsheet', 'roadmap',
]);

/**
 * 域名 → 推荐标签映射
 */
export const DOMAIN_TAG_MAP = {
  'github.com': 'github',
  'stackoverflow.com': 'stackoverflow',
  'medium.com': 'medium',
  'dev.to': 'dev',
  'reddit.com': 'reddit',
  'youtube.com': 'youtube',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'arxiv.org': 'arxiv',
  'leetcode.com': 'leetcode',
  'npmjs.com': 'npm',
  'npmjs.org': 'npm',
  'pypi.org': 'pypi',
  'docs.docker.com': 'docker',
  'kubernetes.io': 'kubernetes',
  'react.dev': 'react',
  'vuejs.org': 'vue',
  'angular.io': 'angular',
  'nextjs.org': 'nextjs',
  'svelte.dev': 'svelte',
  'typescriptlang.org': 'typescript',
  'python.org': 'python',
  'rust-lang.org': 'rust',
  'go.dev': 'go',
  'openai.com': 'openai',
  'anthropic.com': 'anthropic',
  'huggingface.co': 'huggingface',
  'vercel.com': 'vercel',
  'netlify.com': 'netlify',
  'cloud.google.com': 'gcp',
  'aws.amazon.com': 'aws',
  'portal.azure.com': 'azure',
  'firebase.google.com': 'firebase',
  'w3schools.com': 'w3schools',
  'developer.mozilla.org': 'mdn',
  'freecodecamp.org': 'freecodecamp',
};

// ==================== 辅助方法 ====================

/**
 * 从 URL 提取域名标签
 * @param {string} url
 * @returns {string|null}
 */
export function _extractDomainTag(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    for (const [domain, tag] of Object.entries(DOMAIN_TAG_MAP)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return tag;
      }
    }

    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const main = parts[parts.length - 2];
      if (main && main.length >= 2 && !['com', 'org', 'net', 'io', 'dev', 'app', 'co'].includes(main)) {
        return main;
      }
    }
    return null;
  } catch (e) {
    console.warn('[TagEditorConstants]', e?.message || e);
    return null;
  }
}

/**
 * 从 URL 路径提取标签
 * @param {string} url
 * @returns {string[]}
 */
export function _extractPathTags(url) {
  if (!url || typeof url !== 'string') return [];
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .split('/')
      .filter(s => s.length > 1 && s.length <= 20)
      .map(s => s.toLowerCase().replace(/\.(html?|php|asp|aspx|jsp)$/i, ''))
      .filter(s => s.length >= 2 && !/^\d+$/.test(s))
      .slice(0, 3);
  } catch (e) {
    console.warn('[TagEditorConstants]', e?.message || e);
    return [];
  }
}

/**
 * 正则转义
 * @param {string} str
 * @returns {string}
 */
export function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 标签规范化
 *  - 转小写
 *  - 去除首尾空格
 *  - 连续空格替换为单个连字符
 *  - 移除特殊字符（保留中文、字母、数字、连字符、下划线）
 *  - 最大长度 30 字符
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  if (typeof tag !== 'string') return '';
  let result = tag
    .toLowerCase()
    .trim()
    .replace(/\s{2,}/g, '-')
    .replace(/[^\p{L}\p{N}_\-]/gu, '')
    .slice(0, 30);
  return result;
}
