# 需求文档 — R227: 测试执行效率深度优化 TestExecutionDeepOpt2

> 版本: 1.0
> 日期: 2026-05-20
> 迭代: 飞轮迭代 R63 (R227)
> 复杂度: Medium
> 前序迭代: R222 (CoverageBreak50)、R226 (ModuleSplitAbsoluteFinal)

---

## 1. 背景与动机

### 1.1 现状分析

PageWise 项目当前拥有 **208 个 CI 测试文件**，`npm run test:ci` 执行 **~7472 个用例**，总耗时约 **42.5 秒**。历史目标 ≤30s 在 R202（24s 基线）之后多次尝试优化均未达成。

`package.json` 中 `test:ci` 命令已配置 `--test-concurrency=8`，但实际执行时间仍远超 30s 目标，说明瓶颈不在并行度配置本身，而在测试文件内部的阻塞代码。

经初步扫描，测试代码中存在 **64 处** `setTimeout` / `await sleep` / `new Promise(...setTimeout...)` 模式，分布在至少 **20 个测试文件**中。高频文件包括：

| 文件 | 阻塞模式出现次数 | 预估影响 |
|------|-----------------|----------|
| `tests/e2e/chrome-mock-inject.js` | 14 | e2e mock 层，高影响 |
| `tests/test-ai-cache-e2e.js` | 8 | 缓存 e2e，高影响 |
| `tests/test-cache-manager.js` | 5 | 缓存管理 |
| `tests/test-ai-cache.js` | 5 | 缓存单元 |
| `tests/test-conversation-store.js` | 3 | 对话存储 |
| `tests/test-bookmark-search.js` | 2 | 搜索 |
| 其他 14 个文件 | 27 | 分散在各模块 |

此外，现有 `test:smoke` 脚本仅覆盖 **11 个文件**（~80 用例），但未设置 <5s 的时间门禁，也未集成到 CI 流水线作为快速反馈通道。

### 1.2 问题清单

1. **42.5s 总耗时远超 ≤30s 目标** — 降幅需 ≥30%（从 42.5s → ≤30s）
2. **64 处阻塞代码残留** — `setTimeout` / `await sleep` 等人为延迟散布在 20+ 个测试文件中
3. **缺少慢用例分析** — 无 duration_ms 排名数据，无法定位 Top-15 最慢文件
4. **Smoke test 未门禁化** — `test:smoke` 存在但无时间限制，未在 CI 中作为快速失败通道

### 1.3 目标

通过「测量 → 消除阻塞 → 提升并行度 → 建立 smoke 门禁」四步，将全量测试从 42.5s 降至 ≤30s（降幅 ≥30%），并建立可持续的测试效率保障机制。

---

## 2. 用户故事

> **作为** PageWise 的开发者，
> **我希望** CI 测试套件在 30 秒内完成全量执行，并有一个 5 秒内出结果的 smoke test 子集用于快速验证，
> **以便** 每次提交后快速获得反馈，不因测试等待时间过长而中断开发节奏。

---

## 3. 验收标准

### AC-1: 完成 Top-15 最慢测试文件分析

产出 `tests/slow-test-analysis.md` 文档，内容包括：
- 按 `duration_ms` 排序的 Top-15 最慢测试文件清单
- 每个文件中标记 >500ms 的阻塞用例（用例名 + 耗时 + 阻塞原因）
- 每个文件的优化建议（移除 sleep / mock 替换 / 合并用例等）

测量方式：
```bash
# 使用 Node.js 内置 test runner 的 --test-reporter 标准输出获取 duration
node --test --test-concurrency=8 --test-reporter=spec $(find tests -name 'test-*.js' ...) 2>&1 | \
  grep -E 'ms$' | sort -t: -k2 -nr | head -15
```

### AC-2: 移除测试中残留的阻塞代码

在 `test:ci` 涉及的 208 个测试文件中：
- 移除或替换所有不必要的 `setTimeout` / `await sleep()` / `new Promise(resolve => setTimeout(resolve, N))`
- **保留**场景：测试 debounce/throttle 行为时的 `setTimeout`（需在代码中用注释标注 `// intentionally delayed for debounce test`）
- **替换策略**：
  - 等待异步操作 → 使用 `await` 直接等待 Promise resolve，或使用事件监听
  - 模拟延迟 → mock `Date.now()` 或使用 `vi.useFakeTimers()`（若使用 vitest）或 `node:test` 的 mock timer
  - 轮询等待 → 改为事件驱动或直接断言

验证命令：
```bash
# 不含 "intentionally" 注释的 setTimeout/sleep 数量应为 0
grep -rn "setTimeout\|await sleep" tests/ --include="*.js" -l | \
  xargs grep -L "intentionally" | wc -l  # 期望: 0
```

### AC-3: 并行度优化

- 确认 `--test-concurrency=8` 在 CI 环境生效
- 评估是否可提升至 `--test-concurrency=12` 或更高（取决于 CI runner CPU 核心数）
- 将最慢的测试文件均匀分布到不同的并行分片中（避免多个慢文件在同一分片）

验证：对比优化前后的 `time npm run test:ci` 输出。

### AC-4: 建立 `test:smoke` CI 门禁

`npm run test:smoke` 要求：
- **用例数**: ≤ 80 个（覆盖核心流程：utils / ai-client / conversation-store / page-sense / skill-engine / storage-adapter / sanitize / cost-estimator / bookmark-indexer / bookmark-core-unit）
- **执行时间**: < 5 秒
- **时间门禁**: 在 `package.json` 或 CI 脚本中增加时间检查，超时则 fail

```bash
# package.json 中的 script
"test:smoke": "node --test --test-concurrency=4 tests/test-smoke.js tests/test-utils.js ...",
"test:smoke:gate": "timeout 5 npm run test:smoke || (echo '❌ Smoke test exceeded 5s limit' && exit 1)"
```

验证命令：
```bash
npm run test:smoke:gate  # exit 0 且 < 5s
```

### AC-5: 全量测试 ≤ 30 秒

执行 `npm run test:ci`，结果要求：
- **总耗时 ≤ 30 秒**（当前 42.5s，降幅 ≥30%）
- **失败数 = 0**
- **通过数 ≥ 7400**（不因优化而删除有效用例）
- 测试通过率 = 100%

验证方式：
```bash
time npm run test:ci
# 实际耗时应 ≤ 30s
```

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| 不删除有效用例 | 优化只移除人为延迟，不删除断言逻辑；通过数 ≥ 7400 |
| API 不变 | `test:ci`、`test:smoke` 等现有 script 名称保持不变 |
| 向后兼容 | `test:smoke` 的文件列表可调整但必须覆盖核心模块 |
| Node.js 内置 test runner | 项目使用 `node --test`（非 Jest/Vitest/Mocha），优化手段需兼容 |
| 无新依赖 | 不引入额外测试框架或计时工具，使用 Node.js 内置能力 |
| CI 环境限制 | CI runner 通常 2-4 核，`--test-concurrency` 不应超过物理核心数 |
| 覆盖率不降 | 本轮不涉及覆盖率指标调整，但优化后 `npm run coverage:gate` 需继续通过 |
| 保留 e2e 排除 | `test:ci` 已排除 `e2e/` 和 `e2e-chrome/` 目录，本轮不改变此策略 |

---

## 5. 依赖关系

```
R222 (CoverageBreak50) ──→ R227 (TestExecutionDeepOpt2) ──→ R228+ (后续迭代)
R226 (ModuleSplitAbsoluteFinal) ──→ R227 (TestExecutionDeepOpt2)
```

| 方向 | 依赖 | 说明 |
|------|------|------|
| 前置 | R222 | CoverageBreak50 — 确认 7472 用例基线和行覆盖率 ≥50% |
| 前置 | R226 | ModuleSplitAbsoluteFinal — 确认所有 lib 文件 ≤400 行，CI 门禁已建立 |
| 并行 | CI 流水线 | `test:smoke:gate` 需集成到 `ci.yml` 作为快速失败通道 |
| 后续 | R228+ | 未来迭代复用本轮建立的测试效率基线和 smoke 门禁 |
| 后续 | 覆盖率 | 优化不应破坏 R222 建立的 ≥50% 行覆盖率门禁 |

---

## 6. 非功能需求

| 维度 | 当前值 | 目标值 |
|------|-------|--------|
| `test:ci` 总耗时 | 42.5s | ≤ 30s（降幅 ≥30%） |
| `test:smoke` 耗时 | 未限制 | < 5s |
| `test:smoke` 用例数 | ~80 | ≤ 80 |
| 阻塞代码残留 | 64 处 | ≤ 3 处（仅保留有明确注释的 intentional delay） |
| 可追溯性 | — | `tests/slow-test-analysis.md` 持久保存分析结果 |

---

## 7. 风险识别

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 移除 `setTimeout` 后测试语义改变 | 测试失败或误通过 | 仅移除人为延迟，保留测试真实异步行为的 await；每处修改需本地验证 |
| 某些 `setTimeout` 是测试 debounce/throttle 的必要手段 | 误删导致测试不准确 | 用 `// intentionally delayed` 注释标记保留，AC-2 明确豁免 |
| `--test-concurrency` 提升导致资源竞争 | 测试间互相干扰、随机失败 | 逐步提升（8 → 10 → 12），每次验证稳定性后再继续 |
| Smoke test 覆盖不足 | 核心模块回归未被快速拦截 | 保留现有 11 个文件的选择，必要时增加 1-2 个关键模块 |
| CI runner 性能不稳定 | 30s 目标在 CI 中偶尔超标 | 设置 30s 为硬目标，允许 ±2s 波动；烟雾测试 5s 为硬门禁 |
| 优化后用例数下降 | 误删有效用例 | AC-5 要求 ≥ 7400 用例，对比优化前后用例差值 |

---

## 8. 实施策略（概要）

### Phase 1: 度量基准 (≤1 次迭代)
- 运行 `node --test --test-reporter=spec` 获取每个文件的 duration_ms
- 产出 Top-15 慢文件分析报告

### Phase 2: 消除阻塞 (≤1 次迭代)
- 从 Top-15 开始，逐文件移除不必要 `setTimeout` / `await sleep`
- 每个文件修改后立即运行该文件的测试验证

### Phase 3: 并行度调整 (≤0.5 次迭代)
- 调整 `--test-concurrency` 参数
- 全量回归验证

### Phase 4: Smoke 门禁 (≤0.5 次迭代)
- 新增 `test:smoke:gate` script
- 集成到 CI

---

*文档生成于 2026-05-20，遵循飞轮迭代流程 (flywheel-iteration)*
