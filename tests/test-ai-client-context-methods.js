/**
 * Tests for lib/ai-client-context-methods.js
 * Covers: askAboutPageWithContextFn, askAboutPageWithContextStreamFn, explainTermFn
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  askAboutPageWithContextFn,
  askAboutPageWithContextStreamFn,
  explainTermFn,
} from '../lib/ai-client-context-methods.js'

const fakePageContent = {
  content: 'JavaScript is a programming language.',
  title: 'JS Guide',
  url: 'https://example.com/js',
  selection: '',
}

describe('ai-client-context-methods', () => {
  describe('askAboutPageWithContextFn', () => {
    it('calls chat with context-aware messages and returns result', async () => {
      const chat = async (messages, opts) => {
        assert.ok(Array.isArray(messages))
        assert.ok(opts.systemPrompt)
        return { content: 'AI answer', model: 'gpt-4o', usage: { total: 10 } }
      }
      const result = await askAboutPageWithContextFn(fakePageContent, 'What is JS?', {
        chat,
        model: 'gpt-4o',
      })
      assert.equal(result.content, 'AI answer')
      assert.ok(result.contextUsed)
      assert.deepEqual(result.contextUsed.knowledgeRefs, [])
    })

    it('uses contextRetriever when provided', async () => {
      const chat = async () => ({ content: 'answer', model: 'm' })
      const contextRetriever = {
        retrieveContext: async (q, opts) => {
          assert.equal(q, 'What is JS?')
          assert.equal(opts.limit, 3)
          return [{ title: 'JS Doc', summary: 'JS docs', url: 'https://js.dev' }]
        }
      }
      const result = await askAboutPageWithContextFn(fakePageContent, 'What is JS?', {
        chat,
        model: 'm',
        contextRetriever,
      })
      assert.equal(result.contextUsed.knowledgeRefs.length, 1)
      assert.equal(result.contextUsed.knowledgeRefs[0].title, 'JS Doc')
    })

    it('silently degrades when contextRetriever throws', async () => {
      const chat = async () => ({ content: 'answer', model: 'm' })
      const contextRetriever = {
        retrieveContext: async () => { throw new Error('DB down') }
      }
      const result = await askAboutPageWithContextFn(fakePageContent, 'Q?', {
        chat,
        model: 'm',
        contextRetriever,
      })
      assert.deepEqual(result.contextUsed.knowledgeRefs, [])
    })

    it('trims conversation history', async () => {
      let capturedMessages
      const chat = async (messages) => {
        capturedMessages = messages
        return { content: 'ok', model: 'm' }
      }
      const history = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg ${i}`
      }))
      await askAboutPageWithContextFn(fakePageContent, 'Q?', {
        chat,
        model: 'm',
        conversationHistory: history,
        maxHistoryRounds: 2,
      })
      // maxHistoryRounds=2 means 4 messages (2 rounds × 2 msgs) + 1 user = 5
      assert.ok(capturedMessages.length <= 5, `expected ≤5 messages, got ${capturedMessages.length}`)
    })
  })

  describe('askAboutPageWithContextStreamFn', () => {
    it('yields chunks from chatStream', async () => {
      async function* fakeStream() {
        yield 'Hello '
        yield 'world'
      }
      const chunks = []
      for await (const chunk of askAboutPageWithContextStreamFn(fakePageContent, 'Q?', {
        chatStream: fakeStream,
        model: 'm',
      })) {
        chunks.push(chunk)
      }
      assert.deepEqual(chunks, ['Hello ', 'world'])
    })

    it('uses contextRetriever in stream mode', async () => {
      async function* fakeStream() { yield 'ok' }
      const contextRetriever = {
        retrieveContext: async () => [{ title: 'T', summary: 'S' }]
      }
      const chunks = []
      for await (const chunk of askAboutPageWithContextStreamFn(fakePageContent, 'Q?', {
        chatStream: fakeStream,
        model: 'm',
        contextRetriever,
      })) {
        chunks.push(chunk)
      }
      assert.deepEqual(chunks, ['ok'])
    })

    it('silently degrades when contextRetriever throws in stream', async () => {
      async function* fakeStream() { yield 'ok' }
      const contextRetriever = {
        retrieveContext: async () => { throw new Error('fail') }
      }
      const chunks = []
      for await (const chunk of askAboutPageWithContextStreamFn(fakePageContent, 'Q?', {
        chatStream: fakeStream,
        model: 'm',
        contextRetriever,
      })) {
        chunks.push(chunk)
      }
      assert.deepEqual(chunks, ['ok'])
    })
  })

  describe('explainTermFn', () => {
    it('returns error for too-short term', async () => {
      const result = await explainTermFn('a', fakePageContent, { model: 'm' })
      assert.ok(result.content.includes('太短'))
      assert.equal(result.model, 'm')
      assert.equal(result.usage, null)
    })

    it('returns error for empty term', async () => {
      const result = await explainTermFn('', fakePageContent, { model: 'm' })
      assert.ok(result.content.includes('太短'))
    })

    it('returns error for non-string term', async () => {
      const result = await explainTermFn(null, fakePageContent, { model: 'm' })
      assert.ok(result.content.includes('太短'))
    })

    it('calls chat with explanation prompt for valid term', async () => {
      const chat = async (messages, opts) => {
        assert.ok(opts.systemPrompt.includes('术语解释'))
        assert.ok(messages.some(m => m.content.includes('Promise')))
        return { content: 'A Promise is...', model: 'm', usage: { total: 5 } }
      }
      const result = await explainTermFn('Promise', fakePageContent, {
        chat,
        model: 'm',
      })
      assert.equal(result.content, 'A Promise is...')
    })

    it('uses contextRetriever.retrieveForTerm', async () => {
      const chat = async () => ({ content: 'ok', model: 'm' })
      const contextRetriever = {
        retrieveForTerm: async (term, opts) => {
          assert.equal(term, 'async/await')
          assert.equal(opts.limit, 2)
          return [{ title: 'Async Guide', summary: 'How async works', url: 'https://async.dev' }]
        }
      }
      const result = await explainTermFn('async/await', fakePageContent, {
        chat,
        model: 'm',
        contextRetriever,
      })
      assert.equal(result.content, 'ok')
    })

    it('silently degrades when retrieveForTerm throws', async () => {
      const chat = async (messages) => {
        // Should still work without knowledge refs
        return { content: 'explanation', model: 'm' }
      }
      const contextRetriever = {
        retrieveForTerm: async () => { throw new Error('DB error') }
      }
      const result = await explainTermFn('Closure', fakePageContent, {
        chat,
        model: 'm',
        contextRetriever,
      })
      assert.equal(result.content, 'explanation')
    })
  })
})
