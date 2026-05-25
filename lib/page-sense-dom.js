/**
 * Page Sense DOM Analyzers — 页面类型分析器注册与核心分析逻辑
 *
 * 从 page-sense.js (R280) 拆分:
 *   - PageSenseDom 类 — 注册默认分析器 + analyze/toPrompt/suggestSkills 核心方法
 *   - 继承 ContextExtractor 获得提取器方法
 *
 * @module page-sense-dom
 */

import { ContextExtractor } from './page-sense-context.js';

/**
 * 页面感知引擎 — DOM 分析器与核心逻辑
 * 继承 ContextExtractor 获取页面上下文提取能力
 */
export class PageSenseDom extends ContextExtractor {
  constructor() {
    super();
    this.analyzers = [];
    this.registerDefaultAnalyzers();
  }

  register(analyzer) {
    this.analyzers.push(analyzer);
  }

  registerDefaultAnalyzers() {
    // API 文档页面
    this.register({
      id: 'api-doc',
      detect: (ctx) => {
        const url = (ctx.url || '').toLowerCase();
        const text = (ctx.content || '').toLowerCase();

        const urlPatterns = ['/api/', '/docs/', '/reference/', '/swagger/', '/openapi/'];
        if (urlPatterns.some(p => url.includes(p))) return true;

        if (ctx.hasSwaggerUI) return true;

        const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
        const methodCount = httpMethods.filter(m => {
          const regex = new RegExp('\\b' + m + '\\b', 'gi');
          return (text.match(regex) || []).length > 0;
        }).length;
        if (methodCount >= 3) return true;

        return text.includes('endpoint') || text.includes('request') || text.includes('response');
      },
      extract: (ctx) => ({
        type: 'api-doc',
        label: 'API 文档',
        icon: '📡',
        endpoints: this.extractEndpoints(ctx.content)
      })
    });

    // 代码仓库页面
    this.register({
      id: 'code-repo',
      detect: (ctx) => {
        return ctx.url?.includes('github.com') || ctx.url?.includes('gitlab.com')
          || ctx.url?.includes('gitee.com');
      },
      extract: (ctx) => ({
        type: 'code-repo',
        label: '代码仓库',
        icon: '📦',
        repo: this.extractRepoInfo(ctx.url),
        repoPageType: this.detectGitHubPageType(ctx.url)
      })
    });

    // GitHub 仓库页面（更精确的识别）
    this.register({
      id: 'github-repo',
      detect: (ctx) => {
        const url = ctx.url || '';
        return this.isGitHubRepoPage(url);
      },
      extract: (ctx) => {
        const url = ctx.url || '';
        const info = this.extractRepoInfo(url);
        const pageType = this.detectGitHubPageType(url);
        const typeLabels = {
          'repo-root': '仓库主页',
          'repo-file': '文件浏览',
          'repo-issues': 'Issue 列表',
          'repo-pr': 'Pull Requests',
          'repo-wiki': 'Wiki',
          'repo-releases': '发布版本'
        };
        return {
          type: 'github-repo',
          label: typeLabels[pageType] || 'GitHub 仓库',
          icon: '🐙',
          owner: info.owner,
          repo: info.repo,
          pageType,
          isRepoRoot: pageType === 'repo-root'
        };
      }
    });

    // Stack Overflow / 问答页面
    this.register({
      id: 'qa-page',
      detect: (ctx) => {
        return ctx.url?.includes('stackoverflow.com') || ctx.url?.includes('segmentfault.com')
          || ctx.url?.includes('zhihu.com/question');
      },
      extract: (_ctx) => ({
        type: 'qa-page',
        label: '技术问答',
        icon: '💬'
      })
    });

    // 技术博客
    this.register({
      id: 'tech-blog',
      detect: (ctx) => {
        const url = ctx.url || '';
        return url.includes('medium.com') || url.includes('dev.to')
          || url.includes('juejin.cn') || url.includes('cnblogs.com')
          || url.includes('csdn.net') || url.includes('jianshu.com');
      },
      extract: (_ctx) => ({
        type: 'tech-blog',
        label: '技术博客',
        icon: '📝'
      })
    });

    // YouTube 视频页面
    this.register({
      id: 'youtube',
      detect: (ctx) => {
        return ctx.url?.includes('youtube.com/watch');
      },
      extract: (ctx) => {
        const url = ctx.url || '';
        const videoIdMatch = url.match(/[?&]v=([^&]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : '';
        const title = ctx.title || '';
        const channelMatch = ctx.content?.match(/(?:频道|Channel)[:\s]*(.*?)(?:\n|$)/i);
        const channel = channelMatch ? channelMatch[1].trim() : '';
        return {
          type: 'youtube',
          label: 'YouTube 视频',
          icon: '📺',
          videoId,
          title,
          channel,
          hasSubtitles: ctx.subtitles !== null
        };
      }
    });

    // PDF 文档页面
    this.register({
      id: 'pdf',
      detect: (ctx) => {
        const url = (ctx.url || '').toLowerCase();
        if (url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('.pdf#')) return true;
        if (ctx.isPdf) return true;
        return false;
      },
      extract: (ctx) => ({
        type: 'pdf',
        label: 'PDF 文档',
        icon: '📑',
        pdfUrl: ctx.url || '',
        pdfContentLength: (ctx.content || '').length
      })
    });

    // 含代码的页面
    this.register({
      id: 'code-snippet',
      detect: (ctx) => {
        return (ctx.codeBlocks?.length || 0) >= 2;
      },
      extract: (ctx) => ({
        type: 'code-snippet',
        label: '代码片段',
        icon: '💻',
        languages: [...new Set(ctx.codeBlocks.map(b => b.lang).filter(Boolean))],
        blockCount: ctx.codeBlocks.length
      })
    });

    // 问题/错误页面
    this.register({
      id: 'error-page',
      detect: (ctx) => {
        const text = (ctx.content || '').toLowerCase();
        return text.includes('error') || text.includes('exception')
          || text.includes('traceback') || text.includes('bug');
      },
      extract: (ctx) => ({
        type: 'error-page',
        label: '错误/问题',
        icon: '🐛',
        errors: this.extractErrors(ctx.content)
      })
    });
  }

  /**
   * 分析页面，返回感知结果
   */
  analyze(pageContext) {
    const results = [];

    for (const analyzer of this.analyzers) {
      try {
        if (analyzer.detect(pageContext)) {
          results.push(analyzer.extract(pageContext));
        }
      } catch (_e) {
        // 跳过失败的分析器
      }
    }

    return {
      types: results,
      primaryType: results[0] || { type: 'generic', label: '通用页面', icon: '📄' },
      summary: this.buildSummary(results, pageContext)
    };
  }

  /**
   * 生成页面感知的 prompt 片段
   */
  toPrompt(pageContext) {
    const analysis = this.analyze(pageContext);
    if (analysis.types.length === 0) return '';

    let prompt = `\n页面感知结果：\n`;
    analysis.types.forEach(t => {
      prompt += `- ${t.icon} ${t.label}`;
      if (t.languages) prompt += ` (语言: ${t.languages.join(', ')})`;
      if (t.endpoints) prompt += ` (${t.endpoints.length} 个端点)`;
      if (t.errors) prompt += ` (发现 ${t.errors.length} 个错误)`;
      if (t.type === 'youtube' && t.videoId) prompt += ` (视频ID: ${t.videoId})`;
      if (t.type === 'youtube' && t.channel) prompt += ` (频道: ${t.channel})`;
      if (t.type === 'github-repo') prompt += ` (${t.owner}/${t.repo}, ${t.pageType})`;
      if (t.type === 'pdf') prompt += ` (PDF 文档)`;
      prompt += '\n';
    });

    return prompt;
  }

  /**
   * 根据页面类型推荐技能
   */
  suggestSkills(pageContext, _skillEngine) {
    const analysis = this.analyze(pageContext);
    const suggestions = [];

    for (const type of analysis.types) {
      switch (type.type) {
        case 'code-snippet':
          suggestions.push({ skillId: 'code-explain', reason: '页面包含代码，可以解释' });
          suggestions.push({ skillId: 'code-review', reason: '可以对代码进行审查' });
          break;
        case 'error-page':
          suggestions.push({ skillId: 'error-diagnose', reason: '发现错误信息，可以诊断' });
          break;
        case 'api-doc':
          suggestions.push({ skillId: 'api-summarize', reason: 'API 文档，可以生成摘要' });
          break;
        case 'youtube':
          suggestions.push({ skillId: 'video-summarize', reason: 'YouTube 视频，可以总结内容' });
          break;
        case 'github-repo':
          suggestions.push({ skillId: 'repo-analyze', reason: 'GitHub 仓库，可以分析仓库结构' });
          break;
        case 'pdf':
          suggestions.push({ skillId: 'pdf-analyze', reason: 'PDF 文档，可以分析内容' });
          break;
      }
    }

    return suggestions;
  }

  buildSummary(types, _ctx) {
    const labels = types.map(t => t.label).join('、');
    return `页面类型：${labels || '通用'}`;
  }
}
