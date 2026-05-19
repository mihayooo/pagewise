/**
 * BookmarkGraphEngine — 书签图谱引擎
 * 从 bookmark-graph.js 拆分
 *
 * 混合相似度算法 (Jaccard + 域名匹配 + 文件夹重叠)
 * 倒排索引优化候选对生成 (避免 O(n²))
 */

export class BookmarkGraphEngine {
  constructor() {
    this._bookmarkStore = new Map();
    this._tokenIndex = new Map();
    this._domainIndex = new Map();
    this._folderIndex = new Map();
    this._adjacency = new Map();
    this._graph = { nodes: [], edges: [] };
    this._threshold = 0.1;
  }

  buildGraph(bookmarks) {
    this._bookmarkStore.clear();
    this._tokenIndex.clear();
    this._domainIndex.clear();
    this._folderIndex.clear();
    this._adjacency.clear();
    this._graph = { nodes: [], edges: [] };
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return this._graph;

    for (const bm of bookmarks) {
      if (!bm || !bm.id) continue;
      const id = String(bm.id);
      this._bookmarkStore.set(id, bm);
      this._adjacency.set(id, new Set());
      for (const token of this._tokenizeTitle(bm.title || '')) {
        let entry = this._tokenIndex.get(token);
        if (!entry) { entry = new Set(); this._tokenIndex.set(token, entry); }
        entry.add(id);
      }
      const domain = this._extractDomain(bm.url || '');
      if (domain) {
        let dEntry = this._domainIndex.get(domain);
        if (!dEntry) { dEntry = new Set(); this._domainIndex.set(domain, dEntry); }
        dEntry.add(id);
      }
      const folderKey = this._getFolderKey(bm.folderPath);
      if (folderKey) {
        let fEntry = this._folderIndex.get(folderKey);
        if (!fEntry) { fEntry = new Set(); this._folderIndex.set(folderKey, fEntry); }
        fEntry.add(id);
      }
    }

    const edgeMap = new Map();
    const allIds = [...this._bookmarkStore.keys()];
    for (const [, idSet] of this._tokenIndex) { const ids = [...idSet]; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) this._maybeAddEdge(ids[i], ids[j], edgeMap); }
    for (const [, idSet] of this._domainIndex) { const ids = [...idSet]; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) this._maybeAddEdge(ids[i], ids[j], edgeMap); }
    for (const [, idSet] of this._folderIndex) { const ids = [...idSet]; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) this._maybeAddEdge(ids[i], ids[j], edgeMap); }

    const edges = [];
    for (const [key, weight] of edgeMap) {
      if (weight < this._threshold) continue;
      const [source, target] = key.split('\x00');
      edges.push({ source, target, weight });
      this._adjacency.get(source)?.add(target);
      this._adjacency.get(target)?.add(source);
    }

    const nodes = allIds.map(id => {
      const bm = this._bookmarkStore.get(id);
      const connCount = this._adjacency.get(id)?.size || 0;
      return { id, label: bm.title || bm.url || id, group: this._assignGroup(bm), size: 1 + Math.min(connCount, 20), data: bm };
    });

    this._graph = { nodes, edges };
    return this._graph;
  }

  similarity(a, b) {
    const bmA = typeof a === 'string' ? this._bookmarkStore.get(a) : a;
    const bmB = typeof b === 'string' ? this._bookmarkStore.get(b) : b;
    if (!bmA || !bmB) return 0;
    const tokensA = this._tokenizeTitle(bmA.title || '');
    const tokensB = this._tokenizeTitle(bmB.title || '');
    const jaccard = this._jaccard(tokensA, tokensB);
    const domainA = this._extractDomain(bmA.url || '');
    const domainB = this._extractDomain(bmB.url || '');
    const domainMatch = (domainA && domainB && domainA === domainB) ? 1 : 0;
    const folderOverlap = this._folderOverlapScore(bmA.folderPath || [], bmB.folderPath || []);
    return 0.4 * jaccard + 0.3 * domainMatch + 0.3 * folderOverlap;
  }

  getSimilar(bookmarkId, topK = 5) {
    const id = String(bookmarkId);
    const bm = this._bookmarkStore.get(id);
    if (!bm) return [];
    const neighbors = this._adjacency.get(id);
    const scored = [];
    if (neighbors && neighbors.size > 0) {
      for (const nId of neighbors) { scored.push({ id: nId, score: this.similarity(id, nId), bookmark: this._bookmarkStore.get(nId) }); }
    } else {
      for (const [otherId] of this._bookmarkStore) {
        if (otherId === id) continue;
        const score = this.similarity(id, otherId);
        if (score > 0) scored.push({ id: otherId, score, bookmark: this._bookmarkStore.get(otherId) });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  getGraphData() { return { nodes: [...this._graph.nodes], edges: [...this._graph.edges] }; }

  getClusters() {
    const byDomain = new Map(), byFolder = new Map();
    for (const [id, bm] of this._bookmarkStore) {
      const domain = this._extractDomain(bm.url || '');
      if (domain) { if (!byDomain.has(domain)) byDomain.set(domain, []); byDomain.get(domain).push({ id, title: bm.title, url: bm.url }); }
      const folderKey = this._getFolderKey(bm.folderPath);
      if (folderKey) { if (!byFolder.has(folderKey)) byFolder.set(folderKey, []); byFolder.get(folderKey).push({ id, title: bm.title, url: bm.url }); }
    }
    return { byDomain, byFolder };
  }

  _maybeAddEdge(id1, id2, edgeMap) {
    const key = id1 < id2 ? `${id1}\x00${id2}` : `${id2}\x00${id1}`;
    if (edgeMap.has(key)) return;
    edgeMap.set(key, this.similarity(id1, id2));
  }

  _jaccard(setA, setB) {
    if (setA.length === 0 && setB.length === 0) return 0;
    const a = new Set(setA), b = new Set(setB);
    let intersection = 0;
    for (const item of a) { if (b.has(item)) intersection++; }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  _folderOverlapScore(pathA, pathB) {
    if (!pathA || !pathB || pathA.length === 0 || pathB.length === 0) return 0;
    const maxLen = Math.max(pathA.length, pathB.length);
    let common = 0;
    for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
      if (pathA[i] === pathB[i]) common++; else break;
    }
    return common / maxLen;
  }

  _tokenizeTitle(title) {
    if (!title || typeof title !== 'string') return [];
    const tokens = [];
    const segments = title.match(/[一-鿿]|[a-zA-Z]+|[0-9]+/g) || [];
    for (const seg of segments) {
      if (/[一-鿿]/.test(seg)) { for (const char of seg) tokens.push(char); }
      else if (/[a-zA-Z]/.test(seg)) tokens.push(seg.toLowerCase());
      else tokens.push(seg);
    }
    return tokens;
  }

  _extractDomain(url) {
    if (!url) return '';
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
  }

  _getFolderKey(folderPath) {
    if (!folderPath || !Array.isArray(folderPath) || folderPath.length === 0) return '';
    return folderPath.join('/');
  }

  _assignGroup(bm) {
    if (bm.folderPath && bm.folderPath.length > 0) return bm.folderPath[0];
    const domain = this._extractDomain(bm.url || '');
    if (domain) return domain;
    return 'default';
  }
}
