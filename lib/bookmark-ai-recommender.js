/**
 * BookmarkAIRecommendations — AI 智能推荐
 *
 * 分析用户收藏模式，调用 LLM 获取个性化学习推荐。
 *
 * 收藏画像分析已拆分至 bookmark-ai-recommender-profile.js (ProfileAnalyzer)
 *
 * 三种推荐类型:
 *   - pattern:      基于收藏模式的学习建议
 *   - gap-filling:  知识盲区领域的入门资源
 *   - depth:        已学领域的进阶方向
 *
 * 纯 ES Module，不依赖 DOM 或 Chrome API。
 * AIClient 通过构造函数注入 (依赖反转)。
 */

import { ProfileAnalyzer } from './bookmark-ai-recommender-profile.js'

// ==================== 常量 ====================

/** 缓存 TTL: 30 分钟 */
const DEFAULT_CACHE_TTL = 30 * 60 * 1000

/** Prompt 模板 — 系统角色 */
const SYSTEM_PROMPT = `你是一位资深技术学习顾问。你的任务是根据用户的技术书签收藏画像，为其推荐下一步学习方向。

要求:
1. 返回严格 JSON 格式，不要包含 markdown 代码块标记
2. 推荐 3-8 条，每条包含 type/category/summary/reason/suggestedTopics/confidence 字段
3. reason 至少 20 个中文字符
4. summary 不超过 50 字
5. suggestedTopics 为 1-3 个具体主题
6. confidence 为 0-1 之间的浮点数
7. type 为 "pattern" (收藏模式建议) / "gap-filling" (盲区入门) / "depth" (深度进阶)`

// ==================== BookmarkAIRecommendations ====================

/** BookmarkAIRecommendations 类 */
export class BookmarkAIRecommendations {
  /**
   * @param {Object} options
   * @param {Object}  options.aiClient         — AIClient 实例 (必需)
   * @param {Object}  [options.recommender]    — BookmarkRecommender 实例 (降级用)
   * @param {Object}  [options.clusterer]      — BookmarkClusterer 实例 (可选)
   * @param {Object}  [options.gapDetector]    — BookmarkGapDetector 实例 (可选)
   * @param {Object}  [options.learningPath]   — BookmarkLearningPath 实例 (可选)
   * @param {Object}  [options.progress]       — BookmarkLearningProgress 实例 (可选)
   * @param {number}  [options.cacheTtl]       — 缓存 TTL 毫秒 (默认 30min)
   */
  constructor(options = {}) {
    if (!options.aiClient) {
      throw new Error('BookmarkAIRecommendations requires an AIClient instance')
    }

    this._aiClient = options.aiClient
    this._recommender = options.recommender || null
    this._clusterer = options.clusterer || null
    this._gapDetector = options.gapDetector || null
    this._learningPath = options.learningPath || null
    this._progress = options.progress || null

    this._cacheTtl = options.cacheTtl ?? DEFAULT_CACHE_TTL
    this._profileAnalyzer = new ProfileAnalyzer()

    // --- 内部状态 ---
    this._cachedResult = null
    this._cacheTime = 0
    this._cachedProfile = null
    this._lastSource = null
    this._bookmarks = []
  }

  // ==================== 公共 API ====================

  /**
   * 分析用户收藏模式，生成结构化画像（委托到 ProfileAnalyzer）。
   */
  analyzeProfile(bookmarks, context = {}) {
    if (!Array.isArray(bookmarks)) {
      throw new Error('bookmarks must be an array')
    }
    this._bookmarks = bookmarks
    const profile = this._profileAnalyzer.analyzeProfile(bookmarks, context)
    this._cachedProfile = profile
    return profile
  }

  /**
   * 获取 AI 智能推荐
   */
  async getRecommendations(context = {}) {
    if (this._cachedResult && this._isCacheValid()) {
      this._lastSource = 'cache'
      return { ...this._cachedResult, source: 'cache' }
    }

    const profile = this._cachedProfile || this.analyzeProfile(this._bookmarks, context)

    try {
      const result = await this._getAIRecommendations(profile)
      this._cachedResult = result
      this._cacheTime = Date.now()
      this._lastSource = 'ai'
      return result
    } catch (_err) {
      return this._fallbackRecommend(profile, context)
    }
  }

  /**
   * 清除推荐缓存
   */
  clearCache() {
    this._cachedResult = null
    this._cacheTime = 0
  }

  /**
   * 获取上次推荐的来源
   */
  getLastSource() {
    return this._lastSource
  }

  // ==================== AI 推荐 ====================

  async _getAIRecommendations(profile) {
    const prompt = this._buildPrompt(profile)

    const response = await this._aiClient.chat(
      [{ role: 'user', content: prompt }],
      { systemPrompt: SYSTEM_PROMPT }
    )

    const content = response.content || ''
    const recommendations = this._parseAIResponse(content)

    if (recommendations.length === 0) {
      throw new Error('AI returned empty or invalid recommendations')
    }

    return {
      recommendations,
      profile,
      source: 'ai',
      generatedAt: Date.now(),
      model: response.model || 'unknown',
      promptTokens: response.usage?.prompt_tokens || response.usage?.input_tokens || 0,
    }
  }

  _buildPrompt(profile) {
    const summary = {
      totalBookmarks: profile.totalBookmarks,
      topDomains: profile.topDomains.map(d => `${d.domain}(${d.count})`),
      topCategories: profile.topCategories.map(c => `${c.category}(${c.count})`),
      strengths: profile.strengths,
      gaps: profile.gaps,
      recentFocus: profile.recentFocus.map(r => `${r.category}(${r.count})`),
      readingProgress: `已读${profile.readingProgress.read}/在读${profile.readingProgress.reading}/未读${profile.readingProgress.unread}`,
      difficulty: `入门${profile.difficultyDistribution.beginner}/进阶${profile.difficultyDistribution.intermediate}/高级${profile.difficultyDistribution.advanced}`,
    }

    return `以下是用户的技术书签收藏画像:

${JSON.stringify(summary, null, 2)}

请基于此画像为用户推荐 3-8 条学习建议，返回严格 JSON 格式:
{
  "recommendations": [
    {
      "type": "pattern|gap-filling|depth",
      "category": "领域名",
      "summary": "建议概述（不超过50字）",
      "reason": "推荐理由（至少20个中文字符的详细说明）",
      "suggestedTopics": ["具体主题1", "具体主题2"],
      "confidence": 0.85
    }
  ]
}`
  }

  _parseAIResponse(content) {
    if (!content || typeof content !== 'string') return []

    let jsonStr = content.trim()
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    jsonStr = jsonStr.trim()

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return []
    }

    if (!parsed || !Array.isArray(parsed.recommendations)) return []

    const valid = []
    for (const rec of parsed.recommendations) {
      if (!rec || typeof rec !== 'object') continue
      if (!['pattern', 'gap-filling', 'depth'].includes(rec.type)) continue
      if (typeof rec.category !== 'string' || !rec.category) continue
      if (typeof rec.summary !== 'string' || !rec.summary) continue
      if (typeof rec.reason !== 'string' || rec.reason.length < 20) continue

      let topics = rec.suggestedTopics
      if (!Array.isArray(topics)) topics = []
      topics = topics.filter(t => typeof t === 'string').slice(0, 3)
      if (topics.length === 0) continue

      let confidence = rec.confidence
      if (typeof confidence !== 'number' || isNaN(confidence)) confidence = 0.5
      confidence = Math.max(0, Math.min(1, confidence))

      valid.push({
        type: rec.type,
        category: rec.category,
        summary: rec.summary.slice(0, 50),
        reason: rec.reason,
        suggestedTopics: topics,
        confidence,
      })
    }

    return valid.slice(0, 8)
  }

  // ==================== 降级推荐 ====================

  _fallbackRecommend(profile, _context) {
    const recommendations = []

    for (const gap of profile.gaps.slice(0, 3)) {
      recommendations.push({
        type: 'gap-filling',
        category: gap,
        summary: `建议补充「${gap}」领域的基础知识`,
        reason: `您的收藏中「${gap}」领域覆盖不足，作为技术学习者，补充此领域有助于构建更完整的知识体系，避免技术栈单一化。`,
        suggestedTopics: [`${gap} 入门教程`, `${gap} 实战指南`],
        confidence: 0.7,
      })
    }

    for (const strength of profile.strengths.slice(0, 2)) {
      recommendations.push({
        type: 'depth',
        category: strength,
        summary: `「${strength}」领域可深入学习进阶主题`,
        reason: `您在「${strength}」领域已有较好的收藏基础，建议进一步探索高级主题以提升技术深度，从应用层面向底层原理过渡。`,
        suggestedTopics: [`${strength} 架构设计`, `${strength} 性能优化`],
        confidence: 0.6,
      })
    }

    if (profile.topCategories.length >= 2) {
      const top1 = profile.topCategories[0].category
      const top2 = profile.topCategories[1]?.category
      if (top2) {
        recommendations.push({
          type: 'pattern',
          category: top1,
          summary: `建议关注「${top1}」与「${top2}」的交叉领域`,
          reason: `您的收藏集中在「${top1}」和「${top2}」两个领域，探索两者的交叉应用可以帮助您建立更全面的技术视野和解决复杂问题的能力。`,
          suggestedTopics: [`${top1}与${top2}集成`, `全栈${top1}实践`],
          confidence: 0.5,
        })
      }
    }

    const result = {
      recommendations,
      profile,
      source: 'fallback',
      generatedAt: Date.now(),
      model: 'rule-based',
      promptTokens: 0,
    }

    this._cachedResult = result
    this._cacheTime = Date.now()
    this._lastSource = 'fallback'
    return result
  }

  // ==================== 内部工具 ====================

  _isCacheValid() {
    if (!this._cachedResult) return false
    return (Date.now() - this._cacheTime) < this._cacheTtl
  }
}
