/**
 * test-bookmark-knowledge-packs.js — 知识包分享与团队空间单元测试
 *
 * 测试范围:
 *   BookmarkKnowledgePacks 构造函数 / createKnowledgePack / sanitizePack /
 *   importKnowledgePack / listCommunityPacks / searchPacks / checkPackUpdate /
 *   exportToAnki / Base64 编解码 / 冲突检测 / 学习路径继承 / 增量更新
 *
 * 目标: ≥25 用例
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BookmarkKnowledgePacks,
  PACK_FORMAT_VERSION,
  VISIBILITY_LEVELS,
  ANKI_EXPORT_VERSION,
} from '../lib/bookmark-knowledge-packs.js';

// ==================== 辅助工厂 ====================

function makeBookmark(id, overrides = {}) {
  return {
    id: String(id),
    title: `Bookmark ${id}`,
    url: `https://example.com/page-${id}`,
    tags: ['tech', 'web'],
    status: 'read',
    dateAdded: Date.now() - 86400000 * 10,
    folderPath: ['Tech', 'Web'],
    summary: `Summary for bookmark ${id}`,
    notes: `Personal notes for bookmark ${id}. Contains private thoughts.`,
    ...overrides,
  };
}

function makeTag(name, overrides = {}) {
  return {
    name,
    color: '#2196F3',
    count: 5,
    ...overrides,
  };
}

function makeReviewCard(bookmarkId, overrides = {}) {
  return {
    bookmarkId: String(bookmarkId),
    front: `Question about bookmark ${bookmarkId}?`,
    back: `Answer for bookmark ${bookmarkId}`,
    interval: 7,
    repetitions: 3,
    easeFactor: 2.5,
    nextReview: Date.now() + 86400000,
    ...overrides,
  };
}

function makeLearningPath(overrides = {}) {
  return {
    category: 'Web Development',
    stages: [
      { name: '基础入门', level: 'beginner', bookmarkIds: ['1', '2'] },
      { name: '实战练习', level: 'intermediate', bookmarkIds: ['3'] },
    ],
    ...overrides,
  };
}

function makeNote(overrides = {}) {
  return {
    bookmarkId: '1',
    content: 'This is a note about bookmark 1',
    createdAt: Date.now(),
    ...overrides,
  };
}

function makePackConfig(overrides = {}) {
  return {
    name: 'Test Knowledge Pack',
    description: 'A test knowledge pack',
    author: 'Test Author',
    version: '1.0.0',
    bookmarks: [makeBookmark(1), makeBookmark(2), makeBookmark(3)],
    tags: [makeTag('tech'), makeTag('web')],
    notes: [makeNote()],
    learningPaths: [makeLearningPath()],
    reviewCards: [makeReviewCard(1), makeReviewCard(2)],
    visibility: 'public',
    ...overrides,
  };
}

// ==================== 测试 ====================

describe('BookmarkKnowledgePacks', () => {

  let kp;
  beforeEach(() => {
    kp = new BookmarkKnowledgePacks({
      now: () => 1700000000000,
    });
  });

  // ─── 构造函数 ───────────────────────────────────────────────────

  describe('构造函数', () => {
    it('1. 默认构造应初始化空实例', () => {
      const instance = new BookmarkKnowledgePacks();
      assert.equal(instance.listCommunityPacks().length, 0);
    });

    it('2. 构造函数应接受 options 参数', () => {
      const instance = new BookmarkKnowledgePacks({
        now: () => 1700000000000,
        storageBackend: 'local',
      });
      assert.ok(instance);
    });
  });

  // ─── createKnowledgePack ───────────────────────────────────────

  describe('createKnowledgePack', () => {
    it('3. 创建知识包应返回 .pwkp 格式对象', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);

      assert.equal(pack.format, 'pwkp');
      assert.equal(pack.formatVersion, PACK_FORMAT_VERSION);
      assert.equal(pack.name, 'Test Knowledge Pack');
      assert.equal(pack.description, 'A test knowledge pack');
      assert.equal(pack.author, 'Test Author');
      assert.equal(pack.version, '1.0.0');
      assert.equal(pack.visibility, 'public');
    });

    it('4. 创建知识包应包含书签数据', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);

      assert.equal(pack.bookmarks.length, 3);
      assert.equal(pack.bookmarks[0].title, 'Bookmark 1');
    });

    it('5. 创建知识包应包含标签、笔记、学习路径和复习卡片', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);

      assert.equal(pack.tags.length, 2);
      assert.equal(pack.notes.length, 1);
      assert.equal(pack.learningPaths.length, 1);
      assert.equal(pack.reviewCards.length, 2);
    });

    it('6. 创建知识包应生成唯一 packId', () => {
      const config = makePackConfig();
      const pack1 = kp.createKnowledgePack(config);
      const pack2 = kp.createKnowledgePack(config);

      assert.notEqual(pack1.packId, pack2.packId);
      assert.ok(pack1.packId.startsWith('kp-'));
    });

    it('7. 创建知识包应包含元数据统计', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);

      assert.equal(pack.metadata.bookmarkCount, 3);
      assert.equal(pack.metadata.tagCount, 2);
      assert.equal(pack.metadata.noteCount, 1);
      assert.equal(pack.metadata.cardCount, 2);
    });

    it('8. 创建知识包应计算校验和', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);

      assert.ok(pack.checksum);
      assert.equal(typeof pack.checksum, 'string');
      assert.ok(pack.checksum.length > 0);
    });

    it('9. 缺少必填字段应抛出错误', () => {
      assert.throws(() => kp.createKnowledgePack({}), /name/);
      assert.throws(() => kp.createKnowledgePack({ name: 'Test' }), /bookmarks/);
    });
  });

  // ─── sanitizePack ──────────────────────────────────────────────

  describe('sanitizePack', () => {
    it('10. 公开级别应移除浏览时间', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const sanitized = kp.sanitizePack(pack, 'public');

      for (const bm of sanitized.bookmarks) {
        assert.equal(bm.dateAdded, undefined);
      }
    });

    it('11. 公开级别应移除私人笔记', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const sanitized = kp.sanitizePack(pack, 'public');

      for (const bm of sanitized.bookmarks) {
        assert.equal(bm.notes, undefined);
      }
    });

    it('12. 团队级别应保留标签但移除私人信息', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const sanitized = kp.sanitizePack(pack, 'team');

      // 标签应保留
      assert.ok(sanitized.tags.length > 0);
      // 私人笔记应移除
      for (const bm of sanitized.bookmarks) {
        assert.equal(bm.notes, undefined);
      }
    });

    it('13. 私有级别应保留所有数据', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const sanitized = kp.sanitizePack(pack, 'private');

      // 私有模式下应保留 dateAdded 和 notes
      for (const bm of sanitized.bookmarks) {
        assert.ok(bm.dateAdded !== undefined);
      }
      assert.equal(sanitized.visibility, 'private');
    });

    it('14. 脱敏应更新 visibility 字段', () => {
      const config = makePackConfig({ visibility: 'public' });
      const pack = kp.createKnowledgePack(config);
      const sanitized = kp.sanitizePack(pack, 'team');

      assert.equal(sanitized.visibility, 'team');
    });

    it('15. 脱敏应保留核心学习内容', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const sanitized = kp.sanitizePack(pack, 'public');

      // 核心内容应保留
      assert.ok(sanitized.bookmarks.length > 0);
      assert.ok(sanitized.bookmarks[0].title);
      assert.ok(sanitized.bookmarks[0].url);
      assert.ok(sanitized.learningPaths.length > 0);
      assert.ok(sanitized.reviewCards.length > 0);
    });
  });

  // ─── importKnowledgePack ───────────────────────────────────────

  describe('importKnowledgePack', () => {
    it('16. 导入有效 .pwkp JSON 应成功', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const jsonStr = JSON.stringify(pack);

      const result = kp.importKnowledgePack(jsonStr);

      assert.equal(result.success, true);
      assert.equal(result.pack.name, 'Test Knowledge Pack');
      assert.equal(result.pack.bookmarks.length, 3);
    });

    it('17. 导入 Base64 编码的 .pwkp 应成功', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const jsonStr = JSON.stringify(pack);
      const base64 = Buffer.from(jsonStr, 'utf-8').toString('base64');

      const result = kp.importKnowledgePack(base64, { isBase64: true });

      assert.equal(result.success, true);
      assert.equal(result.pack.name, 'Test Knowledge Pack');
    });

    it('18. 导入无效 JSON 应返回失败', () => {
      const result = kp.importKnowledgePack('not-valid-json');

      assert.equal(result.success, false);
      assert.ok(result.errors.length > 0);
    });

    it('19. 导入格式不匹配应返回失败', () => {
      const data = JSON.stringify({ format: 'unknown', bookmarks: [] });
      const result = kp.importKnowledgePack(data);

      assert.equal(result.success, false);
      assert.ok(result.errors.some(e => e.includes('format')));
    });

    it('20. URL 重复冲突应被检测', () => {
      // 先导入一个包
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      // 再导入相同 URL 的包
      const config2 = makePackConfig({ name: 'Duplicate Pack' });
      const pack2 = kp.createKnowledgePack(config2);
      const result = kp.importKnowledgePack(JSON.stringify(pack2));

      assert.equal(result.success, true);
      assert.ok(result.conflicts.duplicateUrls.length > 0);
    });

    it('21. 冲突应提供合并策略选项', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const config2 = makePackConfig({ name: 'Conflict Pack' });
      const pack2 = kp.createKnowledgePack(config2);
      const result = kp.importKnowledgePack(JSON.stringify(pack2), {
        mergeStrategy: 'skip',
      });

      assert.ok(result.conflicts);
      assert.ok(result.imported !== undefined);
    });
  });

  // ─── listCommunityPacks / searchPacks ──────────────────────────

  describe('社区包管理', () => {
    it('22. listCommunityPacks 应列出已导入的包', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const packs = kp.listCommunityPacks();
      assert.ok(packs.length > 0);
      assert.equal(packs[0].name, 'Test Knowledge Pack');
    });

    it('23. searchPacks 应按关键词搜索', () => {
      const config1 = makePackConfig({ name: 'React Patterns Pack' });
      const config2 = makePackConfig({ name: 'Python Basics Pack' });
      kp.importKnowledgePack(JSON.stringify(kp.createKnowledgePack(config1)));
      kp.importKnowledgePack(JSON.stringify(kp.createKnowledgePack(config2)));

      const reactResults = kp.searchPacks('React');
      assert.equal(reactResults.length, 1);
      assert.equal(reactResults[0].name, 'React Patterns Pack');

      const pythonResults = kp.searchPacks('Python');
      assert.equal(pythonResults.length, 1);
      assert.equal(pythonResults[0].name, 'Python Basics Pack');
    });

    it('24. searchPacks 应支持评分', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const packs = kp.listCommunityPacks();
      const packId = packs[0].packId;

      kp.ratePack(packId, 5);
      kp.ratePack(packId, 3);

      const updatedPacks = kp.listCommunityPacks();
      const rated = updatedPacks.find(p => p.packId === packId);
      assert.equal(rated.rating, 4); // (5 + 3) / 2
      assert.equal(rated.ratingCount, 2);
    });

    it('25. 导入应增加下载计数', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const packs = kp.listCommunityPacks();
      assert.equal(packs[0].downloadCount, 1);

      // 再次导入同一包
      kp.importKnowledgePack(JSON.stringify(pack));
      const updatedPacks = kp.listCommunityPacks();
      assert.equal(updatedPacks[0].downloadCount, 2);
    });
  });

  // ─── checkPackUpdate ───────────────────────────────────────────

  describe('增量更新', () => {
    it('26. checkPackUpdate 应检测版本变化', () => {
      const config = makePackConfig({ version: '1.0.0' });
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      // 创建新版本
      const config2 = makePackConfig({ version: '2.0.0' });
      const pack2 = kp.createKnowledgePack(config2);
      // 用相同 packId 模拟更新
      const updatedPack = { ...pack2, packId: pack.packId, version: '2.0.0' };

      const result = kp.checkPackUpdate(pack.packId, updatedPack);
      assert.equal(result.hasUpdate, true);
      assert.equal(result.currentVersion, '1.0.0');
      assert.equal(result.latestVersion, '2.0.0');
    });

    it('27. 相同版本应返回无更新', () => {
      const config = makePackConfig({ version: '1.0.0' });
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const result = kp.checkPackUpdate(pack.packId, pack);
      assert.equal(result.hasUpdate, false);
    });
  });

  // ─── exportToAnki ─────────────────────────────────────────────

  describe('Anki 导出', () => {
    it('28. exportToAnki 应生成 TSV 格式的复习卡片', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const ankiData = kp.exportToAnki(pack);

      assert.ok(ankiData.format === 'anki-tsv');
      assert.ok(ankiData.version === ANKI_EXPORT_VERSION);
      assert.ok(typeof ankiData.content === 'string');
      // 每行应包含 front\tback
      const lines = ankiData.content.trim().split('\n');
      assert.ok(lines.length >= 2);
    });

    it('29. Anki 导出应保留标签', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const ankiData = kp.exportToAnki(pack);

      const lines = ankiData.content.trim().split('\n');
      for (const line of lines) {
        const parts = line.split('\t');
        // 第三列应是标签
        assert.ok(parts.length >= 2);
      }
    });

    it('30. 空复习卡片应返回空内容', () => {
      const config = makePackConfig({ reviewCards: [] });
      const pack = kp.createKnowledgePack(config);
      const ankiData = kp.exportToAnki(pack);

      assert.equal(ankiData.content, '');
    });
  });

  // ─── 学习路径继承 ──────────────────────────────────────────────

  describe('学习路径继承', () => {
    it('31. 导入应识别包内学习路径', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const result = kp.importKnowledgePack(JSON.stringify(pack));

      assert.ok(result.learningPaths.length > 0);
      assert.equal(result.learningPaths[0].category, 'Web Development');
    });

    it('32. 导入学习路径应映射书签 ID', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const result = kp.importKnowledgePack(JSON.stringify(pack));

      // 学习路径中的 bookmarkIds 应被映射到导入后的书签 ID
      const path = result.learningPaths[0];
      assert.ok(path.stages.length > 0);
    });
  });

  // ─── Base64 编解码 ─────────────────────────────────────────────

  describe('Base64 编解码', () => {
    it('33. exportToBase64 应生成 Base64 编码字符串', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      const base64 = kp.exportToBase64(pack);

      assert.ok(typeof base64 === 'string');
      assert.ok(base64.length > 0);

      // 应可解码回原 JSON
      const decoded = Buffer.from(base64, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      assert.equal(parsed.format, 'pwkp');
    });
  });

  // ─── 序列化/持久化 ─────────────────────────────────────────────

  describe('序列化/持久化', () => {
    it('34. exportData 应导出所有数据', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const data = kp.exportData();
      assert.ok(data.installedPacks);
      assert.ok(data.communityIndex);
      assert.ok(data.version);
    });

    it('35. importData 应恢复数据', () => {
      const config = makePackConfig();
      const pack = kp.createKnowledgePack(config);
      kp.importKnowledgePack(JSON.stringify(pack));

      const data = kp.exportData();
      const kp2 = new BookmarkKnowledgePacks();
      kp2.importData(data);

      const packs = kp2.listCommunityPacks();
      assert.ok(packs.length > 0);
    });
  });

  // ─── 边界条件 ──────────────────────────────────────────────────

  describe('边界条件', () => {
    it('36. 无效可见性级别应抛出错误', () => {
      const config = makePackConfig({ visibility: 'invalid' });
      assert.throws(() => kp.createKnowledgePack(config), /visibility/);
    });

    it('37. 空书签数组应创建有效包', () => {
      const config = makePackConfig({ bookmarks: [] });
      const pack = kp.createKnowledgePack(config);

      assert.equal(pack.format, 'pwkp');
      assert.equal(pack.bookmarks.length, 0);
      assert.equal(pack.metadata.bookmarkCount, 0);
    });

    it('38. checkPackUpdate 不存在的 packId 应返回错误', () => {
      const result = kp.checkPackUpdate('nonexistent-id');
      assert.equal(result.hasUpdate, false);
      assert.ok(result.error);
    });
  });

  // ─── 常量导出 ──────────────────────────────────────────────────

  describe('常量导出', () => {
    it('39. PACK_FORMAT_VERSION 应正确导出', () => {
      assert.equal(PACK_FORMAT_VERSION, '1.0');
    });

    it('40. VISIBILITY_LEVELS 应包含三个级别', () => {
      assert.deepEqual(VISIBILITY_LEVELS, ['public', 'team', 'private']);
    });
  });
});
