# REQUIREMENTS — R213: PerformanceRegressionCI

> 迭代: R55
> 日期: 2026-05-20
> 复杂度: Medium
> 阶段: Phase D — 基础设施强化
> 涉及文件: `.github/workflows/ci.yml`、`scripts/perf-benchmark.js`、`tests/test-perf-gate.js`、`docs/reports/perf-trend.md`
> 分支策略: CI 配置与脚本，不影响运行时代码

---

## 1. 用户故事

作为 PageWise 的维护者，我希望每次代码提交时 CI 自动检测性能退化和产物膨胀，确保新功能不会悄悄拖慢搜索、索引等核心操作，也不会让扩展包体积累到影响用户安装体验的程度。目前 CI 只有 lint + test + 粗粒度的包体积检查（10MB 门限，远超实际），没有任何性能基线守护，一旦某次迭代引入低效算法，可能直到用户投诉才被发现。

**现状痛点**：
- `ci.yml` 中 `package-check` 的门限为 10MB，远高于 Chrome Web Store 实际限制，形同虚设
- 项目已有 6 个性能相关测试文件（`test-bookmark-performance-benchmark.js`、`test-bookmark-performance.js`、`test-bookmark-performance-opt.js`、`test-knowledge-perf.js`、`test-performance-metrics.js`、`test-performance-profiler.js`），但从未在 CI 中作为门禁运行
- `test:smoke` 已定义为 npm script，覆盖 11 个核心模块，是天然的性能基线载体
- 缺少历史性能趋势追踪，无法观察长期退化曲线

---

## 2. 验收标准

### AC1: perf-gate CI Job
- `.github/workflows/ci.yml` 中新增 `perf-gate` job，依赖 `test` job（即 test 通过后才运行 perf-gate）
- perf-gate 执行 `npm run test:smoke` 并精确记录执行时间（毫秒级，使用 `Date.now()` 或 `process.hrtime`）
- 首次运行时自动建立基线（将执行时间写入 `docs/perf-baseline.json`，提交到仓库）
- 后续运行与基线对比：执行时间超过基线 **20%** 则 CI fail，并输出清晰的差异信息（如 `smoke: 4200ms (baseline 3400ms, +23.5%)`）
- perf-gate 同时运行 `scripts/perf-benchmark.js`（见 AC2），将核心操作基准结果输出为 JSON 并附在 CI 日志中

### AC2: perf-benchmark.js 核心操作基准脚本
- 新建 `scripts/perf-benchmark.js`，使用 Node.js `node:test` 运行，可独立执行（`node scripts/perf-benchmark.js`）
- 测量以下 4 个核心操作基准，结果输出为 JSON（stdout）：

| 基准操作 | 数据规模 | 性能门限 |
|----------|---------|---------|
| 书签索引（BookmarkIndexer.add 批量） | 1000 条书签 | < 50ms |
| 语义搜索（BookmarkSearch.search） | 1000 条索引后查询 | < 100ms |
| 图谱构建（BookmarkGraphEngine.buildGraph） | 500 节点 | < 200ms |
| 知识库查询（BookmarkIndexer.search） | 1000 条索引后全文查询 | < 50ms |

- 输出格式：`{ timestamp, results: [{ name, size, elapsedMs, passed, threshold }], allPassed: boolean }`
- 任意一项超门限则 `allPassed: false`，脚本以 exit code 1 退出
- 数据生成使用确定性伪随机（固定 seed），确保跨运行结果可比较（消除 I/O 波动后 ±5% 以内）

### AC3: 性能趋势报告
- 每次 CI 运行后自动生成/更新 `docs/reports/perf-trend.md`
- 报告内容包含：
  - 最近 20 次运行的基准数据表格（日期、commit SHA、各操作耗时、是否通过）
  - 与上次运行的变化百分比（↑/↓ 箭头标注）
  - 基线值和当前门限值
- 报告格式为 Markdown 表格，方便在 PR review 中直接查看
- CI 使用 `git diff` 检测 `docs/reports/perf-trend.md` 是否变化，变化则自动 commit 到当前分支（仅 master/main 推送时）

### AC4: Bundle Size 门禁
- 在现有 `package-check` job 中，将门限从 10MB 改为 **500KB**
- 检查方式：`npm run build` 生成产物后，检查 `.zip` 文件大小；若项目无 build 步骤，则检查核心源文件目录总大小（`background/`、`sidebar/`、`content/`、`lib/`、`icons/`、`_locales/`、`manifest.json`）
- 超过 500KB 则 CI fail，输出当前大小和门限值
- 当前实际约 300KB，留有 66% 余量

### AC5: 完整测试覆盖
- 新建 `tests/test-perf-gate.js`，使用 `node:test` + `node:assert/strict`
- 测试覆盖 ≥ 15 个用例，包括：
  - `perf-benchmark.js` 的 4 个核心基准每个至少 2 个测试（正常数据、边界数据）
  - 基线文件读写逻辑（文件不存在时创建基线、文件存在时读取基线、格式错误时降级）
  - 超基线 20% 判定逻辑（刚好 19% 通过、刚好 21% 失败、远超基线）
  - bundle size 计算逻辑（空目录、正常大小、超限大小）
  - trend 报告生成逻辑（空历史、正常历史、截断到 20 条）
- 所有测试不依赖真实 CI 环境，使用 mock 数据

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| CI 平台 | GitHub Actions，运行在 `ubuntu-latest`，Node.js 22 |
| 无外部依赖 | 不引入新的 npm 依赖；`perf-benchmark.js` 仅使用项目内 lib 模块 + Node.js 内置模块 |
| 基线文件 | `docs/perf-baseline.json`，格式 `{ createdAt, smokeTimeMs, benchmarks: [{name, thresholdMs, baselineMs}] }` |
| 趋势文件 | `docs/reports/perf-trend.md`，保留最近 20 条记录（FIFO），单文件 < 50KB |
| CI 执行时间预算 | perf-gate job 总耗时 < 60s（smoke ~5s + benchmark ~10s + 报告生成 ~5s + 安全余量） |
| 基线校准 | 首次建立基线时取连续 3 次运行的中位数，减少单次波动影响 |
| 不影响运行时 | 所有新增文件均为 CI/测试/脚本，不修改 `lib/`、`background/`、`sidebar/`、`content/` 中任何业务代码 |
| 复用现有基础设施 | 使用项目已有的 `test:smoke` npm script、已有的 `package-check` job 框架 |
| 确定性测试数据 | benchmark 使用固定 seed 生成测试书签，确保可重现性 |
| 并发安全 | CI 中 perf-gate 与 lint 并行，但依赖 test 完成后才开始；package-check 也依赖 [lint, test] |

---

## 4. 依赖关系

### 上游依赖（输入）

| 模块/资源 | 文件 | 状态 | 依赖方式 |
|-----------|------|------|----------|
| BookmarkIndexer | `lib/bookmark-indexer.js` | ✅ 已实现 | benchmark 调用 `add()` + `search()` 方法 |
| BookmarkGraphEngine | `lib/bookmark-graph.js` | ✅ 已实现 | benchmark 调用 `buildGraph()` 方法 |
| BookmarkSearch | `lib/bookmark-search.js` | ✅ 已实现 | benchmark 调用 `search()` 方法 |
| `test:smoke` npm script | `package.json` | ✅ 已实现 | perf-gate 直接执行 `npm run test:smoke` |
| `ci.yml` 工作流 | `.github/workflows/ci.yml` | ✅ 已实现 | 扩展现有 CI 配置，新增 perf-gate job |
| `package-check` job | `.github/workflows/ci.yml` | ✅ 已实现 | 修改现有门限值（10MB → 500KB） |
| `package.sh` | `scripts/package.sh` | ✅ 已实现 | 用于生成 .zip 产物（bundle size 检查依赖） |

### 下游消费者（输出）

| 资源 | 消费方式 |
|------|----------|
| `docs/perf-baseline.json` | CI 读取作为性能基线对比源；开发者可手动查看 |
| `docs/reports/perf-trend.md` | PR reviewer 在 GitHub 中查看性能趋势；维护者追踪长期退化 |
| CI perf-gate job | 阻断包含性能退化的 PR 合入 |
| CI package-check job | 阻断产物体积超标的 PR 合入 |

### 隐式依赖

| 依赖 | 说明 |
|------|------|
| Node.js 22 内置 `node:test` | benchmark 脚本使用 `describe/it` 运行，与项目测试风格一致 |
| GitHub Actions `actions/checkout` | perf-gate job 需要访问仓库历史（趋势报告） |
| CI 运行环境一致性 | GitHub Actions `ubuntu-latest` 环境的 CPU/内存需相对一致，否则基线可能需定期重新校准 |

### 并行/阻断关系

```
lint ─────┐
          ├──→ package-check ──→ (end)
test ─────┘        ↑
  │                │ 修改门限 10MB → 500KB
  ↓
perf-gate ──→ (end)
```

- `perf-gate` 依赖 `test` 完成（确保代码正确后再测性能）
- `package-check` 仍依赖 `[lint, test]`，同时修改其门限值
- `perf-gate` 与 `package-check` 可并行运行（互不依赖）

---

## 5. 非功能需求

| 项目 | 要求 |
|------|------|
| CI 增量耗时 | perf-gate job < 60s |
| benchmark 可重现性 | 同一代码在相同环境下连续运行 3 次，结果偏差 < 5% |
| 基线维护成本 | 基线自动初始化；如需手动重校准，运行 `node scripts/perf-benchmark.js --update-baseline` |
| 趋势报告体积 | 单文件 < 50KB，最多保留 20 条历史记录 |
| CI 日志可读性 | 失败时输出清晰的诊断信息（哪个操作超限、超了多少、基线值是多少） |
| 零运行时影响 | 所有新增代码均为 CI/测试/脚本目录，不增加扩展包体 |

---

## 6. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.github/workflows/ci.yml` | **修改** | 新增 `perf-gate` job；修改 `package-check` 门限为 500KB |
| `scripts/perf-benchmark.js` | **新建** | 核心操作基准测量脚本 |
| `docs/perf-baseline.json` | **新建** | 性能基线数据文件（CI 首次运行自动创建） |
| `docs/reports/perf-trend.md` | **新建** | 性能趋势报告（CI 每次运行自动更新） |
| `tests/test-perf-gate.js` | **新建** | perf-gate 相关单元测试（≥ 15 用例） |
| `docs/REQUIREMENTS-ITER55.md` | **新建** | 本需求文档 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-20 | R213 | 初始创建 — PerformanceRegressionCI 需求文档 |
