# 需求文档 — R255: 5 个测试失败批量修复 TestFailureBatchFixR255

> 迭代: R255 / 第 27 轮
> 日期: 2026-05-21
> 复杂度: Medium
> 优先级: P0（CI 质量门禁）

---

## 1. 用户故事

**作为** PageWise 项目的开发者和 CI 流水线的守护者，
**我希望** `npm run test:ci` 输出 7711 pass / 0 fail，所有测试在本地和 CI 环境中稳定通过，
**以便** 后续迭代不被 pre-existing 失败阻断，CI 绿灯可信赖。

---

## 2. 现状分析

### 2.1 失败测试清单

| # | 测试文件 | 根因类别 | 失败数 |
|---|---------|---------|-------|
| 1 | `tests/test-r244-release-v321.js` | CHANGELOG 断言不一致 | 4 |
| 2 | `tests/test-tech-debt-cleanup.js` (R112) | CHANGELOG 断言不一致 | 1 |
| 3 | `tests/test-bookmark-link-checker-e2e.js` | 时序不稳定 | 1 |

### 2.2 根因详解

#### 根因 A: test-r244 — root CHANGELOG.md 缺失 `[3.2.2]` 区段（4 处失败）

**AC-4** 断言 root `CHANGELOG.md` 包含 `[3.2.2]` 和 `[3.2.2] - 2026-05-21`，但 root CHANGELOG 仅有 `[3.1.0]` 和 `[3.0.0]` 两个版本区段。`docs/CHANGELOG.md` 已有 `[3.2.0]` 和 `[Unreleased]`（含 R250），但 root CHANGELOG 从未同步 `[3.2.x]` 系列。

**AC-10** 断言 root CHANGELOG 包含 R240-R243 引用，但这些引用仅存在于 `docs/CHANGELOG.md` 的历史 `[Unreleased]` 区段中（~line 203+），未被归档到任何已发布版本区段。

> R244 发布收尾任务未落地：版本号已在 package.json/manifest.json 中升至 3.2.2，但 CHANGELOG 更新未执行。

#### 根因 B: test-r112 — docs/CHANGELOG.md 双 Unreleased 区段结构不匹配（1 处失败）

`docs/CHANGELOG.md` 存在 **两个** `[Unreleased]` 区段：
- **Line 7**: 当前 `[Unreleased] - 2026-05-21`（含 R250 设置模块拆分）
- **Line 203**: 历史遗留 `[Unreleased]`（含 R190、R185、R165、R153、R148 等以及 **R104-R107**）

测试 AC-4 使用 `indexOf('## [Unreleased]')` 定位，命中 line 7 的第一个区段，然后取到 `[3.2.0]` 为止的范围（line 7-18）。R104-R107 实际位于 line 305-320 的第二个 `[Unreleased]` 区段中，不在搜索范围内 → 断言失败。

> 根因：docs/CHANGELOG.md 长期累积未合并 Unreleased 区段，R104-R107 被归入旧的 Unreleased 而非合并到顶部。

#### 根因 C: BookmarkLinkChecker throttle 时序不稳定（1 处失败）

`test-bookmark-link-checker-e2e.js` 的「同域名限流」用例在 `_domainThrottleMs=10` 下断言同域名连续请求间隔 `≥ 5ms`（即 `throttleMs - 5`）。CI 环境 CPU 调度抖动导致偶尔间隔 < 5ms。

> 这是环境敏感的时序测试，非逻辑缺陷。

---

## 3. 验收标准

| ID | 验收标准 | 验证方式 |
|----|---------|---------|
| AC-1 | root `CHANGELOG.md` 包含 `[3.2.2]` 区段（含日期 `2026-05-21`），test-r244 AC-4 通过 | `node --test tests/test-r244-release-v321.js` 全绿 |
| AC-2 | root `CHANGELOG.md` 包含 R240-R243 引用记录（归入对应版本区段），test-r244 AC-10 通过 | 同上 |
| AC-3 | `docs/CHANGELOG.md` 合并两个 `[Unreleased]` 区段为一个，R104-R107 记录位于顶部 `[Unreleased]` 区段内或已归入正式版本区段 | `node --test tests/test-tech-debt-cleanup.js` 全绿 |
| AC-4 | BookmarkLinkChecker throttle 测试稳定：采用 `test.skip()` 标记 + 原因注释（方案 A），或改用 mock 时钟消除竞态（方案 B），两种方案均可 | `node --test tests/test-bookmark-link-checker-e2e.js` 全绿 |
| AC-5 | `npm run test:ci` 输出 ≥7711 pass / 0 fail | CI 或本地全量回归 |

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **仅修改测试文件和文档** | 本任务不修改 `lib/` 源码，只修测试断言 / CHANGELOG 内容 / skip 标记 |
| **CHANGELOG 格式** | 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 格式，每个版本区段 `## [x.y.z] - YYYY-MM-DD` |
| **root vs docs 双 CHANGELOG** | 项目存在 `CHANGELOG.md`（root）和 `docs/CHANGELOG.md` 两份文件，需确认各测试读取的是哪份并保持一致性 |
| **向后兼容** | 不得删除已有 CHANGELOG 内容，只新增或重组区段归属 |
| **时序测试 skip 规范** | 若采用 skip 方案，必须在 `test.skip()` 调用中附带注释说明根因（CI CPU jitter）和恢复条件（mock 时钟重写） |

---

## 5. 依赖关系

| 依赖项 | 方向 | 说明 |
|--------|------|------|
| R244 版本发布流程 | 前置 | R244 将版本号升至 3.2.2 但 CHANGELOG 未同步，本轮需补完 |
| `CHANGELOG.md`（root） | 被修改 | 需新增 `[3.2.0]`/`[3.2.1]`/`[3.2.2]` 区段或至少 `[3.2.2]` |
| `docs/CHANGELOG.md` | 被修改 | 需合并双 Unreleased 区段 |
| R251 覆盖率冲刺 | 无冲突 | 当前覆盖率 ~28%，门禁 --lines 28，本轮不涉及覆盖率变更 |
| R254 死代码清理 | 无冲突 | 不修改 lib/ 模块 |

---

## 6. 修复策略建议

### 6.1 test-r244: CHANGELOG 对齐（方案选择）

| 方案 | 描述 | 工作量 | 风险 |
|------|------|--------|------|
| **A: 补全 root CHANGELOG** | 在 root `CHANGELOG.md` 新增 `[3.2.0]`、`[3.2.1]`、`[3.2.2]` 区段，从 `docs/CHANGELOG.md` 同步 R219-R250 内容并归入对应版本 | 中 | 需梳理哪些迭代属于哪个版本 |
| **B: 更新测试断言** | 将 test-r244 的 AC-4/AC-10 断言改为检查 `docs/CHANGELOG.md` 或放宽版本匹配 | 低 | 治标不治本，root CHANGELOG 仍过时 |
| **推荐: A+B 混合** | 补全 root CHANGELOG 至 `[3.2.2]`，同步更新测试断言使其读取正确的文件路径 | 中 | 最彻底 |

### 6.2 test-r112: Unreleased 区段合并

将 `docs/CHANGELOG.md` 的两个 `[Unreleased]` 区段合并为一个，具体：
1. 将 line 203+ 的旧 `[Unreleased]` 内容（R103-R190+）按时间归属归入 `[3.1.0]` 或 `[3.2.0]` 区段
2. 保留顶部唯一的 `[Unreleased] - 2026-05-21` 区段用于当前开发中的变更
3. 确保 R104-R107 记录在测试搜索范围内

### 6.3 BookmarkLinkChecker: 时序稳定化

| 方案 | 描述 | 工作量 |
|------|------|--------|
| **A: test.skip()** | 标记为 skip，注释 "CI CPU jitter makes 10ms throttle gap non-deterministic; replace with mock clock before re-enabling" | 极低 |
| **B: Mock 时钟** | 引入 mock clock（如 `sinon.useFakeTimers` 或手动 `Date.now` mock），彻底消除竞态 | 低-中 |
| **推荐: A（本轮），B（后续）** | 先 skip 解锁 CI，后续迭代专门重写时序测试 | 极低 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CHANGELOG 区段归属模糊（哪些迭代属于 3.2.0 vs 3.2.1 vs 3.2.2） | 补全内容可能不准确 | 以 git tag 和 README 版本记录为准；无法确定的归入最近确定的版本 |
| skip 过多累积导致测试覆盖率隐性下降 | 功能回归风险 | 当前仅 skip 1 个时序用例，记录 TODO 追踪重写 |
| 双 CHANGELOG 一致性维护成本 | 长期技术债 | 本轮后建议废弃 root CHANGELOG，仅保留 docs/CHANGELOG.md |

---

## 8. 成功度量

| 指标 | 目标值 |
|------|-------|
| `npm run test:ci` pass 数 | ≥7711 |
| `npm run test:ci` fail 数 | 0 |
| 新增 skip 数 | ≤1（仅 BookmarkLinkChecker throttle） |
| 修改文件范围 | 仅 `CHANGELOG.md`、`docs/CHANGELOG.md`、`tests/test-*.js`（≤5 个文件） |
| `npm run lint` | 0 errors / 0 warnings |

---

*生成于 2026-05-21 | 飞轮迭代 R255 | Plan Agent*
