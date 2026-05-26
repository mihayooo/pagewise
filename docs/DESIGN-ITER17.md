# DESIGN-ITER17.md — R183: 探索性改进

> 日期: 2026-05-26
> 复杂度: Medium

---

## 目标

代码质量优化、性能提升与新功能原型三项并行：

1. **新功能原型: `lib/async-batch-processor.js`** — 通用异步批量处理器
2. **性能优化: Ring Buffer 替换 O(n) FIFO** — `performance-profiler.js` / `performance-monitor.js`
3. **测试覆盖**: ≥50 个新测试用例

---

## 1. AsyncBatchProcessor — 异步批量处理器

### 问题

项目中多处需要异步批量操作（书签链接检查、批量内容预览、批量知识库搜索等），
当前只有 `bookmark-link-checker.js` 使用 `Promise.all`（无并发控制/无重试/无进度）。
缺乏通用的并发控制 + 重试 + 进度追踪 + 取消机制。

### 设计

```
输入: items[], processFn(item, index) → Promise
输出: { results: Array<{status, value?, error?}>, succeeded, failed, duration }
```

**核心特性:**
- 并发池 (concurrency): 可配置最大并发数 (默认 3)
- 指数退避重试 (maxRetries, baseDelay): 失败自动重试
- 进度回调 (onProgress): `({completed, total, succeeded, failed}) => void`
- 取消支持 (cancel): 取消剩余未开始的任务
- 超时控制 (timeoutMs): 单个任务超时
- 优雅降级: 部分失败不阻塞成功项

### 算法

```
维护 pending 队列 (items) + active 计数器 + results 数组
循环: while active < concurrency && pending.length > 0
  → 取出下一个 item，标记 active++
  → 执行 processFn(item)
  → 成功: results[i] = {status:'fulfilled', value}
  → 失败: 若 retries < maxRetries → 重新入队（带退避延迟）
        否则 results[i] = {status:'rejected', error}
  → active--, 触发 onProgress
  → 循环继续直到所有完成或取消
```

---

## 2. Ring Buffer FIFO 优化

### 问题

`PerformanceProfiler._record()` 使用 `Array.shift()` 实现 FIFO 淘汰，
当 maxSamples=1000 时，每次记录需要移动 999 个元素 (O(n))。
高频调用场景下（如每个 AI 响应、每次书签搜索）成为热路径瓶颈。

### 设计

用定长数组 + 双指针实现 Ring Buffer，替代 `push` + `shift`:

```
class RingBuffer {
  constructor(capacity)
  push(value) — O(1)，覆盖最旧元素
  toArray() — 按插入顺序返回
  clear()
  get length()
}
```

- `_write` 指针: 下一个写入位置
- `_count` 计数: 当前元素数（≤ capacity）
- 满时: `_write` 环绕到 0，覆盖最旧元素

### 影响范围

- `lib/performance-profiler.js`: 替换 `_record` 中的 `arr.push()` + `while (arr.length > max) arr.shift()`
- `lib/performance-monitor.js`: 同上
- 行为不变（FIFO 语义一致），仅内部数据结构优化

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/async-batch-processor.js` | 新建 | 异步批量处理器 (≤200 行) |
| `lib/ring-buffer.js` | 新建 | Ring Buffer 工具类 (≤60 行) |
| `lib/performance-profiler.js` | 修改 | 使用 RingBuffer 替代 Array |
| `lib/performance-monitor.js` | 修改 | 使用 RingBuffer 替代 Array |
| `tests/test-async-batch-processor.js` | 新建 | ≥30 用例 |
| `tests/test-ring-buffer.js` | 新建 | ≥20 用例 |

---

*遵循 CLAUDE.md 代码规范: ES Module, JSDoc, 无分号, try-catch*
