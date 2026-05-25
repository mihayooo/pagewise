# 需求文档 — R290: 测试失败批量修复 TestFailureBatchFixR290

> 作者: Plan Agent
> 日期: 2026-05-25
> 飞轮迭代: R10
> 复杂度: Medium

---

## 1. 用户故事

**作为** PageWise 项目的维护者，  
**我希望** 所有 13 个失败测试被逐一修复，断言与实际实现对齐，  
**以便** `npm run test:ci` 达到 7887+ pass / 0 fail 的绿灯状态，确保 R289 覆盖率冲刺建立在稳定的测试基础设施之上。

---

## 2. 问题分析 — 6 类失败根因

### 2.1 类别 A: test-ai-client.js 整文件崩溃（~6 个测试）

| 维度 | 说明 |
|------|------|
| **症状** | `failureType: testCodeFailure`，整文件无法执行 |
| **根因** | 测试文件使用 `require()` (CommonJS/Jest 风格) 与 `jest.mock()`，但 `lib/ai-client.js` 及其子模块使用 ESM `import/export` 语法。模块系统不匹配导致 import 链断裂 |
| **修复方向** | 将测试文件迁移为 ESM (`import`) + `node:test`/`node:assert` 风格；或保持 CJS 但改用 ESM 兼容的 mock 机制 |

### 2.2 类别 B: BookmarkVisualizer 5 个子测试全红

| 维度 | 说明 |
|------|------|
| **症状** | `initialize with empty nodes` / `add nodes and compute positions` / `create edges` / `zoom and pan` / `render without throwing` 全部断言失败 |
| **根因** | 测试断言的 API 签名与 `lib/bookmark-visualizer.js` 实际实现不一致：

- 测试期望 `visualizer.nodes`（数组）→ 实际为 `this._simNodes`（Map）
- 测试期望 `visualizer.edges` → 实际为 `this._edges`
- 测试期望 `visualizer.scale` / `visualizer.offset` → 实际为 `_scale` / `_offsetX` / `_offsetY`（私有字段）
- 测试调用 `addNode({id, x, y})` / `addEdge(id, id)` / `applyForces()` / `zoom(n)` / `pan(x,y)` — 这些公共方法不存在
- 测试调用 `render()` 无参 → 实际 `render(graphData)` 需要 `{nodes, edges}` 参数 |

| **修复方向** | 二选一：(A) 为 BookmarkVisualizer 新增公共 getter/方法，适配测试期望的 API；(B) 重写测试，使用实际 API（`render(graphData)`、`_simNodes` 等） |

### 2.3 类别 C: c8rc.json 配置断言失败（~2 个测试）

| 维度 | 说明 |
|------|------|
| **涉及文件** | `test-coverage-infra.js` + `test-r156-coverage-infra.js` |
| **症状** | 断言 `.c8rc.json tmpDir` 应为 `'coverage/tmp'`，实际值为 `'/tmp/c8_r289'` |
| **根因** | R289 覆盖率冲刺中 `.c8rc.json` 的 `tmpDir` 被修改为 `/tmp/c8_r289`（外部临时目录），但对应的基础设施测试仍断言旧值 `coverage/tmp` |
| **修复方向** | 更新断言为实际值 `'/tmp/c8_r289'`；或同时更新 `.c8rc.json` 恢复为 `coverage/tmp` 并确保覆盖率命令正常工作 |

### 2.4 类别 D: Preflight 清理机制验证（~1 个测试）

| 维度 | 说明 |
|------|------|
| **涉及文件** | `test-r156-coverage-infra.js` |
| **症状** | 测试断言 preflight 脚本执行 `rm -rf coverage/tmp`，但实际清理目标已变 |
| **根因** | `.c8rc.json` 的 `tmpDir` 从 `coverage/tmp` 改为 `/tmp/c8_r289` 后，preflight 清理脚本和测试断言未同步更新 |
| **修复方向** | 同步更新 preflight 脚本和测试，使清理逻辑指向当前 `.c8rc.json` 中的实际 `tmpDir` 值 |

### 2.5 类别 E: SkillCommunityHub fetchFromGitHub（~1 个测试）

| 维度 | 说明 |
|------|------|
| **涉及文件** | `test-skill-store-community.js` |
| **症状** | `SKILL.md must contain YAML frontmatter delimited by ---` |
| **根因** | Mock 的 SKILL.md 内容为 `# Skill\n---\ntitle: TestSkill\n---`（标题在前，缺少文件开头的 `---`），但 `skill-validator.js:39` 的 `parseSkillManifest()` 要求内容以 `^---` 开头。正则 `/^---\r?\n([\s\S]*?)\r?\n---/` 无法匹配 |
| **修复方向** | 修正 mock SKILL.md 内容为正确的 YAML frontmatter 格式：`---\ntitle: TestSkill\nversion: 1.0.0\ncategory: general\n---\n# Skill Content` |

### 2.6 类别 F: 语义搜索性能 1000 条 <100ms 超时（~1 个测试）

| 维度 | 说明 |
|------|------|
| **涉及文件** | `test-bookmark-indexer.js` |
| **症状** | 1000 条书签搜索响应 <100ms 断言偶尔失败 |
| **根因** | CI 环境 CPU 抖动导致纯计算密集型操作偶尔超过 100ms 阈值 |
| **修复方向** | 将阈值放宽至 `<200ms`，或使用多次测量取中位数的方式断言 |

---

## 3. 验收标准

| # | 验收标准 | 判定方式 |
|---|---------|---------|
| AC1 | `npm run test:ci` 输出 **0 fail**（允许 pass 数量因重写略有变化，目标 ≥7887） | `npm run test:ci` 2>&1 最后一行显示 0 fail |
| AC2 | 6 个失败测试文件全部修复，断言与实际实现对齐 | 每个文件单独 `node --test tests/test-<name>.js` 全绿 |
| AC3 | 类别 F 性能测试阈值调整为合理值（≤200ms 或条件跳过），避免 CI 抖动导致 flaky | 连续 3 次 `npm run test:ci` 均 0 fail |
| AC4 | `.c8rc.json` 配置与基础设施测试断言一致 | `test-coverage-infra.js` + `test-r156-coverage-infra.js` 全绿 |
| AC5 | 不引入新的 lint error/warning | `npm run lint` 0 errors 0 warnings |

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **模块系统** | 所有 lib 模块均为 ESM（`import/export`），测试文件应使用 ESM + `node:test`/`node:assert`（新测试）或兼容的 CJS mock 方式 |
| **测试框架** | 新测试优先使用 `node:test` + `node:assert/strict`；保留现有 Jest 风格测试但确保能正常执行 |
| **Chrome API mock** | BookmarkVisualizer 测试的 Canvas mock 需覆盖 `getContext('2d')`、`addEventListener`、`width`/`height` 等 |
| **不修改 lib 源码（原则）** | 优先修复测试断言使其匹配实际 lib API；仅当 lib API 明显设计缺陷时才修改 lib |
| **覆盖率门禁** | `.c8rc.json` 的 `tmpDir` 路径选择需确保 `c8` 正常生成覆盖率数据 |
| **向后兼容** | 不改变已有公共 API 签名（BookmarkVisualizer 的 `render(graphData)` 签名不变） |

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R289 (CoverageBreak32) | 前置 | `.c8rc.json` 在 R289 中被修改，导致类别 C/D 失败 |
| R285 (TestInfraFix) | 前置 | 测试基础设施修复后的遗留问题 |
| R275 (BookmarkAccessibility) | 无直接依赖 | BookmarkVisualizer 是更早的 R46 产物 |
| R279 (ReleaseV340) | 阻塞方 | v3.4.0 发布需要 0 fail 测试 |
| R290 输出 | 被依赖 | Phase AO 后续迭代的测试基础 |

---

## 6. 修复优先级排序

| 优先级 | 类别 | 测试数 | 影响范围 | 原因 |
|--------|------|--------|---------|------|
| **P0** | A (ai-client) | ~6 | AI 核心模块 | 整文件崩溃，丧失全部 AI Client 测试覆盖 |
| **P0** | B (visualizer) | 5 | 书签图谱可视化 | 核心功能的可视化测试完全失效 |
| **P1** | C (c8rc 配置) | 2 | 覆盖率基础设施 | 影响覆盖率门禁验证 |
| **P1** | D (preflight) | 1 | 构建流程 | preflight 自检失效 |
| **P2** | E (skill validator) | 1 | 社区技能功能 | 新功能测试，影响面较小 |
| **P2** | F (性能超时) | 1 | 索引性能 | flaky 测试，不影响功能正确性 |

---

## 7. 风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| test-ai-client.js CJS→ESM 迁移涉及大量 mock 改写 | 中 | 工作量大 | 可先最小化迁移，保留核心断言逻辑 |
| BookmarkVisualizer 测试重写需要深入理解力导向图 API | 中 | 可能遗漏边界 case | 参照 `lib/bookmark-visualizer.js` 完整 API 文档 |
| `.c8rc.json tmpDir` 恢复 `coverage/tmp` 可能导致覆盖率采集异常 | 低 | 覆盖率数据丢失 | 修改后立即运行 `npm run test:coverage` 验证 |
| 性能阈值放宽后掩盖真正的性能劣化 | 低 | 性能退化未被发现 | 在测试报告中记录基线值，定期回归 |

---

## 8. 不包含

- 不包含新增测试用例（本轮仅修复现有失败）
- 不包含覆盖率提升（R289 职责）
- 不包含 lib 层功能变更
- 不包含 CI/CD 配置变更

---

## 附录: 受影响文件清单

| 文件 | 类别 | 失败测试数 |
|------|------|-----------|
| `tests/test-ai-client.js` | A | ~6 |
| `tests/test-bookmark-visualizer.js` | B | 5 |
| `tests/test-coverage-infra.js` | C | 1 |
| `tests/test-r156-coverage-infra.js` | C + D | 2 |
| `tests/test-skill-store-community.js` | E | 1 |
| `tests/test-bookmark-indexer.js` | F | 1 |
| **合计** | | **~16 (含冗余)** |
