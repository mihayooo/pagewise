# 需求文档 — 迭代四: R232 测试执行效率终极优化

> 文档编号: REQUIREMENTS-ITER4
> 日期: 2026-05-21
> 作者: Plan Agent
> 关联迭代: Phase AF (R230-R234)
> 前置依赖: R231 (CHANGELOG 补全与 v3.2.0 版本发布) ✅

---

## 1. 用户故事

**作为** PageWise 的开发者和 CI 运维者，  
**我希望** 全量 7484 个测试用例在 30 秒内执行完毕，并且拥有一套 ≤3 秒的 smoke 测试作为日常开发的快速反馈门禁，  
**以便** 缩短开发-验证循环、降低 CI 资源消耗、提高飞轮迭代吞吐率。

---

## 2. 背景与现状

### 2.1 历史五次优化均未达标

| 迭代 | 目标 | 声称结果 | 实测结果 | 失败原因 |
|------|------|---------|---------|---------|
| R135 | ≤20s | ✅ | ~29.5s | 仅提升 concurrency，未排查慢文件 |
| R152 | ≤25s | ✅ | ~36s | 粒度过粗，未深入用例级别 |
| R198 | ≤30s | ✅ | 42.9s | 声称达标但实测未落地 |
| R202 | ≤30s | ✅ | 45.4s | 声称 ≤25s 但实测持续恶化 |
| R227 | ≤30s | ✅ | 44.5s | 第五次声称但未改变实测基线 |

**核心问题**: 历史优化仅停留在"声称达标"层面，缺乏**可量化的实测验证**，且从未用 `--test-reporter=json` 获取精确的 per-file duration 数据来指导优化。

### 2.2 当前测试基础设施

| 指标 | 值 |
|------|-----|
| 测试用例数 | 7,484 |
| 测试文件数 | 195+ (非 E2E) |
| 测试通过率 | 100% (7484/7484) |
| 执行时间 | ~44.5s (`npm run test:ci`) |
| 并行度 | `--test-concurrency=8` |
| Smoke 测试 | 已存在 (`npm run test:smoke`，~11 文件) |
| 测试框架 | Node.js 内置 `node --test` |
| 覆盖率工具 | c8 (V8 native) |

---

## 3. 验收标准

### AC-1: 全量测试执行时间 ≤30 秒

- **度量方式**: `time npm run test:ci` 在 CI 环境（2 vCPU / 4GB RAM）和本地环境下均 ≤30s
- **回退保护**: 新增 CI 门禁脚本 `scripts/perf-gate-test.sh`，测试执行 >32s 则 CI fail
- **不允许**: 通过减少用例数或跳过来达成时间目标（零用例删减）

### AC-2: Top-20 慢速文件分析报告可追溯

- 生成 `docs/reports/test-perf-analysis.md`，列出按 `duration_ms` 降序排列的 Top-20 文件
- 每个 >2s 的文件需标注根因（`setTimeout`、`await sleep`、同步循环构造、大数据规模、大量 import 链等）
- 报告包含优化前后的 duration 对比

### AC-3: 所有 >500ms 用例完成改造

- 排查所有 >500ms 的单个测试用例（可通过 `--test-reporter=json` 逐用例粒度获取）
- 对识别出的慢用例采取以下改造策略之一：
  - 降低测试数据规模（如 1000 书签 → 200 书签，保留核心逻辑覆盖）
  - 移除 `setTimeout` / `await sleep` / `await new Promise(r => setTimeout(r, ...))` 阻塞
  - 将同步大数据构造改为惰性构造或共享 fixture
  - 简化不必要的 import 链（减少模块加载开销）

### AC-4: `--test-concurrency=16` 并行度验证通过

- 将 `--test-concurrency` 从 8 提升至 16
- 验证在并发 16 下无竞态失败（全量测试通过率仍 100%）
- 若并发 16 导致内存问题或 flaky test，则回退至最高稳定并发数并记录

### AC-5: Smoke 测试子集 ≤3 秒且纳入 CI 快速门禁

- `npm run test:smoke` 执行时间 ≤3s（含模块加载开销）
- Smoke 测试覆盖核心流程（书签索引、图谱引擎、搜索、聚类、推荐、AI 客户端、存储适配器、安全净化），用例数 60-80
- 在 CI workflow 中 smoke 作为独立 job，失败则阻断后续步骤（硬性门禁）
- Smoke 测试用例清单在 `docs/REQUIREMENTS-ITER4.md` 附录中记录

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **零用例删减** | 7484 个用例全部保留，不允许通过删除用例来降低执行时间 |
| **零断言弱化** | 不允许移除或放宽任何现有断言 |
| **框架限制** | 使用 Node.js 内置 `node --test`，不允许迁移至 Jest/Vitest/Mocha 等第三方框架 |
| **并发安全** | 所有测试必须无共享可变状态，高并发下不出现 flaky |
| **CI 环境限制** | GitHub Actions ubuntu-latest (2 vCPU / 4GB RAM)，并发 16 需验证不超过内存限制 |
| **向后兼容** | `npm run test` / `npm run test:ci` / `npm run test:smoke` 脚本签名不变 |
| **覆盖率不退化** | 优化后行覆盖率 ≥23.68%（R230 基线），函数覆盖率 ≥48.85% |
| **Lint 保持** | `npm run lint` 0 errors / 0 warnings |

---

## 5. 技术方案概要

> 以下为建议方向，非强制实现细节。

### 5.1 慢文件精确定位

```bash
# 生成 JSON 报告
node --test --test-reporter=json --test-concurrency=8 'tests/*.js' > /tmp/test-report.json 2>/dev/null

# 解析 Top-20 最慢文件
node -e "
const r = JSON.parse(require('fs').readFileSync('/tmp/test-report.json','utf8'));
const files = {};
// 遍历 suite/test 树，按文件聚合 duration_ms
// 输出 Top-20
"
```

### 5.2 常见慢模式与改造策略

| 模式 | 检测方式 | 改造策略 |
|------|---------|---------|
| `setTimeout(fn, 1000)` | grep `setTimeout` | 改为 `setImmediate` / `process.nextTick` 或直接移除 |
| `await sleep(N)` | grep `sleep` | 移除 sleep，改用事件驱动或直接断言 |
| 大对象循环构造 | 单用例 >500ms 且含 `for` + `new` | 降低 N（1000→100），或构造一次复用 |
| 深层 import 链 | 文件首个用例慢、后续快 | 预加载 `--import` 或合并 import |
| 同步文件 I/O | `readFileSync` / `writeFileSync` | 改用 `fs/promises` 异步 |

### 5.3 Smoke 测试策略

- 复用已有 `tests/test-smoke.js`（R121 创建），扩充至 60-80 用例
- 覆盖模块: bookmark-indexer, bookmark-graph, bookmark-search, bookmark-clusterer, bookmark-recommender, ai-client, storage-adapter, sanitize, cost-estimator, bookmark-core, bookmark-collector, page-sense, skill-engine, conversation-store
- 禁用 coverage（`c8` 插桩有 ~30% 开销）

---

## 6. 依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R231 | **前置** | CHANGELOG 补全与 v3.2.0 版本发布已完成，为本迭代提供稳定基线 |
| R230 | **前置** | 行覆盖率真实突破 50%，确保覆盖率基线数据可信 |
| R226 | **间接** | CI 门禁脚本 `scripts/architecture-guard.sh`，可复用其框架添加测试性能门禁 |
| R233 | **后续** | 覆盖率 CI 门禁硬化，本迭代确保覆盖率不退化后 R233 可放心收紧门禁 |
| R234 | **后续** | 全量回归与发布收尾，依赖本迭代的 ≤30s 性能基线 |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 并发 16 导致内存 OOM (CI 2vCPU/4GB) | 中 | 高 | 逐步提升 (8→12→16)，CI 环境实测验证；OOM 则回退至最高稳定值 |
| 慢用例改造引入测试逻辑变更 | 中 | 中 | 每个改造保留等价性注释，改造前后 `npm run test:ci` 0 fail 对比 |
| `node --test` 的 JSON reporter 不支持逐用例粒度 | 低 | 中 | 降级使用文件粒度聚合 + 手动 `console.time` 定位慢用例 |
| 历史声称达标但实测未落地的"通病" | 高 | 高 | 本迭代强制要求: 每个步骤的**最后一环**必须是 `time npm run test:ci` 实测验证 |

---

## 8. 验收检查清单

- [ ] `time npm run test:ci` ≤30s（CI 环境实测）
- [ ] `npm run test:ci` 7484/7484 pass / 0 fail
- [ ] `npm run lint` 0 errors / 0 warnings
- [ ] `npm run test:smoke` ≤3s
- [ ] `docs/reports/test-perf-analysis.md` Top-20 慢文件报告已生成
- [ ] 所有 >500ms 用例已完成改造（报告中列出）
- [ ] `--test-concurrency=16` 全量通过（或记录最高稳定并发数）
- [ ] `scripts/perf-gate-test.sh` CI 门禁脚本已创建
- [ ] 覆盖率未退化: 行覆盖率 ≥23.68%, 函数覆盖率 ≥48.85%
- [ ] CHANGELOG.md 已更新 R232 条目

---

## 9. 变更记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-05-21 | 初始版本 | Plan Agent |
