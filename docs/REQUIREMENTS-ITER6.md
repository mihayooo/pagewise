# REQUIREMENTS — R269: 全量回归与 v3.3.0 发布收尾 (ReleaseV330)

> 迭代: R269
> 日期: 2026-05-25
> 复杂度: Simple
> 阶段: 收尾 — R265-R268 四轮质量冲刺后的版本发布
> 前置迭代: R265 (CoverageGatePass) → R266 (CoverageGatePassR265) → R267 (TestEfficiencyOpt) → R268 (E2EChromeHardening)

---

## 1. 用户故事

作为 PageWise 的维护者，在 R265-R268 四轮迭代完成测试修复、覆盖率门禁达标、测试效率优化和 E2E 加固之后，我需要执行一次完整的全量回归验证，确认所有质量门禁均已通过，然后将版本号 bump 至 3.3.0 并更新所有发布文档，确保发布产物就绪、可直接提交 Chrome Web Store。

---

## 2. 验收标准

### AC1: 全量 CI 测试通过
- 执行 `npm run test:ci`，结果为 **0 fail**
- 通过用例数目标 **≥ 7,850 pass**（R256 基线 7,551 + R265-R268 新增用例）
- 任何 fail 用例必须在本轮修复或标记为 `skip` 并记录原因

### AC2: Lint 零告警
- 执行 `npm run lint`，输出 **0 errors / 0 warnings**
- `--max-warnings 0` 严格模式生效

### AC3: 覆盖率门禁三项全部通过
- 执行 `npm run test:coverage && npm run coverage:gate`，三项全部通过：
  - **Lines ≥ 28%**（当前基线 24.89%，R266 目标提升至 ≥28%）
  - **Functions ≥ 50%**（当前基线 49.79%，R266 目标提升至 ≥53%）
  - **Branches ≥ 75%**（当前基线 75.83%，已达标准）
- 门禁配置位于 `package.json` → `coverage:gate`，阈值为 `--lines 28 --branches 75 --functions 50`

### AC4: 测试执行效率达标
- 全量 CI 测试执行时间 **≤ 40 秒**
- 超时需排查慢测试（残留 `setTimeout`、大循环、未 mock 的 I/O 等）

### AC5: 版本号同步 bump 至 3.3.0
- `package.json` → `"version": "3.3.0"`（当前 3.2.2）
- `manifest.json` → `"version": "3.3.0"`（当前 3.2.2）
- 两处版本号必须**完全一致**，由 `scripts/publish-check.sh` 的版本一致性检查项保障

### AC6: CHANGELOG.md 补充 v3.3.0 区段
- 在 CHANGELOG.md 顶部新增 `[3.3.0] - 2026-05-25` 区段
- 内容涵盖 R265-R268 全部变更，至少包含以下子节：
  - **修复**: R265 测试失败修复、覆盖率门禁达标
  - **测试**: R266 覆盖率从 22.46% 提升至 ≥28%、新增 ≥50 用例
  - **性能优化**: R267 测试执行效率优化（≤40s）
  - **测试**: R268 E2E Chrome 框架加固与冒烟验证
  - **版本**: R269 v3.3.0 发布收尾
- 格式遵循现有 CHANGELOG 风格（Keep a Changelog 中文版）

### AC7: 覆盖率基线文档更新
- 更新 `docs/reports/coverage-baseline.md`，具体包括：
  - 基线快照表格：用 R266 完成后的实测覆盖率数据替换 R256 快照
  - 测量环境：日期更新为 2026-05-25
  - 测试用例数：更新为 R269 实测值
  - 历史门禁阈值演进表：新增 R266/R269 行记录
  - 文档末尾标注更新者信息

### AC8: 发布产物自检通过
- 执行 `bash scripts/publish-check.sh`，输出 **exit code 0**（全部通过）
- 自检覆盖 7 项：版本一致性、权限审计、图标完整性、i18n 完整性、无残留开发文件、安全审计、default_locale 目录

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| 不引入新功能 | 本轮纯收尾，不新增 lib 模块或功能特性 |
| 不修改业务代码 | 仅允许：(a) 版本号 bump (b) CHANGELOG 编辑 (c) 覆盖率基线文档更新 (d) 失败测试修复 |
| 测试修复范围 | 如有 test:ci 失败，允许修改测试代码或添加 `.skip` 注解（须记录原因） |
| 版本号格式 | 遵循 SemVer `MAJOR.MINOR.PATCH`，从 3.2.2 → 3.3.0（MINOR bump） |
| CHANGELOG 格式 | 遵循 Keep a Changelog 中文版格式，与 3.1.0/3.0.0 区段风格一致 |
| 覆盖率测量工具 | c8 (V8 native coverage)，命令 `npm run test:coverage` |
| CI 环境 | Ubuntu 22.04, Node.js v22.x |
| 测试框架 | Node.js 内置 `node:test`，零外部依赖 |
| 发布产物 | Chrome Web Store 就绪 ZIP（由 `scripts/build.sh` 生成） |
| 无 schema 变更 | manifest.json permissions/host_permissions 不得变更 |

---

## 4. 依赖关系

### 前置迭代（输入）

| 迭代 | 主题 | 状态 | 对 R269 的贡献 |
|------|------|------|---------------|
| R265 | CoverageGatePass | ✅ 已完成 | 行覆盖率从 22.46% 提升至 ≥28%；新增 ≥50 测试用例覆盖零覆盖纯逻辑模块 |
| R266 | CoverageGatePassR265 | ✅ 已完成 | 覆盖率门禁三项全部达标（lines/functions/branches） |
| R267 | TestEfficiencyOpt | ✅ 已完成 | 测试执行时间优化至 ≤40s |
| R268 | E2EChromeHardening | ✅ 已完成 | E2E Chrome 框架加固，Playwright + headless Chrome + MV3 链路验证 |

### 工具/脚本依赖（已就绪）

| 工具 | 文件 | 用途 |
|------|------|------|
| 版本 bump 脚本 | `scripts/bump-version.sh` | 同步更新 package.json / manifest.json 版本号 |
| 发布自检脚本 | `scripts/publish-check.sh` | 7 项发布前自动化检查 |
| 覆盖率门禁 | `package.json` → `coverage:gate` | `c8 check-coverage --lines 28 --branches 75 --functions 50` |
| 构建脚本 | `scripts/build.sh` | 生成 Chrome Web Store .zip 产物 |
| 覆盖率清理 | `scripts/clean-coverage.js` | 覆盖率临时目录防御性清理 |

### 无下游阻塞

R269 是发布收尾迭代，完成后项目进入 v3.3.0 稳定态，可直接：
- 提交 Chrome Web Store 审核
- 打 git tag `v3.3.0`
- 触发 GitHub Actions `release.yml` 自动发布流水线

---

## 5. 执行步骤概览

```
步骤 1 ─ 执行全量回归          npm run test:ci          → 0 fail, ≥7,850 pass
步骤 2 ─ Lint 检查              npm run lint              → 0 errors, 0 warnings
步骤 3 ─ 覆盖率测量与门禁       npm run test:coverage     → npm run coverage:gate → 三项通过
步骤 4 ─ 版本号 bump            bash scripts/bump-version.sh 3.3.0
步骤 5 ─ CHANGELOG 编辑         手动补充 [3.3.0] - 2026-05-25 区段
步骤 6 ─ 覆盖率基线文档更新     编辑 docs/reports/coverage-baseline.md
步骤 7 ─ 发布产物自检           bash scripts/publish-check.sh → exit 0
步骤 8 ─ 最终验证               二次执行 test:ci + lint 确认无回归
```

---

## 6. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| R265-R268 积累的测试存在间歇性失败 | 中 | 标记 flaky test 为 `.skip` 并记录 issue，不阻塞发布 |
| 覆盖率刚好踩线（如 28.01%），CI 浮动导致失败 | 低 | 预留 ≥0.5pp 安全余量，实测 ≥28.5% |
| publish-check.sh 发现版本不一致 | 低 | 使用 bump-version.sh 脚本而非手动修改，确保原子同步 |
| CHANGELOG 遗漏 R265-R268 某次迭代变更 | 低 | 逐一对比 git log R265-R268 commit message |

---

## 7. 成功指标

| 指标 | 目标值 |
|------|--------|
| test:ci fail 数 | 0 |
| test:ci pass 数 | ≥ 7,850 |
| lint errors + warnings | 0 |
| Lines 覆盖率 | ≥ 28% |
| Functions 覆盖率 | ≥ 50% |
| Branches 覆盖率 | ≥ 75% |
| 测试执行时间 | ≤ 40s |
| 版本号一致性 (package.json ↔ manifest.json) | ✅ 3.3.0 |
| publish-check.sh exit code | 0 |

---

## 8. 输出文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | **修改** | version: 3.2.2 → 3.3.0 |
| `manifest.json` | **修改** | version: 3.2.2 → 3.3.0 |
| `CHANGELOG.md` | **修改** | 顶部新增 [3.3.0] - 2026-05-25 区段 |
| `docs/reports/coverage-baseline.md` | **修改** | 基线快照更新为 R269 实测值 |
| `docs/REQUIREMENTS-ITER6.md` | **新建** | 本文档 |
| 失败测试文件（如有） | **修改** | 修复或 `.skip` 标记 |

---

## 需求变更记录

| 日期 | 需求 | 变更内容 |
|------|------|----------|
| 2026-05-25 | R269 | 初始创建 — v3.3.0 全量回归与发布收尾需求文档 |
