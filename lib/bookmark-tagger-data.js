/**
 * BookmarkTagger Data — 常量与域名映射
 *
 * 从 bookmark-tagger.js 拆分的纯数据层：
 *   - 英文/中文停用词集合
 *   - 技术关键词集合
 *   - 域名 → 标签映射表
 *
 * 纯 ES Module，无副作用。
 */

// ==================== 停用词 ====================

/** 英文停用词 — 过滤掉这些无意义的常见词 */
export const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'was', 'are',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'not',
  'no', 'this', 'that', 'these', 'those', 'its', 'my', 'your', 'his',
  'her', 'our', 'their', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
  'him', 'us', 'them', 'what', 'which', 'who', 'how', 'when', 'where',
  'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some',
  'any', 'if', 'then', 'else', 'so', 'just', 'about', 'up', 'out',
  'into', 'over', 'after', 'before', 'between', 'through', 'during',
  'above', 'below', 'get', 'set', 'use', 'using', 'used', 'via',
  'new', 'old', 'top', 'best', 'first', 'last', 'next', 'back',
  'page', 'site', 'web', 'www', 'com', 'org', 'net', 'io', 'dev',
  'html', 'htm', 'php', 'asp',
]);

/** 中文停用词 */
export const CHINESE_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
  '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们',
  '那', '么', '些', '把', '被', '让', '给', '从', '向', '对',
  '与', '及', '等', '但', '而', '或', '中', '为', '以', '所',
  '可以', '这个', '那个', '什么', '怎么', '如何', '为什么',
]);

// ==================== 技术关键词集合 ====================

export const TECH_KEYWORDS = new Set([
  'javascript', 'typescript', 'python', 'java', 'kotlin', 'swift', 'ruby',
  'go', 'golang', 'rust', 'c', 'cpp', 'csharp', 'php', 'perl', 'scala',
  'elixir', 'clojure', 'haskell', 'lua', 'r', 'dart', 'zig', 'julia',
  'react', 'vue', 'vuejs', 'angular', 'svelte', 'nextjs', 'nuxt', 'remix',
  'solidjs', 'preact', 'astro', 'gatsby', 'jquery', 'backbone', 'ember',
  'css', 'scss', 'sass', 'tailwind', 'bootstrap', 'postcss', 'less',
  'styled-components', 'emotion',
  'node', 'nodejs', 'express', 'fastify', 'koa', 'nestjs', 'django',
  'flask', 'fastapi', 'spring', 'springboot', 'rails', 'laravel',
  'actix', 'gin', 'fiber', 'axum',
  'mysql', 'postgresql', 'postgres', 'sqlite', 'mongodb', 'redis',
  'elasticsearch', 'elastic', 'cassandra', 'neo4j', 'dynamodb',
  'mariadb', 'cockroachdb', 'supabase', 'prisma', 'sequelize',
  'typeorm', 'drizzle',
  'docker', 'kubernetes', 'k8s', 'terraform', 'ansible', 'jenkins',
  'github-actions', 'gitlab-ci', 'circleci', 'travis', 'aws', 'azure',
  'gcp', 'firebase', 'vercel', 'netlify', 'cloudflare', 'nginx', 'apache',
  'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'openai', 'gpt',
  'llm', 'chatgpt', 'transformer', 'bert', 'huggingface', 'langchain',
  'ollama', 'llama', 'stable-diffusion', 'midjourney', 'copilot',
  'machine-learning', 'deep-learning', 'neural-network', 'nlp',
  'flutter', 'react-native', 'expo', 'ionic', 'xamarin', 'android',
  'ios', 'swiftui', 'jetpack-compose',
  'jest', 'mocha', 'chai', 'vitest', 'cypress', 'playwright', 'selenium',
  'testing-library', 'pytest', 'unittest', 'junit',
  'webpack', 'vite', 'rollup', 'esbuild', 'parcel', 'turbopack',
  'babel', 'swc', 'nx', 'lerna', 'turborepo', 'monorepo',
  'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
  'slack', 'notion', 'figma',
  'graphql', 'rest', 'grpc', 'websocket', 'socket.io', 'apollo',
  'trpc', 'openapi', 'swagger',
  'oauth', 'jwt', 'cors', 'csrf', 'xss', 'https', 'ssl', 'tls',
  'authentication', 'authorization', 'encryption',
  'linux', 'bash', 'shell', 'vim', 'neovim', 'vscode', 'eslint',
  'prettier', 'husky', 'markdown', 'json', 'yaml', 'toml',
  'docker-compose', 'microservices', 'serverless', 'graphql',
  'svelte', 'd3', 'three.js', 'canvas', 'webgl', 'wasm', 'webassembly',
]);

// ==================== 常见域名 → 标签映射 ====================

export const DOMAIN_TAG_MAP = {
  'github.com': 'github',
  'stackoverflow.com': 'stackoverflow',
  'stackexchange.com': 'stackexchange',
  'medium.com': 'medium',
  'dev.to': 'dev',
  'hashnode.com': 'hashnode',
  'hackernews': 'hacker-news',
  'news.ycombinator.com': 'hacker-news',
  'reddit.com': 'reddit',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'youtube.com': 'youtube',
  'ycombinator.com': 'ycombinator',
  'npmjs.com': 'npm',
  'npmjs.org': 'npm',
  'pypi.org': 'pypi',
  'crates.io': 'crates',
  'hub.docker.com': 'docker-hub',
  'docs.microsoft.com': 'microsoft-docs',
  'learn.microsoft.com': 'microsoft-docs',
  'developer.mozilla.org': 'mdn',
  'mozilla.org': 'mozilla',
  'w3schools.com': 'w3schools',
  'freecodecamp.org': 'freecodecamp',
  'leetcode.com': 'leetcode',
  'codepen.io': 'codepen',
  'codesandbox.io': 'codesandbox',
  'jsfiddle.net': 'jsfiddle',
  'notion.so': 'notion',
  'vercel.app': 'vercel',
  'netlify.app': 'netlify',
  'heroku.com': 'heroku',
  'digitalocean.com': 'digitalocean',
  'aws.amazon.com': 'aws',
  'cloud.google.com': 'gcp',
  'console.cloud.google.com': 'gcp',
  'portal.azure.com': 'azure',
  'arxiv.org': 'arxiv',
  'scholar.google.com': 'google-scholar',
  'research.google': 'google-research',
  'openai.com': 'openai',
  'anthropic.com': 'anthropic',
  'huggingface.co': 'huggingface',
  'kaggle.com': 'kaggle',
};
