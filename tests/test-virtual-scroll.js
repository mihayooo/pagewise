/**
 * 测试 lib/virtual-scroll.js — 虚拟滚动计算引擎
 *
 * R332: SidebarPerfOpt
 *
 * 测试范围:
 *   getVisibleRange / shouldEnableVirtualization / createVirtualList
 *   固定高度 / 动态高度 / 虚拟化阈值 / 边界情况 / 性能断言
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  getVisibleRange,
  shouldEnableVirtualization,
  createVirtualList,
} = await import('../lib/virtual-scroll.js');

// ==================== getVisibleRange ====================

describe('getVisibleRange', () => {
  it('1. 基本计算 — 居中滚动位置', () => {
    // 40px/item, container 400px (10 items visible), overscan 5
    // scrollTop = 200 (item 5), so startIndex = max(0, 5-5) = 0, endIndex = min(50, 0+10+10) = 20
    const r = getVisibleRange(200, 400, 50, 40, 5);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 20);
    assert.equal(r.offsetY, 0);
    assert.equal(r.totalHeight, 2000);
  });

  it('2. 深层滚动 — startIndex 超出 overscan', () => {
    // scrollTop = 2000 (item 50), startIndex = max(0, 50-5) = 45
    const r = getVisibleRange(2000, 400, 100, 40, 5);
    assert.equal(r.startIndex, 45);
    assert.equal(r.endIndex, 65);
    assert.equal(r.offsetY, 1800);
    assert.equal(r.totalHeight, 4000);
  });

  it('3. 边界: endIndex 不超出 totalItems', () => {
    const r = getVisibleRange(0, 400, 5, 40, 5);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 5); // clamp to totalItems
    assert.equal(r.offsetY, 0);
    assert.equal(r.totalHeight, 200);
  });

  it('4. 边界: 空列表', () => {
    const r = getVisibleRange(0, 400, 0, 40, 5);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 0);
    assert.equal(r.totalHeight, 0);
  });

  it('5. 边界: 零高度容器', () => {
    const r = getVisibleRange(0, 0, 100, 40, 5);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 0);
    assert.equal(r.totalHeight, 0);
  });

  it('6. 边界: 零高度项', () => {
    const r = getVisibleRange(0, 400, 100, 0, 5);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 0);
    assert.equal(r.totalHeight, 0);
  });

  it('7. 默认 overscan = 5', () => {
    // scrollTop = 800 (item 20), no overscan param → default 5
    const r = getVisibleRange(800, 400, 200, 40);
    assert.equal(r.startIndex, 15); // max(0, 20-5)
    assert.equal(r.endIndex, 35);   // 15 + 10 + 10
    assert.equal(r.offsetY, 600);
  });
});

// ==================== shouldEnableVirtualization ====================

describe('shouldEnableVirtualization', () => {
  it('8. 默认阈值 100 — 100 项不启用', () => {
    assert.equal(shouldEnableVirtualization(100), false);
  });

  it('9. 默认阈值 100 — 101 项启用', () => {
    assert.equal(shouldEnableVirtualization(101), true);
  });

  it('10. 自定义阈值', () => {
    assert.equal(shouldEnableVirtualization(50, 50), false);
    assert.equal(shouldEnableVirtualization(51, 50), true);
  });

  it('11. 边界: 0 项不启用', () => {
    assert.equal(shouldEnableVirtualization(0), false);
  });

  it('12. 边界: 负数不启用', () => {
    assert.equal(shouldEnableVirtualization(-1), false);
  });

  it('13. 边界: 非数字输入', () => {
    assert.equal(shouldEnableVirtualization('abc'), false);
    assert.equal(shouldEnableVirtualization(null), false);
    assert.equal(shouldEnableVirtualization(undefined), false);
  });
});

// ==================== createVirtualList ====================

describe('createVirtualList', () => {
  it('14. 固定高度模式 — 基本范围计算', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400, overscan: 5, threshold: 100 });
    const r = vl.getRange(0, 200);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 20); // visible(10) + overscan(5)*2
    assert.equal(r.offsetY, 0);
    assert.equal(r.totalHeight, 8000);
  });

  it('15. 固定高度模式 — 深层滚动', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400, overscan: 5, threshold: 100 });
    const r = vl.getRange(4000, 200);
    assert.equal(r.startIndex, 95); // floor(4000/40) - 5 = 95
    assert.equal(r.endIndex, 115);  // 95 + 10 + 10
    assert.equal(r.offsetY, 3800);
  });

  it('16. 虚拟化未启用 — 小列表返回全部', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400, threshold: 100 });
    const r = vl.getRange(0, 50); // 50 < 100 threshold
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 50); // 全部显示
    assert.equal(r.totalHeight, 2000);
  });

  it('17. markDirty — 重置缓存', () => {
    const vl = createVirtualList({
      itemHeight: 40,
      containerHeight: 400,
      getItemHeight: (i) => (i % 2 === 0 ? 40 : 60),
    });
    vl.getRange(0, 200); // 构建缓存
    const m1 = vl.getMetrics(200);
    assert.ok(m1.cacheSize > 0, '缓存应有内容');

    vl.markDirty();
    const m2 = vl.getMetrics(200);
    assert.equal(m2.cacheSize, 0, 'markDirty 后缓存应清空');
  });

  it('18. getMetrics — 正确报告状态', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400, overscan: 5, threshold: 100 });
    const m = vl.getMetrics(200);
    assert.equal(m.itemHeight, 40);
    assert.equal(m.containerHeight, 400);
    assert.equal(m.overscan, 5);
    assert.equal(m.threshold, 100);
    assert.equal(m.virtualized, true); // 200 > 100
    assert.equal(m.totalItems, 200);
    assert.equal(m.dynamicHeight, false);
  });

  it('19. shouldEnableVirtualization 代理', () => {
    const vl = createVirtualList({ threshold: 50 });
    assert.equal(vl.shouldEnableVirtualization(49), false);
    assert.equal(vl.shouldEnableVirtualization(51), true);
  });

  it('20. 空列表返回零值', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400 });
    const r = vl.getRange(0, 0);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 0);
    assert.equal(r.totalHeight, 0);
  });
});

// ==================== 动态高度模式 ====================

describe('createVirtualList — 动态高度', () => {
  it('21. 动态高度 — getItemHeight 回调', () => {
    const vl = createVirtualList({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 5,
      threshold: 10,
      getItemHeight: (i) => (i === 0 ? 80 : 40), // 第一项 80px
    });
    const r = vl.getRange(0, 200);
    assert.equal(r.startIndex, 0);
    assert.ok(r.endIndex > 0, '应有可见项');
    assert.equal(r.offsetY, 0);
    // 总高度 = 80 + 199*40 = 80 + 7960 = 8040
    assert.equal(r.totalHeight, 8040);
  });

  it('22. 动态高度 — 深层滚动后 offsetY 正确', () => {
    const vl = createVirtualList({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 5,
      threshold: 10,
      getItemHeight: () => 40, // 全部 40px
    });
    // 200 items, scrollTop=3200 (item 80)
    const r = vl.getRange(3200, 200);
    assert.equal(r.startIndex, 75); // floor(3200/40) - 5
    assert.equal(r.offsetY, 3000);  // 75 * 40
  });

  it('23. getMetrics — dynamicHeight 标记', () => {
    const vl = createVirtualList({
      itemHeight: 40,
      getItemHeight: () => 40,
    });
    const m = vl.getMetrics(200);
    assert.equal(m.dynamicHeight, true);
  });
});

// ==================== 性能断言 ====================

describe('VirtualScroll 性能', () => {
  it('24. 虚拟滚动计算 < 1ms (1000 项)', () => {
    const vl = createVirtualList({ itemHeight: 40, containerHeight: 400, overscan: 5 });
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      vl.getRange(Math.random() * 40000, 1000);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `100 次虚拟滚动计算应 < 100ms，实际 ${elapsed.toFixed(2)}ms`);
    // 单次应 < 1ms
    assert.ok(elapsed / 100 < 1, `单次计算应 < 1ms，实际 ${(elapsed / 100).toFixed(3)}ms`);
  });

  it('25. 动态高度模式前缀和构建 < 10ms (1000 项)', () => {
    const vl = createVirtualList({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 5,
      threshold: 100,
      getItemHeight: (i) => 30 + (i % 5) * 10,
    });
    const start = performance.now();
    vl.getRange(0, 1000); // 触发前缀和构建
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 10, `前缀和构建应 < 10ms，实际 ${elapsed.toFixed(2)}ms`);
  });
});
