/**
 * Tests for lib/test-shard.js — 测试分片工具
 *
 * 覆盖:
 *   - discoverTestFiles (文件发现)
 *   - partitionFiles (LPT 分片算法)
 *   - buildTestArgs (命令行参数生成)
 *   - selectSmokeFiles (smoke 文件过滤)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const {
  discoverTestFiles,
  partitionFiles,
  buildTestArgs,
  selectSmokeFiles,
} = await import('../lib/test-shard.js');

// ==================== discoverTestFiles ====================

describe('discoverTestFiles — 文件发现', () => {
  it('发现 tests 目录中的测试文件', async () => {
    const testDir = join(__dirname);
    const files = await discoverTestFiles(testDir);
    assert.ok(files.length > 10, `应发现 >10 个测试文件，实际 ${files.length}`);
    // 所有文件以 test- 开头
    for (const f of files) {
      assert.ok(f.includes('test-'), `文件名应含 test-: ${f}`);
    }
  });

  it('结果已排序', async () => {
    const testDir = join(__dirname);
    const files = await discoverTestFiles(testDir);
    const sorted = [...files].sort();
    assert.deepEqual(files, sorted);
  });

  it('自定义 patterns 过滤', async () => {
    const testDir = join(__dirname);
    const files = await discoverTestFiles(testDir, { patterns: ['test-smoke.js'] });
    assert.equal(files.length, 1);
    assert.ok(files[0].includes('test-smoke.js'));
  });

  it('exclude 排除文件', async () => {
    const testDir = join(__dirname);
    const allFiles = await discoverTestFiles(testDir);
    const excluded = allFiles[0].split('/').pop();
    const filtered = await discoverTestFiles(testDir, { exclude: [excluded] });
    assert.equal(filtered.length, allFiles.length - 1);
    assert.ok(!filtered.some(f => f.endsWith(excluded)));
  });

  it('空目录返回空数组', async () => {
    const files = await discoverTestFiles('/tmp/nonexistent_test_dir_xyz');
    assert.deepEqual(files, []);
  });
});

// ==================== partitionFiles ====================

describe('partitionFiles — LPT 分片', () => {
  it('空文件列表返回空分片', () => {
    const shards = partitionFiles([], 4);
    assert.equal(shards.length, 4);
    for (const s of shards) assert.equal(s.length, 0);
  });

  it('单文件分配到第一个分片', () => {
    const shards = partitionFiles(['a.js'], 3);
    const nonEmpty = shards.filter(s => s.length > 0);
    assert.equal(nonEmpty.length, 1);
    assert.deepEqual(nonEmpty[0], ['a.js']);
  });

  it('文件数少于分片数时，多余分片为空', () => {
    const shards = partitionFiles(['a.js', 'b.js'], 5);
    assert.equal(shards.length, 5);
    const nonEmpty = shards.filter(s => s.length > 0);
    assert.equal(nonEmpty.length, 2);
  });

  it('均匀分配（相同大小文件）', () => {
    const files = ['a.js', 'b.js', 'c.js', 'd.js'];
    const sizes = [100, 100, 100, 100];
    const shards = partitionFiles(files, 2, sizes);
    assert.equal(shards.length, 2);
    assert.equal(shards[0].length, 2);
    assert.equal(shards[1].length, 2);
  });

  it('LPT 大文件优先分配', () => {
    const files = ['big.js', 'med.js', 'small.js'];
    const sizes = [1000, 500, 100];
    const shards = partitionFiles(files, 2, sizes);
    // big.js → shard 0, med.js → shard 1, small.js → shard 1 (较小负载)
    assert.equal(shards.length, 2);
    assert.deepEqual(shards[0], ['big.js']);
    assert.deepEqual(shards[1].sort(), ['med.js', 'small.js'].sort());
  });

  it('shardCount=1 时所有文件在同一分片', () => {
    const files = ['a.js', 'b.js', 'c.js'];
    const shards = partitionFiles(files, 1);
    assert.equal(shards.length, 1);
    assert.equal(shards[0].length, 3);
  });

  it('shardCount=0 抛出 RangeError', () => {
    assert.throws(() => partitionFiles(['a.js'], 0), RangeError);
  });

  it('shardCount<0 抛出 RangeError', () => {
    assert.throws(() => partitionFiles(['a.js'], -1), RangeError);
  });

  it('无 sizes 时按文件数均分', () => {
    const files = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'e2.js'];
    const shards = partitionFiles(files, 3);
    // 6 files → 2 per shard
    const lengths = shards.map(s => s.length).sort();
    assert.deepEqual(lengths, [2, 2, 2]);
  });

  it('分片结果包含所有文件', () => {
    const files = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'];
    const sizes = [300, 200, 100, 400, 50];
    const shards = partitionFiles(files, 3, sizes);
    const all = shards.flat().sort();
    assert.deepEqual(all, [...files].sort());
  });

  it('大量文件分配均匀', () => {
    const files = Array.from({ length: 100 }, (_, i) => `test-${i}.js`);
    const sizes = files.map((_, i) => (i + 1) * 10);
    const shards = partitionFiles(files, 4, sizes);
    // 所有文件都被分配
    const total = shards.reduce((sum, s) => sum + s.length, 0);
    assert.equal(total, 100);
    // 分片间文件数差异不大
    const lengths = shards.map(s => s.length);
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    assert.ok(maxLen - minLen <= 2, `分片不均匀: ${lengths}`);
  });
});

// ==================== buildTestArgs ====================

describe('buildTestArgs — 命令行参数生成', () => {
  it('基本参数包含 --test', () => {
    const args = buildTestArgs(['a.js', 'b.js']);
    assert.equal(args[0], '--test');
    assert.ok(args.includes('a.js'));
    assert.ok(args.includes('b.js'));
  });

  it('concurrency 参数', () => {
    const args = buildTestArgs(['a.js'], { concurrency: 4 });
    assert.ok(args.includes('--test-concurrency=4'));
  });

  it('reporter 参数', () => {
    const args = buildTestArgs(['a.js'], { reporter: 'tap' });
    assert.ok(args.includes('--test-reporter=tap'));
  });

  it('concurrency=1 不生成并发参数', () => {
    const args = buildTestArgs(['a.js'], { concurrency: 1 });
    assert.ok(!args.some(a => a.startsWith('--test-concurrency')));
  });

  it('组合参数', () => {
    const args = buildTestArgs(['a.js', 'b.js'], { concurrency: 4, reporter: 'tap' });
    assert.ok(args.includes('--test'));
    assert.ok(args.includes('--test-concurrency=4'));
    assert.ok(args.includes('--test-reporter=tap'));
    assert.ok(args.includes('a.js'));
    assert.ok(args.includes('b.js'));
  });

  it('空文件列表只有 --test', () => {
    const args = buildTestArgs([]);
    assert.deepEqual(args, ['--test']);
  });
});

// ==================== selectSmokeFiles ====================

describe('selectSmokeFiles — smoke 文件选择', () => {
  it('从全量文件中选取核心模块', () => {
    const allFiles = [
      '/tests/test-smoke.js',
      '/tests/test-utils.js',
      '/tests/test-bookmark-indexer.js',
      '/tests/test-bookmark-backup-restore.js',
      '/tests/test-ai-gateway.js',
    ];
    const smoke = selectSmokeFiles(allFiles);
    assert.ok(smoke.includes('/tests/test-smoke.js'));
    assert.ok(smoke.includes('/tests/test-utils.js'));
    assert.ok(smoke.includes('/tests/test-bookmark-indexer.js'));
    assert.ok(!smoke.includes('/tests/test-bookmark-backup-restore.js'));
    assert.ok(!smoke.includes('/tests/test-ai-gateway.js'));
  });

  it('空列表返回空', () => {
    assert.deepEqual(selectSmokeFiles([]), []);
  });

  it('不包含 e2e 测试', () => {
    const allFiles = [
      '/tests/test-ai-cache-e2e.js',
      '/tests/test-e2e-qa.js',
      '/tests/test-utils.js',
    ];
    const smoke = selectSmokeFiles(allFiles);
    assert.ok(!smoke.some(f => f.includes('e2e')));
  });
});
