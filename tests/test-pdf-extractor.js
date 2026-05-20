/**
 * 测试 lib/pdf-extractor.js — PDF 文本提取器
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock.js';

installChromeMock();

// Mock pdf.js 动态导入
const mockPdfjsLib = {
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (opts) => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (num) => ({
        getTextContent: async () => ({
          items: [{ str: `Page ${num} text` }, { str: 'more text' }]
        })
      }),
      getMetadata: async () => ({
        info: {
          Title: 'Test PDF',
          Author: 'Test Author',
          Subject: 'Testing',
          Keywords: 'test,pdf',
          Creator: 'Test Creator',
          Producer: 'Test Producer',
          CreationDate: '2024-01-01',
          ModDate: '2024-06-01',
        }
      })
    })
  })
};

// 拦截动态 import
const originalImport = globalThis.import;
let PdfExtractor;

beforeEach(async () => {
  resetChromeMock();
  installChromeMock();
  // 重新加载模块（pdf.js mock 通过 import 拦截）
  // 由于 ES module 缓存，我们直接测试 extractText 的逻辑
});

// ==================== PdfExtractor.extractText ====================

describe('PdfExtractor.extractText', () => {
  // 注意: 由于 pdf.js 是动态 import 的，在 Node.js 测试环境中
  // 我们主要测试输入验证逻辑

  it('空 ArrayBuffer 抛错', async () => {
    // 动态 import 获取最新模块
    const { PdfExtractor: PE } = await import('../lib/pdf-extractor.js');
    await assert.rejects(
      () => PE.extractText(new ArrayBuffer(0)),
      { message: /无效的 PDF 数据/ }
    );
  });

  it('null 抛错', async () => {
    const { PdfExtractor: PE } = await import('../lib/pdf-extractor.js');
    await assert.rejects(
      () => PE.extractText(null),
      { message: /无效的 PDF 数据/ }
    );
  });

  it('非 ArrayBuffer 抛错', async () => {
    const { PdfExtractor: PE } = await import('../lib/pdf-extractor.js');
    await assert.rejects(
      () => PE.extractText('not a buffer'),
      { message: /无效的 PDF 数据/ }
    );
  });

  it('undefined 抛错', async () => {
    const { PdfExtractor: PE } = await import('../lib/pdf-extractor.js');
    await assert.rejects(
      () => PE.extractText(undefined),
      { message: /无效的 PDF 数据/ }
    );
  });
});

// ==================== PdfExtractor.extractFromUrl ====================

describe('PdfExtractor.extractFromUrl', () => {
  it('fetch 失败时抛错', async () => {
    const { PdfExtractor: PE } = await import('../lib/pdf-extractor.js');
    // Mock global fetch
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    try {
      await assert.rejects(
        () => PE.extractFromUrl('https://example.com/test.pdf'),
        { message: /HTTP 404/ }
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
