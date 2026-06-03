/**
 * TestShard — 测试分片工具
 *
 * 将测试文件按文件大小或用例数分片，支持并行执行。
 * 纯 ES Module，不依赖外部库。
 *
 * @module lib/test-shard
 */

import { readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

/**
 * 发现目录中所有测试文件
 *
 * @param {string} dir - 测试目录路径
 * @param {object} [options]
 * @param {string[]} [options.patterns] - 文件名匹配模式（默认 ['test-*.js']）
 * @param {string[]} [options.exclude] - 排除的文件名列表
 * @returns {Promise<string[]>} 测试文件路径列表（已排序）
 */
export async function discoverTestFiles(dir, options = {}) {
  const { patterns = ['test-*.js'], exclude = [] } = options;

  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    console.warn('[TestShard]', e?.message || e);
    return [];
  }
  const files = [];

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);

    // 跳过目录和非测试文件
    let entryStat;
    try {
      entryStat = await stat(fullPath);
    } catch (e) {
      console.warn('[TestShard]', e?.message || e);
      continue;
    }
    if (!entryStat.isFile()) continue;

    const matchesPattern = patterns.some(p => {
      const regex = new RegExp('^' + p.replace('*', '.*') + '$');
      return regex.test(entry);
    });
    if (!matchesPattern) continue;
    if (exclude.includes(entry)) continue;

    files.push(fullPath);
  }

  return files.sort();
}

/**
 * 将测试文件分片
 *
 * 使用贪心算法（LPT — Longest Processing Time），
 * 将大文件优先分配给负载最小的分片。
 *
 * @param {string[]} files - 测试文件路径列表
 * @param {number} shardCount - 分片数量
 * @param {number[]} [sizes] - 各文件大小数组（字节），与 files 一一对应
 * @returns {string[][]} 分片结果，每个元素是一组文件路径
 */
export function partitionFiles(files, shardCount, sizes = null) {
  if (shardCount <= 0) {
    throw new RangeError('shardCount must be >= 1');
  }
  if (files.length === 0) {
    return Array.from({ length: shardCount }, () => []);
  }

  // 获取每个文件的大小
  const fileSizes = files.map((f, i) => ({
    file: f,
    size: sizes ? (sizes[i] || 0) : 1,
  }));

  // LPT 排序：大文件优先
  fileSizes.sort((a, b) => b.size - a.size);

  // 贪心分配
  const shards = Array.from({ length: shardCount }, () => []);
  const shardSizes = new Array(shardCount).fill(0);

  for (const { file, size } of fileSizes) {
    // 找到当前负载最小的分片
    let minIdx = 0;
    for (let i = 1; i < shardCount; i++) {
      if (shardSizes[i] < shardSizes[minIdx]) minIdx = i;
    }
    shards[minIdx].push(file);
    shardSizes[minIdx] += size;
  }

  return shards;
}

/**
 * 生成 node --test 命令行参数
 *
 * @param {string[]} files - 测试文件列表
 * @param {object} [options]
 * @param {number} [options.concurrency] - 测试并发数
 * @param {string} [options.reporter] - 报告器 ('tap' | 'spec' | 'dot')
 * @returns {string[]} 命令行参数数组
 */
export function buildTestArgs(files, options = {}) {
  const { concurrency = 1, reporter } = options;
  const args = ['--test'];

  if (concurrency > 1) {
    args.push(`--test-concurrency=${concurrency}`);
  }
  if (reporter) {
    args.push(`--test-reporter=${reporter}`);
  }

  args.push(...files);
  return args;
}

/**
 * 从文件列表中选取 smoke test 核心模块文件
 *
 * @param {string[]} allFiles - 全部测试文件列表
 * @returns {string[]} 核心模块测试文件列表
 */
export function selectSmokeFiles(allFiles) {
  const smokePatterns = [
    'test-bookmark-indexer',
    'test-bookmark-graph',
    'test-bookmark-search',
    'test-bookmark-clusterer',
    'test-bookmark-recommender',
    'test-utils',
    'test-spaced-repetition',
    'test-cost-estimator',
    'test-knowledge-graph',
    'test-bookmark-collector',
    'test-storage-adapter',
    'test-token-estimation',
    'test-cache-manager',
    'test-sanitize',
    'test-entity-extractor',
    'test-embedding',
    'test-smoke',
    'test-auto-classifier',
    'test-bookmark-tagger',
    'test-wiki-query',
  ];

  return allFiles.filter(f => {
    const name = basename(f, '.js');
    return smokePatterns.includes(name);
  });
}
