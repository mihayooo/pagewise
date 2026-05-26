/**
 * 测试 lib/docmind-api-paths.js — DocMind API 端点路径常量
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { API_PATHS } = await import('../lib/docmind-api-paths.js');

describe('DocMind API Paths', () => {

  describe('API_PATHS 常量', () => {

    it('1. 导出为对象', () => {
      assert.equal(typeof API_PATHS, 'object');
      assert.notEqual(API_PATHS, null);
    });

    it('2. 包含 status 端点', () => {
      assert.equal(API_PATHS.status, '/api/v1/status');
    });

    it('3. 包含 knowledge 端点', () => {
      assert.equal(API_PATHS.knowledge, '/api/v1/knowledge');
    });

    it('4. 包含 bookmarks 端点', () => {
      assert.equal(API_PATHS.bookmarks, '/api/v1/bookmarks');
    });

    it('5. 包含 graph 端点', () => {
      assert.equal(API_PATHS.graph, '/api/v1/graph');
    });

    it('6. 包含 graphSync 端点', () => {
      assert.equal(API_PATHS.graphSync, '/api/v1/graph/sync');
    });

    it('7. 包含 health 端点', () => {
      assert.equal(API_PATHS.health, '/api/v1/health');
    });

    it('8. 包含 aiConfig 端点', () => {
      assert.equal(API_PATHS.aiConfig, '/api/v1/ai/config');
    });

    it('9. 包含 aiModels 端点', () => {
      assert.equal(API_PATHS.aiModels, '/api/v1/ai/models');
    });

    it('10. 包含 aiUsage 端点', () => {
      assert.equal(API_PATHS.aiUsage, '/api/v1/ai/usage');
    });

    it('11. 所有路径以 /api/v1 开头', () => {
      for (const [key, path] of Object.entries(API_PATHS)) {
        assert.ok(path.startsWith('/api/v1/'), `${key} path should start with /api/v1/`);
      }
    });

    it('12. 共 9 个端点', () => {
      assert.equal(Object.keys(API_PATHS).length, 9);
    });
  });
});
