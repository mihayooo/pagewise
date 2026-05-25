/**
 * Tests for AIClient — rewritten for node:test + ESM (R290)
 *
 * Jest/CJS version crashed under node:test; this version tests against
 * the real ai-client-request module (pure functions, no mock needed).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AIClient } from '../lib/ai-client.js';

// Save and restore global fetch
let origFetch;

beforeEach(() => {
  origFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = origFetch;
});

describe('AIClient request building', () => {
  it('buildRequest selects Claude', () => {
    const client = new AIClient({ protocol: 'claude', apiKey: 'test-key' });
    const res = client.buildRequest([], {});
    assert.ok(res.url.includes('/v1/messages'), `Claude url should include /v1/messages, got ${res.url}`);
    assert.ok(res.headers['x-api-key'] === 'test-key', 'Claude headers should include x-api-key');
  });

  it('buildRequest selects OpenAI', () => {
    const client = new AIClient({ protocol: 'openai' });
    const res = client.buildRequest([], {});
    assert.ok(res.url.includes('/v1/chat/completions'), `OpenAI url should include /v1/chat/completions, got ${res.url}`);
    assert.ok(res.headers['Authorization'], 'OpenAI headers should include Authorization');
  });
});

describe('chat handling', () => {
  it('successful response parses', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello' } }],
        model: 'gpt-4',
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    const client = new AIClient({ protocol: 'openai' });
    const result = await client.chat([]);
    assert.equal(result.content, 'hello');
  });

  it('non-ok response throws classified error', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad request' } }),
    });
    const client = new AIClient({ protocol: 'openai' });
    await assert.rejects(
      () => client.chat([]),
      (err) => {
        assert.ok(err.classified, 'error should have classified property');
        return true;
      }
    );
  });

  it('fetch throws network error', async () => {
    globalThis.fetch = async () => { throw new Error('network down'); };
    const client = new AIClient({ protocol: 'openai' });
    await assert.rejects(
      () => client.chat([]),
      (err) => {
        assert.ok(err.classified, 'error should have classified property');
        return true;
      }
    );
  });
});

describe('chatStream fallback when no body', () => {
  it('uses chat when response.body missing', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      body: null,
      json: async () => ({
        choices: [{ message: { content: 'fallback content' } }],
        model: 'm',
        usage: {},
      }),
    });
    const client = new AIClient({ protocol: 'openai' });
    const iter = client.chatStream([]);
    const arr = [];
    for await (const chunk of iter) { arr.push(chunk); }
    assert.equal(arr.length, 1);
    assert.equal(arr[0], 'fallback content');
  });
});

describe('listModels OpenAI path', () => {
  it('returns sorted ids', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 'b-model' }, { id: 'a-model' }],
      }),
    });
    const client = new AIClient({ protocol: 'openai', baseUrl: 'https://api.example.com' });
    const models = await client.listModels();
    assert.deepEqual(models, ['a-model', 'b-model']);
  });

  it('error classification on bad status', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal error' } }),
    });
    const client = new AIClient({ protocol: 'openai' });
    await assert.rejects(
      () => client.listModels(),
      (err) => {
        assert.ok(err.classified, 'error should have classified property');
        return true;
      }
    );
  });
});
