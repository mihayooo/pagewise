#!/usr/bin/env node
/**
 * sidepanel-perf-benchmark.js — SidePanel 性能基准脚本
 *
 * R332: SidebarPerfOpt
 *
 * Node.js 独立运行脚本，测量以下三项关键指标：
 *   - 首屏渲染时间: 分页读取 + 索引构建 + 首屏列表可交互
 *   - 搜索响应时间: 输入查询 → 返回结果（含索引查找 + 排序）
 *   - 图谱渲染时间: 力导向布局计算（节点/边数据就绪）
 *
 * 生成模拟书签数据集 (100 / 500 / 1000 条三档)
 * 输出 JSON 基线报告
 *
 * 使用方式: node scripts/sidepanel-perf-benchmark.js
 *
 * 复用:
 *   - buildSearchIndex / searchWithIndex (lib/bookmark-performance-opt.js)
 *   - getVisibleRange (lib/virtual-scroll.js)
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { buildSearchIndex, searchWithIndex, lazyLoadBookmarks, getIndexStats } =
  await import('../lib/bookmark-performance-opt.js');

const { getVisibleRange } =
  await import('../lib/virtual-scroll.js');

// ==================== 数据生成 ====================

const DOMAINS = [
  'react.dev', 'vuejs.org', 'nodejs.org', 'python.org', 'github.com',
  'mdn.dev', 'stackoverflow.com', 'css-tricks.com', 'typescriptlang.org', 'aws.amazon.com',
  'developer.chrome.com', 'web.dev', 'vitejs.dev', 'nextjs.org', 'svelte.dev',
  'angular.io', 'deno.land', 'bun.sh', 'rust-lang.org', 'go.dev',
];

const TAG_POOL = [
  'frontend', 'backend', 'react', 'vue', 'nodejs', 'python', 'ml', 'ai',
  'css', 'html', 'javascript', 'typescript', 'rust', 'go', 'devops',
  'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'tools', 'docs', 'qa',
];

const FOLDER_POOL = [
  ['技术', '前端'], ['技术', '后端'], ['技术', 'AI'],
  ['工具'], ['工具', 'DevOps'], ['参考'], ['教程'],
];

function generateBookmark(id) {
  const domainIdx = id % DOMAINS.length;
  const folderIdx = id % FOLDER_POOL.length;
  const tagCount = 2 + (id % 3);
  const tags = [];
  for (let t = 0; t < tagCount; t++) {
    tags.push(TAG_POOL[(id + t * 7) % TAG_POOL.length]);
  }

  return {
    id: String(id),
    title: `Bookmark ${id} - ${DOMAINS[domainIdx]} article about ${TAG_POOL[id % TAG_POOL.length]}`,
    url: `https://${DOMAINS[domainIdx]}/articles/${id}/${TAG_POOL[id % TAG_POOL.length]}`,
    folderPath: FOLDER_POOL[folderIdx],
    tags,
    status: id % 4 === 0 ? 'read' : id % 4 === 1 ? 'reading' : 'unread',
    dateAdded: 1700000000000 + id * 86400000,
  };
}

function generateBookmarks(n) {
  const bookmarks = [];
  for (let i = 0; i < n; i++) {
    bookmarks.push(generateBookmark(i));
  }
  return bookmarks;
}

// ==================== 测量函数 ====================

function measure(fn, iterations = 5) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((s, t) => s + t, 0);
  return {
    avg: +(sum / times.length).toFixed(2),
    p50: +times[Math.floor(times.length * 0.5)].toFixed(2),
    p95: +times[Math.floor(times.length * 0.95)].toFixed(2),
    min: +times[0].toFixed(2),
    max: +times[times.length - 1].toFixed(2),
    iterations,
  };
}

// ==================== 图谱力导向布局模拟 ====================

/**
 * 简化版力导向布局 (Node.js 环境)
 * 不使用 Canvas，纯计算
 */
function simulateForceLayout(nodes, edges, iterations = 50) {
  const positions = new Map();
  for (const node of nodes) {
    positions.set(node.id, {
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx: 0,
      vy: 0,
    });
  }

  const repulsion = 100;
  const attraction = 0.01;
  const damping = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    // 库仑斥力
    const posArr = [...positions.values()];
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const dx = posArr[i].x - posArr[j].x;
        const dy = posArr[i].y - posArr[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        posArr[i].vx += fx;
        posArr[i].vy += fy;
        posArr[j].vx -= fx;
        posArr[j].vy -= fy;
      }
    }

    // 弹簧引力
    for (const edge of edges) {
      const src = positions.get(edge.source);
      const tgt = positions.get(edge.target);
      if (!src || !tgt) continue;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = attraction * dist;
      src.vx += (dx / dist) * force;
      src.vy += (dy / dist) * force;
      tgt.vx -= (dx / dist) * force;
      tgt.vy -= (dy / dist) * force;
    }

    // 更新位置
    for (const [, pos] of positions) {
      pos.x += pos.vx;
      pos.y += pos.vy;
      pos.vx *= damping;
      pos.vy *= damping;
    }
  }

  return positions;
}

// ==================== 基准测试 ====================

const DATASET_SIZES = [100, 500, 1000];

async function runBenchmark() {
  console.log('=== PageWise SidePanel Performance Benchmark ===\n');

  const report = {
    timestamp: new Date().toISOString(),
    environment: 'node',
    nodeVersion: process.version,
    datasets: {},
  };

  for (const size of DATASET_SIZES) {
    console.log(`📊 Dataset: ${size} bookmarks`);
    const bookmarks = generateBookmarks(size);

    // 模拟图谱边
    const edges = [];
    for (let i = 1; i < size; i++) {
      if (i % 3 !== 0) {
        edges.push({ source: String(i - 1), target: String(i) });
      }
      if (i > 5 && i % 7 === 0) {
        edges.push({ source: String(i), target: String(i - 5) });
      }
    }
    const nodes = bookmarks.map(b => ({ id: b.id, label: b.title }));

    // 1. 首屏渲染
    const firstScreen = measure(() => {
      const page = lazyLoadBookmarks(bookmarks, 50, 0);
      const idx = buildSearchIndex(page.items);
      const range = getVisibleRange(0, 400, page.items.length, 40, 5);
      return { page, idx, range };
    });

    // 2. 搜索响应（预热后）
    const fullIndex = buildSearchIndex(bookmarks);
    const queries = ['frontend', 'react', 'python', 'tools', 'backend'];
    const searchResults = {};
    for (const q of queries) {
      searchResults[q] = measure(() => {
        return searchWithIndex(fullIndex, q);
      });
    }
    const search = {
      indexStats: getIndexStats(fullIndex),
      queries: searchResults,
    };

    // 3. 图谱渲染
    const graph = measure(() => {
      simulateForceLayout(nodes, edges, 50);
    });

    report.datasets[size] = {
      firstScreen,
      search,
      graph,
    };

    // 输出摘要
    console.log(`  首屏: avg=${firstScreen.avg}ms p50=${firstScreen.p50}ms p95=${firstScreen.p95}ms`);
    console.log(`  搜索: avg=${searchResults.frontend.avg}ms (frontend)`);
    console.log(`  图谱: avg=${graph.avg}ms p50=${graph.p50}ms p95=${graph.p95}ms`);
    console.log();
  }

  // 输出 JSON 报告
  const outputPath = resolve(__dirname, '..', 'docs', 'reports', 'sidepanel-perf-baseline.json');
  try {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`✅ 报告已写入: ${outputPath}`);
  } catch (e) {
    console.warn(`⚠️ 写入报告失败: ${e.message}`);
  }

  // 性能断言检查
  console.log('\n=== 性能目标检查 ===');
  const d1000 = report.datasets[1000];
  if (d1000) {
    const firstScreenOk = d1000.firstScreen.p50 < 500;
    const searchOk = d1000.search.queries.frontend.p50 < 100;
    console.log(`  首屏 < 500ms (p50): ${firstScreenOk ? '✅' : '❌'} ${d1000.firstScreen.p50}ms`);
    console.log(`  搜索 < 100ms (p50): ${searchOk ? '✅' : '❌'} ${d1000.search.queries.frontend.p50}ms`);
  }

  console.log('\n=== 完成 ===');
  return report;
}

runBenchmark().catch(console.error);
