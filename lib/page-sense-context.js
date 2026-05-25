/**
 * Page Sense Context Extractors — 页面上下文提取方法
 *
 * 从 page-sense.js (R280) 拆分:
 *   - extractEndpoints — HTTP 端点提取
 *   - isGitHubRepoPage — GitHub 仓库页面判断
 *   - detectGitHubPageType — GitHub 页面类型检测
 *   - extractRepoInfo — 仓库信息提取
 *   - extractErrors — 错误信息提取
 *
 * @module page-sense-context
 */

/**
 * 页面上下文提取器
 * 提供页面内容的结构化数据提取方法
 */
export class ContextExtractor {
  /**
   * 从内容中提取 HTTP API 端点
   * @param {string} content - 页面内容
   * @returns {string[]} 端点列表
   */
  extractEndpoints(content) {
    if (!content) return [];
    const patterns = [
      /(GET|POST|PUT|DELETE|PATCH)\s+\/[\w\-/{}]+/gi,
      /`\/api\/[\w\-/{}]+`/gi
    ];
    const endpoints = [];
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      endpoints.push(...matches.slice(0, 10));
    }
    return [...new Set(endpoints)];
  }

  /**
   * 判断 URL 是否为 GitHub 仓库页面（精确匹配 owner/repo 格式）
   * @param {string} url
   * @returns {boolean}
   */
  isGitHubRepoPage(url) {
    if (!url) return false;
    return /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url)
      || /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull|wiki|releases|tree|blob|actions|projects|security|graphs|pulse|settings|commit|compare)(\/.*)?$/.test(url);
  }

  /**
   * 检测 GitHub 仓库页面的具体类型
   * @param {string} url
   * @returns {string} 页面类型: repo-root, repo-file, repo-issues, repo-pr, repo-wiki, repo-releases
   */
  detectGitHubPageType(url) {
    if (!url) return 'unknown';
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(.*))?/);
    if (!match) return 'unknown';

    const path = match[3] || '';
    if (!path) return 'repo-root';

    const firstSegment = path.split('/')[0];
    switch (firstSegment) {
      case 'issues': return 'repo-issues';
      case 'pull': return 'repo-pr';
      case 'wiki': return 'repo-wiki';
      case 'releases': return 'repo-releases';
      case 'blob': return 'repo-file';
      case 'tree': return 'repo-file';
      default: return 'repo-file';
    }
  }

  /**
   * 从 URL 提取仓库 owner/repo 信息
   * @param {string} url
   * @returns {{ owner: string, repo: string } | {}}
   */
  extractRepoInfo(url) {
    if (!url) return {};
    const match = url.match(/(?:github\.com|gitlab\.com|gitee\.com)\/([^/]+)\/([^/?#]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return {};
  }

  /**
   * 从页面内容提取错误/异常信息
   * @param {string} content - 页面内容
   * @returns {string[]} 错误信息列表
   */
  extractErrors(content) {
    if (!content) return [];
    const patterns = [
      /Error[:\s].{10,100}/gi,
      /Exception[:\s].{10,100}/gi,
      /Traceback \(most recent call last\)[\s\S]{10,500}/gi,
      /Uncaught .{10,100}/gi
    ];
    const errors = [];
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      errors.push(...matches.slice(0, 5));
    }
    return [...new Set(errors)];
  }
}
