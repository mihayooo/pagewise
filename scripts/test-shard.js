#!/usr/bin/env node
/**
 * 测试分片运行器
 *
 * 用法:
 *   node scripts/test-shard.js --shards=4          # 同时运行 4 个分片
 *   node scripts/test-shard.js --shard=2 --of=4    # 只运行第 3 个分片（0-indexed）
 *   node scripts/test-shard.js --smoke              # 只运行 smoke 测试
 *   node scripts/test-shard.js --smoke --reporter=tap  # smoke + TAP 输出
 */

import { fork } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const TEST_DIR = join(ROOT, 'tests');

// ── 参数解析 ──────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, val] = arg.slice(2).split('=');
    flags[key] = val ?? true;
  }
}

const SHARD_COUNT = parseInt(flags.shards, 10) || 4;
const SPECIFIC_SHARD = flags.shard !== undefined ? parseInt(flags.shard, 10) : -1;
const IS_SMOKE = !!flags.smoke;
const REPORTER = flags.reporter || null;
const CONCURRENCY = parseInt(flags.concurrency, 10) || 1;

// ── 发现测试文件 ──────────────────────────────────────────
async function discoverTestFiles(dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const entry of entries) {
    if (!entry.startsWith('test-') || !entry.endsWith('.js')) continue;
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isFile()) files.push({ path: fullPath, size: s.size, name: entry });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Smoke 文件过滤 ────────────────────────────────────────
const SMOKE_BASENAMES = new Set([
  'test-smoke.js',
  'test-bookmark-indexer.js',
  'test-bookmark-graph.js',
  'test-bookmark-search.js',
  'test-bookmark-clusterer.js',
  'test-bookmark-recommender.js',
  'test-utils.js',
  'test-spaced-repetition.js',
  'test-cost-estimator.js',
  'test-knowledge-graph.js',
  'test-bookmark-collector.js',
  'test-storage-adapter.js',
  'test-token-estimation.js',
  'test-cache-manager.js',
  'test-sanitize.js',
  'test-entity-extractor.js',
  'test-embedding.js',
  'test-auto-classifier.js',
  'test-bookmark-tagger.js',
  'test-wiki-query.js',
]);

// ── LPT 分片 ──────────────────────────────────────────────
function lptShard(files, shardCount) {
  const sorted = [...files].sort((a, b) => b.size - a.size);
  const shards = Array.from({ length: shardCount }, () => []);
  const loads = new Array(shardCount).fill(0);

  for (const f of sorted) {
    let minIdx = 0;
    for (let i = 1; i < shardCount; i++) {
      if (loads[i] < loads[minIdx]) minIdx = i;
    }
    shards[minIdx].push(f.path);
    loads[minIdx] += f.size;
  }
  return shards;
}

// ── 运行单个 shard ────────────────────────────────────────
function runShard(files, shardIdx, total) {
  return new Promise((resolve, reject) => {
    const testArgs = ['--test'];
    if (CONCURRENCY > 1) testArgs.push(`--test-concurrency=${CONCURRENCY}`);
    if (REPORTER) testArgs.push(`--test-reporter=${REPORTER}`);
    testArgs.push(...files);

    const label = `[Shard ${shardIdx + 1}/${total}]`;
    const start = performance.now();

    const child = fork(process.execPath, testArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('exit', (code) => {
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`${label} ✓ ${files.length} files in ${elapsed}s`);
        resolve({ shard: shardIdx, files: files.length, elapsed: parseFloat(elapsed), code });
      } else {
        console.error(`${label} ✗ exit code ${code} (${elapsed}s)`);
        resolve({ shard: shardIdx, files: files.length, elapsed: parseFloat(elapsed), code });
      }
    });

    child.on('error', reject);
  });
}

// ── 主流程 ────────────────────────────────────────────────
async function main() {
  const allFiles = await discoverTestFiles(TEST_DIR);
  let files;

  if (IS_SMOKE) {
    files = allFiles.filter(f => SMOKE_BASENAMES.has(f.name));
    console.log(`\n🔥 Smoke Test Mode: ${files.length} files\n`);
  } else {
    files = allFiles;
    console.log(`\n📦 Full Test Mode: ${files.length} files\n`);
  }

  if (files.length === 0) {
    console.error('No test files found!');
    process.exit(1);
  }

  // 分片
  const effectiveShards = IS_SMOKE ? 1 : Math.min(SHARD_COUNT, files.length);
  const shards = lptShard(files, effectiveShards);

  if (SPECIFIC_SHARD >= 0) {
    // 只运行指定分片
    if (SPECIFIC_SHARD >= effectiveShards) {
      console.error(`Shard ${SPECIFIC_SHARD} out of range (0-${effectiveShards - 1})`);
      process.exit(1);
    }
    const result = await runShard(shards[SPECIFIC_SHARD], SPECIFIC_SHARD, effectiveShards);
    process.exit(result.code);
  } else {
    // 并行运行所有分片
    console.log(`🚀 Running ${effectiveShards} shards in parallel...\n`);
    const start = performance.now();

    const results = await Promise.all(
      shards.map((shard, i) => runShard(shard, i, effectiveShards))
    );

    const totalTime = ((performance.now() - start) / 1000).toFixed(2);
    const totalFiles = results.reduce((sum, r) => sum + r.files, 0);
    const failures = results.filter(r => r.code !== 0);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Summary: ${totalFiles} files across ${effectiveShards} shards`);
    console.log(`⏱  Total wall time: ${totalTime}s`);
    console.log(`✅ Passed shards: ${effectiveShards - failures.length}/${effectiveShards}`);

    if (failures.length > 0) {
      console.log(`❌ Failed shards: ${failures.map(f => f.shard + 1).join(', ')}`);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
