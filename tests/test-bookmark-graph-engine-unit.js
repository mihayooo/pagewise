import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { BookmarkGraphEngine } from '../lib/bookmark-graph-engine.js'

describe('BookmarkGraphEngine', () => {
  let engine
  const sampleBookmarks = [
    { id: '1', title: 'React Tutorial', url: 'https://react.dev/learn', folderPath: ['Dev', 'Frontend'] },
    { id: '2', title: 'React Hooks Guide', url: 'https://react.dev/hooks', folderPath: ['Dev', 'Frontend'] },
    { id: '3', title: 'Python Docs', url: 'https://python.org/docs', folderPath: ['Dev', 'Backend'] },
    { id: '4', title: 'Vue Tutorial', url: 'https://vuejs.org/guide', folderPath: ['Dev', 'Frontend'] },
    { id: '5', title: 'Python Tutorial', url: 'https://python.org/tutorial', folderPath: ['Dev', 'Backend'] },
  ]

  beforeEach(() => {
    engine = new BookmarkGraphEngine()
  })

  describe('constructor', () => {
    it('should initialize with empty state', () => {
      assert.equal(engine._bookmarkStore.size, 0)
      assert.equal(engine._threshold, 0.1)
    })
  })

  describe('buildGraph', () => {
    it('should handle null/empty input', () => {
      const graph = engine.buildGraph(null)
      assert.deepEqual(graph, { nodes: [], edges: [] })
    })

    it('should handle empty array', () => {
      const graph = engine.buildGraph([])
      assert.deepEqual(graph, { nodes: [], edges: [] })
    })

    it('should build nodes for valid bookmarks', () => {
      const graph = engine.buildGraph(sampleBookmarks)
      assert.equal(graph.nodes.length, 5)
    })

    it('should skip bookmarks without id', () => {
      const graph = engine.buildGraph([...sampleBookmarks, { title: 'No ID', url: 'https://x.com' }])
      assert.equal(graph.nodes.length, 5)
    })

    it('should create edges between similar bookmarks', () => {
      const graph = engine.buildGraph(sampleBookmarks)
      // React Tutorial and React Hooks Guide should be connected
      assert.ok(graph.edges.length > 0)
    })

    it('should assign node properties correctly', () => {
      const graph = engine.buildGraph(sampleBookmarks)
      const node = graph.nodes.find(n => n.id === '1')
      assert.equal(node.label, 'React Tutorial')
      assert.ok(node.size >= 1)
      assert.ok(node.group)
      assert.equal(node.data.id, '1')
    })

    it('should clear previous state on rebuild', () => {
      engine.buildGraph(sampleBookmarks)
      engine.buildGraph([{ id: 'new', title: 'New', url: 'https://new.com' }])
      const graph = engine.getGraphData()
      assert.equal(graph.nodes.length, 1)
    })
  })

  describe('similarity', () => {
    beforeEach(() => {
      engine.buildGraph(sampleBookmarks)
    })

    it('should return higher similarity for same-domain bookmarks', () => {
      const sim = engine.similarity('1', '2') // both react.dev
      assert.ok(sim > 0)
    })

    it('should return 0 for unknown bookmarks', () => {
      assert.equal(engine.similarity('999', '1'), 0)
      assert.equal(engine.similarity('1', '999'), 0)
    })

    it('should accept bookmark objects directly', () => {
      const sim = engine.similarity(
        { title: 'Test A', url: 'https://x.com', folderPath: ['F'] },
        { title: 'Test A', url: 'https://x.com', folderPath: ['F'] }
      )
      assert.ok(sim > 0)
    })

    it('should return similarity for bookmarks with overlapping folders', () => {
      const sim = engine.similarity('3', '5') // both Python, same folder
      assert.ok(sim > 0)
    })
  })

  describe('getSimilar', () => {
    beforeEach(() => {
      engine.buildGraph(sampleBookmarks)
    })

    it('should return similar bookmarks', () => {
      const similar = engine.getSimilar('1', 3)
      assert.ok(similar.length > 0)
      assert.ok(similar[0].score > 0)
    })

    it('should respect topK limit', () => {
      const similar = engine.getSimilar('1', 1)
      assert.ok(similar.length <= 1)
    })

    it('should return empty for unknown bookmark', () => {
      assert.deepEqual(engine.getSimilar('999'), [])
    })

    it('should not include self', () => {
      const similar = engine.getSimilar('1', 10)
      assert.ok(!similar.some(s => s.id === '1'))
    })
  })

  describe('getGraphData', () => {
    it('should return copy of graph data', () => {
      engine.buildGraph(sampleBookmarks)
      const data = engine.getGraphData()
      assert.equal(data.nodes.length, 5)
      // Modifying returned data shouldn't affect engine
      data.nodes.push({ id: 'extra' })
      assert.equal(engine.getGraphData().nodes.length, 5)
    })
  })

  describe('getClusters', () => {
    it('should group bookmarks by domain and folder', () => {
      engine.buildGraph(sampleBookmarks)
      const clusters = engine.getClusters()
      assert.ok(clusters.byDomain.size > 0)
      assert.ok(clusters.byFolder.size > 0)
    })

    it('should return empty clusters for no bookmarks', () => {
      const clusters = engine.getClusters()
      assert.equal(clusters.byDomain.size, 0)
      assert.equal(clusters.byFolder.size, 0)
    })
  })

  describe('internal methods', () => {
    it('_tokenizeTitle should tokenize Chinese + English', () => {
      const tokens = engine._tokenizeTitle('Hello 世界 Test')
      assert.ok(tokens.includes('hello'))
      assert.ok(tokens.includes('test'))
      assert.ok(tokens.includes('世'))
      assert.ok(tokens.includes('界'))
    })

    it('_tokenizeTitle should handle empty/null', () => {
      assert.deepEqual(engine._tokenizeTitle(''), [])
      assert.deepEqual(engine._tokenizeTitle(null), [])
    })

    it('_extractDomain should extract domain from URL', () => {
      assert.equal(engine._extractDomain('https://www.example.com/path'), 'example.com')
      assert.equal(engine._extractDomain(''), '')
      assert.equal(engine._extractDomain(null), '')
      assert.equal(engine._extractDomain('not-url'), '')
    })

    it('_getFolderKey should join path', () => {
      assert.equal(engine._getFolderKey(['A', 'B']), 'A/B')
      assert.equal(engine._getFolderKey([]), '')
      assert.equal(engine._getFolderKey(null), '')
    })

    it('_jaccard should compute Jaccard coefficient', () => {
      assert.equal(engine._jaccard([], []), 0)
      assert.equal(engine._jaccard(['a', 'b'], ['a', 'b']), 1)
      assert.ok(Math.abs(engine._jaccard(['a', 'b'], ['a', 'c']) - 1/3) < 0.01)
    })

    it('_folderOverlapScore should compute overlap ratio', () => {
      assert.equal(engine._folderOverlapScore(['A', 'B'], ['A', 'B']), 1)
      assert.equal(engine._folderOverlapScore(['A', 'B'], ['C', 'D']), 0)
      assert.ok(Math.abs(engine._folderOverlapScore(['A', 'B'], ['A', 'C']) - 0.5) < 0.01)
      assert.equal(engine._folderOverlapScore([], ['A']), 0)
      assert.equal(engine._folderOverlapScore(null, ['A']), 0)
    })

    it('_assignGroup should use first folder or domain', () => {
      assert.equal(engine._assignGroup({ folderPath: ['MyFolder', 'Sub'] }), 'MyFolder')
      assert.equal(engine._assignGroup({ url: 'https://example.com' }), 'example.com')
      assert.equal(engine._assignGroup({}), 'default')
    })
  })
})
