# 设计文档 — R198: 测试执行效率深度优化 TestExecutionDeepOpt

> 迭代: R40 | 日期: 2026-05-20

---

## 1. Top-10 最慢测试文件分析

| 排名 | 文件 | 耗时(ms) | 主要瓶颈 |
|------|------|----------|----------|
| 1 | test-lint-r159.js | 9996 | ESLint 规则全量验证 |
| 2 | test-bookmark-link-checker-e2e.js | 6814 | 网络延迟模拟 + setTimeout |
| 3 | test-bookmark-graph.js | 5615 | 图算法大数据集 |
| 4 | test-eslint-infra.js | 1817 | ESLint 基础设施检查 |
| 5 | test-knowledge-perf.js | 1370 | 性能基准测试 |
| 6 | test-bookmark-search.js | 932 | 搜索算法 + setTimeout |
| 7 | test-context-aware-ai.js | 898 | AI 上下文处理 + setTimeout |
| 8 | test-compat-module-system.js | 846 | 模块兼容性 |
| 9 | test-stability-utils.js | 773 | setTimeout/sleep 阻塞 |
| 10 | test-ai-cache-e2e.js | 638 | setTimeout 阻塞 |

---

## 2. 优化策略

### 策略 A: 并行度提升
- **变更文件**: `package.json`
- **变更内容**: 所有 test 脚本加入 `--test-concurrency=8`
- **预期收益**: ~30% 耗时降低（从串行到 8 路并行）

### 策略 B: 移除不必要的时间阻塞
- **涉及文件**: 19 个测试文件共 48 处 setTimeout/sleep 调用
- **优化方式**:
  - 测试夹具等待 → 移除或减小延迟值（如 100ms → 10ms）
  - debounce/throttle 测试 → 保留但减小等待时间
  - 网络延迟模拟 → 减小至最小可用值

### 策略 C: Smoke Test 子集
- **新增**: `package.json` 中 `test:smoke` 脚本
- **文件列表**: 精选核心测试文件
- **目标**: ≤100 用例，<5s

---

## 3. 需修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 加入 `--test-concurrency=8`，新增 `test:smoke` |
| `tests/test-ai-cache-e2e.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-bookmark-link-checker-e2e.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-bookmark-search.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-context-aware-ai.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-stability-utils.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-cache-manager.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-history-panel.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-conversation-store.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-conversation-store-e2e.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-ai-cache.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-bookmark-ai-recommender.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `tests/test-bookmark-accessibility.js` | 修改 | 移除/减小 setTimeout 延迟 |
| `docs/DESIGN-ITER40.md` | 创建 | 本文档 |
| `docs/IMPLEMENTATION.md` | 修改 | 记录实现细节 |
| `docs/CHANGELOG.md` | 修改 | 记录变更 |
| `docs/TODO.md` | 修改 | 标记 R198 完成 |

---

## 4. 接口设计

### package.json 新增脚本
```json
{
  "test": "node --test --test-concurrency=8 'tests/*.js'",
  "test:ci": "node --test --test-concurrency=8 $(find tests -name 'test-*.js' -not -name 'test-e2e-*' -not -path 'tests/e2e/*' | sort)",
  "test:smoke": "node --test --test-concurrency=8 tests/test-utils.js tests/test-ai-client.js tests/test-conversation-store.js tests/test-knowledge-base.js tests/test-page-sense.js tests/test-skill-engine.js tests/test-bookmark-store.js tests/test-highlight-store.js tests/test-embedding-engine.js"
}
```

### setTimeout 优化接口
- 大部分 `setTimeout` 用于模拟异步操作
- 优化方式: 将延迟值从 100-500ms 降至 10-50ms
- 保留 debounce/throttle 相关的必要等待，但减小值

---

*设计文档 — R198 飞轮迭代 R40*
