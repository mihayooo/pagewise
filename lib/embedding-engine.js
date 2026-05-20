/**
 * EmbeddingEngine — TF-IDF 加权嵌入引擎
 *
 * 迭代 #7: 语义搜索 (Embedding) — 知识库从"存了找不到"变为可用
 *
 * 设计决策:
 *   D026: TF-IDF 而非神经网络 Embedding — 纯 JS 零依赖
 *   D027: 字符级中文 bigram — 无需词典
 *   D028: 文档向量缓存 — 避免重复计算
 *   D029: 独立类 — 单一职责，可独立测试
 *   D030: 停用词表内嵌 — 避免外部依赖
 */

// ==================== 停用词表 ====================

const ENGLISH_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "need", "dare",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
  "neither", "each", "every", "all", "any", "few", "more", "most",
  "other", "some", "such", "no", "only", "own", "same", "than",
  "too", "very", "just", "because", "if", "when", "where", "how",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "it", "its", "i", "me", "my", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "they", "them", "their",
]);

const CHINESE_STOPCHARS = new Set([
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人",
  "都", "一", "上", "也", "很", "到", "说", "要", "去", "你",
  "会", "着", "看", "好", "自", "这", "他", "她", "它", "们",
  "那", "些", "吗", "呢", "吧", "啊", "嗯", "哦",
]);

const CHINESE_STOPWORDS_BIGRAM = new Set([
  "这是", "不是", "可以", "可能", "已经", "但是", "然而", "因此",
  "因为", "所以", "如果", "虽然", "那么", "这个", "那个", "什么",
  "没有", "我们", "他们", "她们", "它们", "你们", "这里", "那里",
  "如何", "怎么", "怎样", "哪些", "一些", "这些", "那些", "所有",
]);

export class EmbeddingEngine {
  static FIELD_WEIGHTS = {
    title: 3.0,
    summary: 2.0,
    tags: 2.0,
    question: 1.5,
    answer: 1.0,
    content: 0.5,
  };

  constructor() {
    this._vocabulary = new Map();
    this._docCount = 0;
    this._vectorCache = new Map();
  }

  tokenize(text) {
    if (!text || typeof text !== "string") return [];

    const normalized = text
      .toLowerCase()
      .replace(/[\x00-\x1f]+/g, " ")
      .replace(/[^\w一-鿿㐀-䶿\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return [];

    const tokens = [];
    const segments = normalized.split(/\s+/).filter(Boolean);

    for (const segment of segments) {
      if (!segment) continue;
      const hasChinese = /[一-鿿㐀-䶿]/.test(segment);

      if (hasChinese) {
        const parts = segment.split(/([一-鿿㐀-䶿]+)/).filter(Boolean);
        for (const part of parts) {
          if (/[一-鿿㐀-䶿]/.test(part)) {
            this._tokenizeChinese(part, tokens);
          } else {
            this._tokenizeEnglish(part, tokens);
          }
        }
      } else {
        this._tokenizeEnglish(segment, tokens);
      }
    }

    return [...new Set(tokens)];
  }

  _tokenizeChinese(text, tokens) {
    const chars = [...text];
    if (chars.length === 0) return;

    if (chars.length === 1) {
      if (!CHINESE_STOPCHARS.has(chars[0])) {
        tokens.push(chars[0]);
      }
      return;
    }

    for (let i = 0; i < chars.length - 1; i++) {
      const gram = chars[i] + chars[i + 1];
      if (!CHINESE_STOPCHARS.has(chars[i]) &&
          !CHINESE_STOPCHARS.has(chars[i + 1]) &&
          !CHINESE_STOPWORDS_BIGRAM.has(gram)) {
        tokens.push(gram);
      }
    }
  }

  _tokenizeEnglish(text, tokens) {
    const words = text.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const clean = word.replace(/[^a-z0-9]/g, "");
      if (!clean || clean.length < 2) continue;

      if (!ENGLISH_STOPWORDS.has(clean)) {
        tokens.push(clean);
        if (clean.length > 2) {
          for (let i = 0; i < clean.length - 1; i++) {
            tokens.push(clean.substring(i, i + 2));
          }
        }
      }
    }
  }

  // ==================== IDF ====================

  buildVocabulary(entries) {
    this._vocabulary = new Map();
    this._docCount = entries.length;
    this._vectorCache.clear();

    // Pass 1: Build IDF vocabulary
    for (const entry of entries) {
      const text = this._getEntryFullText(entry);
      const tokens = new Set(this.tokenize(text));
      for (const token of tokens) {
        this._vocabulary.set(token, (this._vocabulary.get(token) || 0) + 1);
      }
    }

    // Pass 2: Pre-compute document vectors (avoids repeated computation during search)
    for (const entry of entries) {
      this.generateDocumentVector(entry);
    }
  }

  _getEntryFullText(entry) {
    return [
      entry.title || "",
      entry.summary || "",
      entry.question || "",
      entry.answer || "",
      (entry.tags || []).join(" "),
      entry.content || "",
    ].join(" ");
  }

  idf(term) {
    const df = this._vocabulary.get(term) || 0;
    return Math.log(this._docCount + 1) - Math.log(1 + df);
  }

  // ==================== 向量生成 ====================

  generateVector(text) {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return new Map();

    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    const totalTokens = tokens.length;

    const vec = new Map();
    for (const [term, count] of Object.entries(tf)) {
      const tfVal = count / totalTokens;
      const idfVal = this._docCount > 0 ? this.idf(term) : 1;
      const weight = tfVal * idfVal;
      if (weight > 0) vec.set(term, weight);
    }

    return vec;
  }

  generateDocumentVector(entry) {
    if (entry.id !== null && this._vectorCache.has(entry.id)) {
      return this._vectorCache.get(entry.id);
    }

    const fieldWeights = EmbeddingEngine.FIELD_WEIGHTS;
    const termWeights = {};

    for (const [field, weight] of Object.entries(fieldWeights)) {
      const text = entry[field];
      if (!text) continue;

      const fieldText = Array.isArray(text) ? text.join(" ") : text;
      const tokens = this.tokenize(fieldText);
      if (tokens.length === 0) continue;

      const fieldTf = {};
      for (const t of tokens) fieldTf[t] = (fieldTf[t] || 0) + 1;
      const totalTokens = tokens.length;

      for (const [term, count] of Object.entries(fieldTf)) {
        const tfVal = count / totalTokens;
        const idfVal = this._docCount > 0 ? this.idf(term) : 1;
        const w = tfVal * idfVal * weight;
        if (w > 0) termWeights[term] = (termWeights[term] || 0) + w;
      }
    }

    const vec = new Map();
    for (const [term, w] of Object.entries(termWeights)) vec.set(term, w);

    if (entry.id !== null) this._vectorCache.set(entry.id, vec);
    return vec;
  }

  invalidateCache(entryId) {
    this._vectorCache.delete(entryId);
  }

  // ==================== 余弦相似度 ====================

  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.size === 0 || vec2.size === 0) return 0;

    const [smaller, larger] = vec1.size <= vec2.size ? [vec1, vec2] : [vec2, vec1];

    let dotProduct = 0;
    for (const [term, w1] of smaller) {
      const w2 = larger.get(term);
      if (w2 !== undefined) dotProduct += w1 * w2;
    }

    if (dotProduct === 0) return 0;

    let mag1 = 0;
    for (const [, w] of vec1) mag1 += w * w;
    let mag2 = 0;
    for (const [, w] of vec2) mag2 += w * w;

    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  // ==================== 搜索 ====================

  search(query, entries, limit = 20) {
    if (!query || !entries || entries.length === 0) return [];

    const queryVec = this.generateVector(query);
    if (queryVec.size === 0) return [];

    const scored = [];
    for (const entry of entries) {
      const docVec = this.generateDocumentVector(entry);
      if (docVec.size === 0) continue;

      const score = this.cosineSimilarity(queryVec, docVec);
      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ==================== Static 兼容接口 ====================

  static tokenize(text) {
    return new EmbeddingEngine().tokenize(text);
  }

  static calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;

    const engine = new EmbeddingEngine();
    const vec1 = engine.generateVector(text1);
    const vec2 = engine.generateVector(text2);
    return engine.cosineSimilarity(vec1, vec2);
  }

  static semanticSearch(query, entries, limit = 20) {
    const engine = new EmbeddingEngine();
    if (entries && entries.length > 0) engine.buildVocabulary(entries);
    return engine.search(query, entries, limit);
  }
}
