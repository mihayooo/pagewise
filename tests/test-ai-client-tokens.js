/**
 * 测试 lib/ai-client-tokens.js — Token 估算子模块
 *
 * 直接从子模块导入，不经过 ai-client.js 重导出。
 * 纯函数测试，无外部依赖。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { estimateTokens, estimateMessagesTokens } from '../lib/ai-client-tokens.js'

// ==================== estimateTokens ====================

describe('estimateTokens() — 基础行为', () => {
  it('空字符串返回 0', () => {
    assert.equal(estimateTokens(''), 0)
  })

  it('null 返回 0', () => {
    assert.equal(estimateTokens(null), 0)
  })

  it('undefined 返回 0', () => {
    assert.equal(estimateTokens(undefined), 0)
  })

  it('数字类型返回 0', () => {
    assert.equal(estimateTokens(12345), 0)
  })

  it('对象类型返回 0', () => {
    assert.equal(estimateTokens({}), 0)
  })
})

describe('estimateTokens() — 英文文本', () => {
  it('单字符 "a" 返回 ceil(1/3) = 1', () => {
    assert.equal(estimateTokens('a'), 1)
  })

  it('3 个字符返回 1 token', () => {
    assert.equal(estimateTokens('abc'), 1)
  })

  it('4 个字符返回 ceil(4/3) = 2 tokens', () => {
    assert.equal(estimateTokens('abcd'), 2)
  })

  it('6 个字符返回 2 tokens', () => {
    assert.equal(estimateTokens('abcdef'), 2)
  })

  it('较长英文文本估算合理', () => {
    // 100 chars → ceil(100/3) = 34
    const text = 'a'.repeat(100)
    assert.equal(estimateTokens(text), 34)
  })
})

describe('estimateTokens() — 中文文本', () => {
  it('纯中文字符正确估算', () => {
    // "你好世界" = 4 chars → ceil(4/3) = 2
    assert.equal(estimateTokens('你好世界'), 2)
  })

  it('较长中文文本估算', () => {
    const text = '我'.repeat(100)
    // 100 chars → ceil(100/3) = 34
    assert.equal(estimateTokens(text), 34)
  })
})

describe('estimateTokens() — 混合与边界', () => {
  it('中英混合文本', () => {
    const text = 'hello你好world世界'  // 14 chars → ceil(14/3) = 5
    assert.equal(estimateTokens(text), 5)
  })

  it('含换行和制表符', () => {
    const text = 'line1\nline2\tline3'  // 17 chars → ceil(17/3) = 6
    assert.equal(estimateTokens(text), 6)
  })

  it('含空格的字符串', () => {
    const text = '   '  // 3 spaces → ceil(3/3) = 1
    assert.equal(estimateTokens(text), 1)
  })

  it('长字符串（10000 字符）精度', () => {
    const text = 'x'.repeat(10000)
    assert.equal(estimateTokens(text), 3334)  // ceil(10000/3) = 3334
  })
})

// ==================== estimateMessagesTokens ====================

describe('estimateMessagesTokens() — 基础行为', () => {
  it('空数组返回 0', () => {
    assert.equal(estimateMessagesTokens([]), 0)
  })

  it('非数组输入返回 0', () => {
    assert.equal(estimateMessagesTokens(null), 0)
    assert.equal(estimateMessagesTokens(undefined), 0)
    assert.equal(estimateMessagesTokens('not array'), 0)
    assert.equal(estimateMessagesTokens(123), 0)
  })
})

describe('estimateMessagesTokens() — 单条消息', () => {
  it('单条消息含 role 开销 4', () => {
    // content = '' → 0 tokens + 4 overhead = 4
    const result = estimateMessagesTokens([{ role: 'user', content: '' }])
    assert.equal(result, 4)
  })

  it('单条短消息 token 数 = 4 + ceil(content.length / 3)', () => {
    // content = 'hello' (5 chars) → ceil(5/3) = 2 + 4 = 6
    const result = estimateMessagesTokens([{ role: 'user', content: 'hello' }])
    assert.equal(result, 6)
  })

  it('content 为 null 时按空字符串处理', () => {
    const result = estimateMessagesTokens([{ role: 'user', content: null }])
    assert.equal(result, 4)
  })

  it('content 为 undefined 时按空字符串处理', () => {
    const result = estimateMessagesTokens([{ role: 'assistant', content: undefined }])
    assert.equal(result, 4)
  })

  it('content 为数字时按空字符串处理', () => {
    const result = estimateMessagesTokens([{ role: 'user', content: 12345 }])
    assert.equal(result, 4)
  })
})

describe('estimateMessagesTokens() — 多条消息', () => {
  it('多条消息累加 token 数', () => {
    const messages = [
      { role: 'system', content: 'test' },  // 4 + ceil(4/3)=2 = 6
      { role: 'user', content: 'hello' },    // 4 + ceil(5/3)=2 = 6
    ]
    assert.equal(estimateMessagesTokens(messages), 12)
  })

  it('10 条长对话正确累加', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x'.repeat(100),
    }))
    // 每条: 4 + ceil(100/3) = 4 + 34 = 38; 10条 = 380
    assert.equal(estimateMessagesTokens(messages), 380)
  })

  it('含 system 消息正确计算', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },  // 4 + ceil(28/3)=10 = 14
      { role: 'user', content: 'Hi' },                              // 4 + ceil(2/3)=1 = 5
    ]
    assert.equal(estimateMessagesTokens(messages), 19)
  })

  it('含空 role 消息不影响计算', () => {
    const messages = [
      { role: '', content: 'test' },  // 4 + ceil(4/3)=2 = 6
    ]
    assert.equal(estimateMessagesTokens(messages), 6)
  })

  it('role 字段不影响 token 数（仅 content 参与计算）', () => {
    const base = estimateMessagesTokens([{ role: 'user', content: 'hello' }])
    const same = estimateMessagesTokens([{ role: 'assistant', content: 'hello' }])
    const long = estimateMessagesTokens([{ role: 'system', content: 'hello' }])
    assert.equal(base, same)
    assert.equal(base, long)
  })

  it('所有消息 content 为空字符串时仅返回 overhead', () => {
    const messages = [
      { role: 'system', content: '' },
      { role: 'user', content: '' },
      { role: 'assistant', content: '' },
    ]
    // 3 * 4 = 12
    assert.equal(estimateMessagesTokens(messages), 12)
  })
})
