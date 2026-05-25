# VERIFICATION.md — Iteration #21 Review

> **任务**: R307: 语义搜索 IVF 性能深度优化 SemanticSearchPerfOpt
> **审查日期**: 2026-05-25
> **审查结论**: ❌ **严重不匹配 — 交付内容与任务要求完全不符**

---

## 审核总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ❌ | R307 的 7 项要求（性能剖析/质心优化/TypedArray/堆排序/PQ 降级/15 用例/性能基线）均未实现；实际交付的是 R306（覆盖率门禁恢复）的基础设施调整 |
| 代码质量 | ⚠️ | 已交付的 R306 变更本身质量可接受（合理移除 `all:true`），但与 R307 任务无关 |
| 测试覆盖 | ❌ | R307 要求 ≥15 个 IVF 参数调优用例，实际新增 0 个；已有测试仅覆盖 R305 基础 IVF 功能 |
| 文档同步 | ❌ | CHANGELOG.md 无 R307/R306 条目；TODO.md R307 仍标记为 `[ ]` 未完成 |

---

## 🔴 核心问题: 任务-交付不匹配

### 交付内容（实际 diff）

Git diff 显示 **6 个文件变更**，全部属于 **R306（CoverageGateRecovery）** 而非 R307：

| 文件 | 变更 | 归属 |
|------|------|------|
| `.c8rc.json` | 移除 `all: true` 和 `src: ["lib"]` | R306 |
| `scripts/validate-c8-config.sh` | 更新验证：移除 `all:true` 检查，改为 pass-through 注释 | R306 |
| `tests/test-coverage-infra.js` | 断言改为 `all === undefined` | R306 |
| `tests/test-infra-health.js` | 移除 `all` 断言，改为注释 | R306 |
| `tests/test-r156-coverage-infra.js` | 断言 `all === undefined` + `src === undefined` | R306 |
| `tests/test-r291-coverage-config-drift-guard.js` | 断言 `all === undefined` + 从 requiredFields 移除 `all`/`src` | R306 |

**这些变更合理地将 c8 覆盖率配置从全量统计改为仅统计被导入模块**，但它们与 IVF 性能优化毫无关系。

### R307 要求 vs 实际交付

| R307 要求 | 实际交付 | 状态 |
|-----------|---------|------|
| (1) 性能剖析: `performance.now()` 对 3 阶段分别计时 | ❌ 无 | 未实现 |
| (2) 质心距离优化: 预计算 L2 范数缓存至 IVF 结构 | ⚠️ R305 已有部分（`_centroidNorms` lazy cache），R307 要求预构建时缓存 | 未增强 |
| (3) 簇内检索: TypedArray Float32Array + >200 条跳表剪枝 | ❌ 无 | 未实现 |
| (4) 融合排序: 单次堆排序替代两次独立排序+归并 | ❌ 无 | 未实现 |
| (5) 大规模降级: >5000 条自动切换 PQ 压缩 128→8 维 | ❌ 无 | 未实现 |
| (6) ≥15 用例覆盖 IVF 参数调优 | ❌ 无新增测试 | 未实现 |
| (7) 性能基线: 1000条<50ms / 5000条<200ms / 10000条<500ms | ❌ 无性能基准测试 | 未实现 |

### 现有 IVF 代码状态（R305 遗留）

当前 `_ivfSearch` 方法（`bookmark-semantic-search-hybrid.js:88-158`）已有 R305 的快速修复：
- ✅ 查询向量 L2 范数预计算
- ✅ 质心 L2 范数 lazy 缓存（`ivf._centroidNorms`）
- ✅ 质心距离用 dot product 替代完整 cosineSimilarity
- ✅ 每簇候选集限制（`perClusterLimit = limit * 2`）
- ✅ 提前终止（`scored.length >= limit * 3 && centroidSim < 0.1`）

但以下 R307 核心优化均 **完全缺失**：
- ❌ 无 `performance.now()` 阶段计时
- ❌ 无 Float32Array SIMD 友好内存布局
- ❌ 无跳表剪枝（单簇 >200 条）
- ❌ 无堆排序融合（RRF 仍用两次遍历 + 独立排序）
- ❌ 无 Product Quantization 降级路径
- ❌ 无 IVF 参数调优测试

---

## 详细审查: R306 变更质量（附带）

虽然 R306 不是本次审查重点，但作为附带评估：

### `.c8rc.json` 变更 ✅
```diff
-  "all": true,
-  "src": ["lib"],
```
移除 `all:true` 是合理的——171 个未测试 lib 模块计入分母导致覆盖率虚低（24% vs 实际 ~75%）。

### 验证脚本 ⚠️
`scripts/validate-c8-config.sh` 第 125-127 行将验证改为无条件 pass：
```bash
# R306: 移除 all:true — 171 个未测试模块计入分母导致覆盖率虚低
pass "all: not set (R306 — only count imported modules)"
```
**问题**: 这不是验证，只是打印 pass。如果将来有人误加 `all: true`，此脚本不会检测到。应改为：
```bash
if [ "$ALL_VALUE" = "true" ]; then
  fail "all should not be set (R306)"
else
  pass "all: not set (R306)"
fi
```

### 测试断言更新 ✅
4 个测试文件正确更新了断言从 `assert.equal(c8rc.all, true)` 到 `assert.equal(c8rc.all, undefined)`。

---

## 发现的问题

### P0 — 阻塞级
1. **任务-交付完全不匹配**: R307 语义搜索 IVF 性能优化任务未执行，交付的是 R306 覆盖率配置变更。需重新执行 R307。

### P1 — 重要
2. **CHANGELOG 未更新**: R306 和 R307 均未记录在 CHANGELOG.md 中。
3. **验证脚本弱化**: `validate-c8-config.sh` 的 `all` 检查变为无条件 pass，丧失了配置防漂移能力。

### P2 — 一般
4. **TODO.md 未勾选**: R306 在 TODO.md 中仍标记为 `[x]`（已完成），需确认提交时机。
5. **测试结果为 0/0**: 未运行测试，无法验证 R306 变更的测试全部通过。

---

## 返工任务清单

| # | 优先级 | 任务 | 说明 |
|---|--------|------|------|
| 1 | **P0** | 执行 R307 IVF 性能优化 | 完整实现 7 项要求：性能剖析/TypedArray/堆排序/PQ/测试/基线 |
| 2 | P1 | 修复验证脚本 | `validate-c8-config.sh` 的 `all` 检查应改为反向断言（检测不应设置），而非无条件 pass |
| 3 | P1 | 更新 CHANGELOG.md | 补充 R306 变更条目（c8 配置优化） |
| 4 | P1 | 更新 CHANGELOG.md | R307 完成后补充变更条目 |
| 5 | P2 | 运行完整测试 | 验证 `npm run test:ci` R306 变更后 0 fail |
| 6 | P2 | R307 完成后标记 TODO | 将 TODO.md R307 标记为 `[x]` |

---

## R307 实施建议

基于当前代码库分析，建议 R307 实施路径：

### 1. 性能剖析（阶段计时）
```javascript
// bookmark-semantic-search-hybrid.js _ivfSearch 中插入:
const t0 = performance.now()
// Phase 1: 质心距离计算
const t1 = performance.now()
// Phase 2: 簇内检索
const t2 = performance.now()
// Phase 3: 排序合并
const t3 = performance.now()
// 记录 {centroid: t1-t0, search: t2-t1, sort: t3-t2}
```

### 2. TypedArray 簇内检索
- 将 Map-based 稀疏向量转为 Float32Array 稠密向量（词汇表 → 维度映射）
- 单簇 >200 条时使用 top-k 堆排序替代全量排序

### 3. RRF 堆排序
- 将 `rrfMerge` 的两次遍历 + 最终 `sort()` 改为单次构建 min-heap，直接取 top-k

### 4. PQ 降级（>5000 条）
- 128 维 → 8 个子空间 × 16 量化码本
- 搜索时先查粗量化码本，再在候选簇内精排

### 5. 测试用例（≥15）
- nprobe 参数 sweep（1/3/5/8/16）精度 vs 速度
- cluster count sweep（8/16/32/64）聚类质量
- 性能基线验证（1000/5000/10000 条）
- PQ 精度损失 <5% 验证
- 边界条件（空簇、单元素簇）

