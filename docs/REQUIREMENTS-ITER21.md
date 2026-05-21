# 需求文档 — 飞轮迭代 R21（更新）

> 日期: 2026-05-21
> 迭代: R249
> 作者: Plan Agent
> 任务: **R249: 全量回归与 v3.2.2 发布收尾 ReleaseV322**

---

## R249: 全量回归与 v3.2.2 发布收尾 ReleaseV322

### 1. 用户故事

作为 **PageWise 扩展的维护者**，我希望在 R245-R248 四轮飞轮迭代（覆盖率门禁达标、测试效率优化、知识库智能检索、统一设置面板）全部合入后，执行一次完整的质量门禁回归测试，并将版本号 bump 至 3.2.2 发布，确保所有质量指标达标、版本元数据一致、变更记录完整，为 Chrome Web Store 提交做好准备。

---

### 2. 验收标准

| # | 验收条件 | 验证方式 | 当前状态 |
|---|---------|---------|---------|
| AC-1 | `npm run test:ci` 输出 **0 fail**，且 pass 数量 **≥ 7600** | 命令行运行，exit code 0；grep `# pass` ≥ 7600 | ⚠️ 当前 7468 pass / 16 fail |
| AC-2 | `npm run lint` 输出 **0 errors, 0 warnings** | 命令行运行，exit code 0 | ✅ 已达标 |
| AC-3 | 覆盖率门禁三项全部通过：`npm run coverage:gate` exit code 0（lines ≥28%、functions ≥50%、branches ≥75%） | c8 check-coverage 输出无 FAIL | ⚠️ 当前 lines 24.89% / functions 49.79% / branches 75.83% |
| AC-4 | `npm run test:ci` 执行时间 **≤ 35 秒** | time 命令或测试输出 `# duration_ms` | ⚠️ 当前 ~42.6s |
| AC-5 | 版本号统一为 **3.2.2**：`package.json` `"version"` 和 `manifest.json` `"version"` 同步一致 | grep 验证两个文件 | ⚠️ 当前均为 3.2.1 |
| AC-6 | `CHANGELOG.md` 头部包含 `[3.2.2] - 2026-05-21` 区段，涵盖 R245-R248 四项变更摘要 | 人工审查 changelog 内容 | ❌ 待创建 |
| AC-7 | `docs/reports/coverage-baseline.md` 更新为 R249 实测数据（覆盖数值、门禁阈值、测试用例数） | 文件内容与 `npm run test:coverage` 输出一致 | ⚠️ 当前记录 R243 基线 |
| AC-8 | `bash scripts/publish-check.sh` 全部检查通过（exit code 0，0 FAIL） | 命令行运行 | ⚠️ 待运行（版本号需先 bump） |

---

### 3. 现状分析

#### 3.1 当前质量快照（2026-05-21）

| 指标 | 当前值 | 目标值 | 差距 | 状态 |
|------|--------|--------|------|------|
| 测试通过数 | 7,468 | ≥ 7,600 | +132 | ❌ 需修复 16 fail + R248 新增用例填补 |
| 测试失败数 | 16 | 0 | -16 | ❌ 需排查修复 |
| Lint 结果 | 0 errors / 0 warnings | 0 errors / 0 warnings | — | ✅ 已达标 |
| 行覆盖率 | 24.89% | ≥ 28% | +3.11pp | ❌ R245 目标解决 |
| 函数覆盖率 | 49.79% | ≥ 50% | +0.21pp | ❌ R245 目标解决 |
| 分支覆盖率 | 75.83% | ≥ 75% | — | ✅ 已达标 |
| 测试执行时间 | ~42.6s | ≤ 35s | -7.6s | ❌ 需优化 |
| 版本号 | 3.2.1 | 3.2.2 | bump | ❌ 待执行 |
| publish-check.sh | 未运行 | 0 FAIL | — | ❌ 版本 bump 后执行 |

#### 3.2 前序迭代产出（R245-R248）

| 迭代 | 任务 | 核心产出 | 对本任务的影响 |
|------|------|---------|---------------|
| **R245** CoverageGatePass | 覆盖率门禁三项达标冲刺 | Top-10 零覆盖模块补充测试；函数覆盖率缺口补测 | 预期将行覆盖率推至 ≥28%、函数 ≥50%，直接解决 AC-3 |
| **R246** | 测试效率优化 | 执行时间优化（35s 目标） | 预期解决 AC-4 的时间约束 |
| **R247** KnowledgeBaseSmartSearch | 知识库智能检索升级 | 模糊搜索/拼音搜索/搜索联想/TF-IDF 排序/过滤器 | 新增 ≥30 测试用例，贡献 AC-1 的 pass 数量 |
| **R248** UnifiedSettingsPanel | 用户设置统一面板 | SettingsRegistry/设置分组/导入导出/变更事件/校验/重置 | 新增 ≥25 测试用例，贡献 AC-1 的 pass 数量 |

---

### 4. 技术约束

| 约束 | 说明 |
|------|------|
| **无新功能代码** | 本轮为纯发布收尾，不新增 lib/ 业务代码。仅修复失败测试 + 版本元数据更新 + 文档更新 |
| **版本号双文件同步** | `package.json` 和 `manifest.json` 的 `version` 字段必须同时更新为 `3.2.2`，不得遗漏任一 |
| **CHANGELOG 格式** | 遵循 [Keep a Changelog](https://keepachangelog.com) 格式；`[3.2.2] - 2026-05-21` 区段置于现有 `[3.1.0]` 之前 |
| **覆盖率基线文档** | `docs/reports/coverage-baseline.md` 必须更新为 R249 实测值，包括分子/分母/覆盖率百分比，与 `coverage/coverage-summary.json` 一致 |
| **CI 全绿** | 所有检查项（test + lint + coverage gate + publish check）必须在同一提交中全部通过 |
| **测试执行 ≤35s** | 若 R246 的优化未达预期，本任务需补充优化措施（减少 setTimeout / 合并慢测试 / 调整并行度） |

---

### 5. 实施策略

| 步骤 | 操作 | 依赖 | 预期结果 |
|------|------|------|---------|
| **Step 1** | 确认 R245-R248 已全部合入 master | R245-R248 完成 | master 包含所有四轮迭代代码 |
| **Step 2** | 运行 `npm run test:ci`，排查 16 个 fail 用例 | Step 1 | 定位失败原因（代码回归 / 测试过时 / 环境问题） |
| **Step 3** | 修复失败用例，确认 0 fail | Step 2 | `# pass ≥ 7600`, `# fail = 0` |
| **Step 4** | 运行 `npm run lint` 确认 0 errors / 0 warnings | Step 1 | 已达标，无需额外操作 |
| **Step 5** | 运行 `npm run test:coverage` + `npm run coverage:gate` | Step 3 | 三项门禁全部通过 |
| **Step 6** | 若执行时间 > 35s，优化测试执行效率 | Step 3 | `# duration_ms ≤ 35000` |
| **Step 7** | Bump 版本号至 3.2.2（package.json + manifest.json） | Step 3-6 全部通过 | 两个文件 version 均为 `"3.2.2"` |
| **Step 8** | 更新 `CHANGELOG.md`，添加 `[3.2.2] - 2026-05-21` 区段 | Step 7 | changelog 包含 R245-R248 摘要 |
| **Step 9** | 更新 `docs/reports/coverage-baseline.md` | Step 5 | 基线数据与 R249 实测一致 |
| **Step 10** | 运行 `bash scripts/publish-check.sh` 验证 | Step 7 | 全部 PASS，exit code 0 |
| **Step 11** | 提交所有变更 | Step 7-10 | git commit 包含版本 bump + changelog + baseline + fixes |

---

### 6. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| **R245** CoverageGatePass | **前置（必须已完成）** | 提供覆盖率三项达标的基础；若未完成则 AC-3 无法通过 |
| **R246** 测试效率优化 | **前置（必须已完成）** | 提供 ≤35s 执行时间基础；若未完成则 AC-4 无法通过 |
| **R247** KnowledgeBaseSmartSearch | **前置（必须已完成）** | 提供 ≥30 新测试用例，贡献 AC-1 的 pass 数量 |
| **R248** UnifiedSettingsPanel | **前置（必须已完成）** | 提供 ≥25 新测试用例，贡献 AC-1 的 pass 数量 |
| **scripts/publish-check.sh** (R208) | 已存在 | 发布前自检脚本，本任务直接调用 |
| **scripts/bump-version.sh** (R214) | 已存在 | 版本号自动化脚本，可选择性使用；也可手动编辑两个文件 |
| **coverage-baseline.md** (R243) | 已存在 | 覆盖率基线文档，本任务需更新 |
| **CI 流水线** (ci.yml) | 已存在 | 最终通过 CI 验证所有门禁 |

---

### 7. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| R245 覆盖率提升未达 28% 门禁 | 中 | AC-3 不通过 | Step 5 后若未达标，为 R245 补充零覆盖模块测试用例 |
| 16 个 fail 属于 R247/R248 新增代码回归 | 中 | AC-1 不通过 | 定位具体失败用例，与对应迭代负责代码对照修复 |
| 测试执行时间 > 35s 优化空间不足 | 低 | AC-4 不通过 | 检查是否有残留 `setTimeout`/`await sleep`；考虑提升 `--test-concurrency` |
| bump-version.sh 脚本逻辑过时 | 低 | 版本不一致 | 手动编辑 package.json + manifest.json 双保险 |
| CHANGELOG 遗漏某轮迭代 | 低 | 文档不完整 | 按 R245→R248 逐条核对 git log |

---

### 8. 成功指标

| 指标 | 目标值 | 验证命令 |
|------|--------|---------|
| 测试通过数 | **≥ 7,600** | `npm run test:ci 2>&1 \| grep "# pass"` |
| 测试失败数 | **0** | `npm run test:ci 2>&1 \| grep "# fail"` |
| Lint 结果 | **0 errors / 0 warnings** | `npm run lint` |
| 行覆盖率 | **≥ 28%** | `npm run coverage:gate` |
| 函数覆盖率 | **≥ 50%** | `npm run coverage:gate` |
| 分支覆盖率 | **≥ 75%** | `npm run coverage:gate` |
| 测试执行时间 | **≤ 35s** | `npm run test:ci` 输出 `# duration_ms` |
| 版本号一致性 | **3.2.2** | `grep '"version"' package.json manifest.json` |
| 发布自检 | **0 FAIL** | `bash scripts/publish-check.sh` |

---

### 9. CHANGELOG 预填内容

```markdown
## [3.2.2] - 2026-05-21

质量收尾版本 — R245-R248 飞轮迭代全量回归验证与发布。

### 新增

#### 知识库智能检索升级（R247）
- **模糊搜索**：拼写纠错（编辑距离 ≤2 近似匹配）、拼音搜索（中文标题转拼音匹配）
- **搜索结果高亮**：匹配片段标记命中关键词位置
- **搜索联想/自动补全**：基于高频词和搜索历史的实时建议
- **多维度排序**：相关度（TF-IDF）+ 时间 + 使用频率，支持用户切换
- **搜索过滤器**：按类型/时间范围/标签/领域过滤
- 测试 ≥30 用例

#### 用户设置统一面板（R248）
- **设置聚合**：15+ 模块可配置项统一注册到 SettingsRegistry
- **设置分组**：按外观/AI/书签/学习/隐私/高级组织
- **设置导入导出**：JSON 格式，跨设备迁移
- **设置变更事件**：事件驱动，模块实时响应
- **设置校验**：每个设置项附带 validator
- **设置重置**：按类别或全部重置为出厂值
- 测试 ≥25 用例

### 修复

#### 覆盖率门禁达标（R245）
- 行覆盖率从 24.89% 提升至 ≥28%（补充 Top-10 零覆盖模块测试）
- 函数覆盖率从 49.79% 提升至 ≥50%
- 测试用例 ≥7,600 pass / 0 fail

### 性能优化

- **测试执行效率（R246）**：目标 ≤35s
- **覆盖率门禁三项全部通过**：lines ≥28% / functions ≥50% / branches ≥75%

### 文档

- **CHANGELOG.md**：补充 v3.2.2 区段
- **coverage-baseline.md**：更新为 R249 实测基线数据
```

---

### 变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-21 | 初始版本，基于 R245-R248 完成后的全量回归与发布收尾需求 |
