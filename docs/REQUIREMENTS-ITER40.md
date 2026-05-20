# 需求文档 — R198: 测试执行效率深度优化 TestExecutionDeepOpt

> 迭代: R39/R40  
> 日期: 2026-05-20  
> 复杂度: Medium  
> 优先级: P1 — 开发效能  

---

## 1. 用户故事

**作为** PageWise 的开发者，  
**我希望** 全量测试套件（~6991 用例）执行耗时从当前 ~42.7s 降至 ≤30s，  
**以便** 每次迭代的反馈循环缩短 30%+，提升开发效率并降低 CI 等待成本。

---

## 2. 背景与现状

| 指标 | 当前值 | 历史目标 (R152) | 本次目标 |
|------|--------|-----------------|----------|
| 测试用例数 | 6989 pass + 2 fail | — | 不变 |
| 全量执行耗时 | ~42.7s | ≤25s（未达成） | **≤30s** |
| 测试文件数 | 187 | — | 不变 |
| 串行/并行 | 串行（默认 `--test-concurrency` 未设置） | — | `--test-concurrency=8` |
| smoke 子集 | 不存在 | — | **≤100 用例，<5s** |

### 历史迭代回顾

- **R115 (TestSuiteTrim)**: 文件瘦身，目标 ≤25s（已完成）
- **R135 (TestExecutionOpt)**: 并行 `--test-concurrency=4`、smoke 子集、移除 sleep（已完成）
- **R152 (TestExecutionOpt2)**: 识别 Top-5 最慢文件、移除 sleep、并行执行、smoke ≤3s（已完成但目标未达成）

R135/R152 声称完成，但实际耗时从 ~36s 逆增至 ~42.7s（新增 1350+ 用例），说明此前优化被用例增量吞噬，需要更深度的优化。

---

## 3. 验收标准

### AC-1: 全量测试执行耗时 ≤30s

- `node --test --test-concurrency=8 'tests/*.js'` 全量执行耗时 ≤30000ms
- 用例通过数 ≥6989（不低于当前基线）
- 用例失败数 = 0（2 个已知失败需在本迭代或独立修复）

### AC-2: Top-10 最慢测试文件分析并优化

- 产出 Top-10 最慢测试文件清单（文件名 + duration_ms）
- 每个 Top-10 文件如有可优化的 `setTimeout`/`await sleep`/`await new Promise(r => setTimeout(r, ...))` 阻塞，必须移除或替换为 `vi.useFakeTimers`/`vi.advanceTimersByTime`（或 Node.js 等价方案）
- 优化后 Top-10 文件总耗时降幅 ≥40%

### AC-3: 移除不必要的时间阻塞

- 当前 21 个测试文件中共 53 处 `setTimeout`/`sleep`/`delay` 调用
- 审计每一处：属于业务逻辑测试必需的时序等待（如 debounce 验证）标记为 `[KEEP]`，纯测试夹具等待标记为 `[REMOVE]`
- `[REMOVE]` 标记项全部移除或替换为同步 mock

### AC-4: 并行度提升至 `--test-concurrency=8`

- `package.json` 的 `test` / `test:ci` 脚本加入 `--test-concurrency=8`
- 验证并行执行不引入测试间干扰（连续 3 次运行结果一致）

### AC-5: CI Smoke Test 子集 ≤5s

- 新增 `npm run test:smoke` 脚本
- 精选 ≤100 个核心流程用例（覆盖: AI 问答、知识库存储/检索、书签 CRUD、页面感知、技能系统）
- 执行耗时 <5s
- 输出格式与 `test:ci` 一致（TAP）

---

## 4. 技术约束

1. **Node.js 原生 test runner**: 项目使用 `node --test`，不引入 Jest/Mocha 等外部测试框架
2. **Chrome Extension 测试隔离**: 测试通过 mock `chrome.*` API 运行，需确保并行执行时 mock 不跨文件泄漏
3. **向后兼容**: `npm run test` 和 `npm run test:ci` 行为不变（仅提速）
4. **不删减用例**: 优化执行效率而非削减测试覆盖范围
5. **现有 2 个已知失败**: `test-r156-coverage-infra.js` 中 2 个断言失败属于独立问题，本次迭代不强制修复但需记录

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R135 (TestExecutionOpt) | 前置 | 提供了 `--test-concurrency=4` 基础和初始 smoke 概念 |
| R152 (TestExecutionOpt2) | 前置 | 提供了 Top-5 分析方法论，本次扩展到 Top-10 |
| R193/R196 (ModuleSplit) | 隐性 | 模块拆分可能导致测试文件新增/合并，影响性能基线 |
| Node.js v20+ | 运行时 | `--test-concurrency` 需要 Node.js v20+ 支持 |

---

## 6. 不在范围内

- 修复 `test-r156-coverage-infra.js` 的 2 个已知失败（独立迭代）
- 迁移到外部测试框架（Jest/Vitest/Mocha）
- 测试文件数量/行数瘦身（R115 已完成）
- 覆盖率收集优化（`test:coverage` 脚本单独处理）

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `--test-concurrency=8` 引入 flaky test | 测试稳定性下降 | 连续 3 次一致性校验 + 必要时降至 4 |
| 移除 sleep 后测试时序断言失效 | 用例功能退化 | 逐一审计，保留业务必需的时序等待 |
| smoke 子集选择不当遗漏关键路径 | CI 门禁失效 | smoke 覆盖矩阵需人工审核 |

---

## 8. 验证方法

1. **耗时基准**: `time node --test 'tests/*.js'` before/after 对比
2. **并行一致性**: 连续 3 次 `npm run test` 结果（pass/fail 数）完全一致
3. **smoke 性能**: `time npm run test:smoke` < 5s
4. **回归验证**: `npm run test:ci` pass 数 ≥ 6989，fail 数 = 0

---

*文档生成于 2026-05-20*  
*遵循飞轮迭代流程 (flywheel-iteration)*
