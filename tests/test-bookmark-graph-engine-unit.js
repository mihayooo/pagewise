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

// ==================== R187 补充测试 ====================

describe('BookmarkGraphEngine (R187 补充)', () => {
  let engine
  beforeEach(() => { engine = new BookmarkGraphEngine() })

  describe('similarity 边界情况', () => {
    it('similarity 两个完全相同的书签应有高分', () => {
      engine.buildGraph(sampleBookmarks)
      const sim = engine.similarity('1', '1')
      assert.ok(sim > 0.5, `相同书签相似度应 > 0.5: ${sim}`)
    })

    it('similarity 完全不同的书签应有低分', () => {
      const bms = [
        { id: '1', title: 'AAA BBB', url: 'https://aaa.com', folderPath: ['X'] },
        { id: '2', title: 'CCC DDD', url: 'https://ccc.com', folderPath: ['Y'] },
      ]
      engine.buildGraph(bms)
      const sim = engine.similarity('1', '2')
      assert.equal(sim, 0, `完全不同书签相似度应为 0: ${sim}`)
    })

    it('similarity 应支持对象和 ID 混合调用', () => {
      engine.buildGraph(sampleBookmarks)
      const byId = engine.similarity('1', '2')
      const byObj = engine.similarity(
        sampleBookmarks[0],
        sampleBookmarks[1],
      )
      assert.equal(byId, byObj, '对象调用和 ID 调用结果应一致')
    })

    it('similarity 相同域名应提升分数', () => {
      const bms = [
        { id: '1', title: 'Page A', url: 'https://react.dev/a', folderPath: ['X'] },
        { id: '2', title: 'Page B', url: 'https://react.dev/b', folderPath: ['Y'] },
        { id: '3', title: 'Page C', url: 'https://other.com/c', folderPath: ['Z'] },
      ]
      engine.buildGraph(bms)
      const sameDomain = engine.similarity('1', '2')
      const diffDomain = engine.similarity('1', '3')
      assert.ok(sameDomain > diffDomain, `同域名相似度应更高: ${sameDomain} > ${diffDomain}`)
    })
  })

  describe('buildGraph 边界情况', () => {
    it('buildGraph 应跳过 null 数组元素', () => {
      const graph = engine.buildGraph([
        { id: '1', title: 'A', url: 'https://a.com' },
        null,
        { id: '2', title: 'B', url: 'https://b.com' },
      ])
      assert.equal(graph.nodes.length, 2)
    })

    it('buildGraph 应为无标题书签使用 URL 作为 label', () => {
      const graph = engine.buildGraph([
        { id: '1', url: 'https://example.com' },
      ])
      assert.equal(graph.nodes[0].label, 'https://example.com')
    })

    it('buildGraph 应为无标题无 URL 书签使用 ID 作为 label', () => {
      const graph = engine.buildGraph([
        { id: '1' },
      ])
      assert.equal(graph.nodes[0].label, '1')
    })

    it('buildGraph edge 权重应 >= 阈值', () => {
      engine.buildGraph(sampleBookmarks)
      const graph = engine.getGraphData()
      for (const edge of graph.edges) {
        assert.ok(edge.weight >= engine._threshold, `edge weight ${edge.weight} 应 >= ${engine._threshold}`)
      }
    })

    it('buildGraph 应建立邻接表 (双向)', () => {
      engine.buildGraph(sampleBookmarks)
      const graph = engine.getGraphData()
      if (graph.edges.length > 0) {
        const firstEdge = graph.edges[0]
        const neighborsA = engine._adjacency.get(firstEdge.source)
        const neighborsB = engine._adjacency.get(firstEdge.target)
        assert.ok(neighborsA?.has(firstEdge.target), 'source 应包含 target 作为邻居')
        assert.ok(neighborsB?.has(firstEdge.source), 'target 应包含 source 作为邻居')
      }
    })

    it('buildGraph node.size 应反映连接数', () => {
      engine.buildGraph(sampleBookmarks)
      const graph = engine.getGraphData()
      for (const node of graph.nodes) {
        const connCount = engine._adjacency.get(node.id)?.size || 0
        const expectedSize = 1 + Math.min(connCount, 20)
        assert.equal(node.size, expectedSize, `node ${node.id} size 应为 1 + min(连接数, 20)`)
      }
    })
  })

  describe('getSimilar 边界情况', () => {
    it('getSimilar 结果应按分数降序', () => {
      engine.buildGraph(sampleBookmarks)
      const similar = engine.getSimilar('1', 5)
      for (let i = 1; i < similar.length; i++) {
        assert.ok(
          similar[i - 1].score >= similar[i].score,
          `应按分数降序: ${similar[i - 1].score} >= ${similar[i].score}`,
        )
      }
    })

    it('getSimilar 无邻居时应遍历所有书签计算相似度', () => {
      // 用完全不同的书签, 使图中无边
      const bms = [
        { id: '1', title: 'AAA', url: 'https://a.com', folderPath: ['X'] },
        { id: '2', title: 'BBB', url: 'https://b.com', folderPath: ['Y'] },
      ]
      engine.buildGraph(bms)
      // 无邻居时 fallback 到全局遍历
      const similar = engine.getSimilar('1', 5)
      // AAA 和 BBB 无共同 token, 无共同域名, 无共同文件夹 → 相似度 0
      assert.equal(similar.length, 0)
    })

    it('getSimilar 结果应包含 bookmark 字段', () => {
      engine.buildGraph(sampleBookmarks)
      const similar = engine.getSimilar('1', 3)
      for (const s of similar) {
        assert.ok(s.bookmark !== undefined, '结果应含 bookmark')
        assert.ok(typeof s.score === 'number', 'score 应为 number')
        assert.ok(typeof s.id === 'string', 'id 应为 string')
      }
    })
  })

  describe('getClusters 边界情况', () => {
    it('getClusters 应按域名正确分组', () => {
      engine.buildGraph(sampleBookmarks)
      const clusters = engine.getClusters()
      const reactDomain = clusters.byDomain.get('react.dev')
      assert.ok(reactDomain, '应有 react.dev 分组')
      assert.equal(reactDomain.length, 2, 'react.dev 应有 2 个书签')
    })

    it('getClusters 应按文件夹正确分组', () => {
      engine.buildGraph(sampleBookmarks)
      const clusters = engine.getClusters()
      const devFrontend = clusters.byFolder.get('Dev/Frontend')
      assert.ok(devFrontend, '应有 Dev/Frontend 分组')
      assert.ok(devFrontend.length >= 2, 'Dev/Frontend 应有 2+ 个书签')
    })

    it('getClusters 无 URL 书签应不出现在域名聚类中', () => {
      engine.buildGraph([{ id: '1', title: 'No URL' }])
      const clusters = engine.getClusters()
      assert.equal(clusters.byDomain.size, 0)
    })
  })

  describe('_tokenizeTitle R187 补充', () => {
    it('_tokenizeTitle 应将英文转为小写', () => {
      const tokens = engine._tokenizeTitle('REACT Tutorial')
      assert.ok(tokens.includes('react'))
      assert.ok(tokens.includes('tutorial'))
    })

    it('_tokenizeTitle 应正确处理数字', () => {
      const tokens = engine._tokenizeTitle('HTML5 CSS3')
      assert.ok(tokens.includes('html'))
      assert.ok(tokens.includes('5'))
      assert.ok(tokens.includes('css'))
      assert.ok(tokens.includes('3'))
    })

    it('_tokenizeTitle 应处理非字符串输入', () => {
      assert.deepEqual(engine._tokenizeTitle(undefined), [])
      assert.deepEqual(engine._tokenizeTitle(123), [])
    })
  })
})
