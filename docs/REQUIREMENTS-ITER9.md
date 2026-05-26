# 需求文档 — R324: 全量回归与 v3.4.3 发布收尾 (ReleaseV343)

> **迭代**: R324
> **复杂度**: Simple
> **日期**: 2026-05-26
> **前置依赖**: R320 (BookmarkContentPreview)、R321 (ChangelogHygiene)、R322 (已跳过/无变更)、R323 (BookmarkStatisticsDashboard)
> **当前版本**: 3.4.2 → 目标版本: 3.4.3

---

## 1. 用户故事

**作为** PageWise 的维护者/发布者，  
**我希望** 在 R320-R323 全部功能迭代完成后，执行一次完整的质量回归和版本发布收尾，  
**以便** 确保 v3.4.3 版本在测试通过率、代码质量、覆盖率门禁、E2E 路径、发布产物等方面全部达标，可以安全地提交至 Chrome Web Store。

---

## 2. 验收标准

### AC-1: 全量单元测试通过
- `npm run test:ci` 输出 **0 fail**
- 通过测试总数 **≥ 7800 pass**（当前基线 ~7551，R320-R323 新增模块各带 ≥25~30 测试用例，预计新增 ≥80+ 条）
- 任何 fail 用例必须在本轮修复或记录为已知缺陷并豁免

### AC-2: 代码质量门禁
- `npm run lint` 输出 **0 errors / 0 warnings**（当前基线已达 0/0，保持不退化）
- R320-R323 新增的 4 个 lib 模块（`bookmark-content-preview.js` 及其子模块、`bookmark-statistics-dashboard.js` 及其子模块）必须通过 ESLint 检查

### AC-3: 覆盖率门禁三项通过
- `npm run coverage:gate` 检查以下三项全部通过：
  - **Lines ≥ 30%**（当前门禁 28%，本轮收紧至 30%；当前实测 24.89%，需 R320-R323 新增测试提升 ≥6pp）
  - **Functions ≥ 53%**（当前门禁 50%，本轮收紧至 53%；当前实测 49.79%）
  - **Branches ≥ 75%**（当前门禁 75%，当前实测 75.83%，保持不变）
- 如任一维度未达标，需在本轮补充测试覆盖或调整阈值（需记录理由）

### AC-4: 测试执行性能
- `npm run test:ci` 总执行时间 **≤ 35 秒**（当前基线 ~24s，R320-R323 新增 ~80 用例应控制在 35s 内）
- 如超时需排查慢测试（`scripts/check-test-time.sh`）

### AC-5: 版本号同步
- `package.json` version 字段更新为 `"3.4.3"`
- `manifest.json` version 字段更新为 `"3.4.3"`
- 两处版本号必须一致（由 `test-r197-version-sync.js` 验证）

### AC-6: CHANGELOG 更新
- `CHANGELOG.md` 新增 `[3.4.3]` 版本区段（日期为 2026-05-26）
- 包含 R320-R323 全部变更摘要：
  - **R320**: 书签内容预览功能 (BookmarkContentPreview)
  - **R321**: CHANGELOG 版本归档与文档卫生 (ChangelogHygiene)
  - **R323**: 书签统计仪表盘 (BookmarkStatisticsDashboard)
- `[Unreleased]` 区段应为空（所有变更已归入版本号）
- `npm run test:ci:release` 全部通过（含 changelog 格式验证）

### AC-7: E2E 路径通过
- `npm run test:e2e` 通过 **≥ 9 条**用户路径（当前 E2E 包含 smoke + core-scenarios，覆盖扩展加载、SidePanel、选中文字、书签采集、知识库搜索、设置切换、选中→问答→归档、书签→搜索→推荐→图谱、复习→打卡→教练）
- 0 条 fail

### AC-8: 发布产物就绪
- `bash scripts/publish-check.sh` 全部 PASS（版本一致性、权限审计、图标完整性、i18n 完整性、无残留开发文件、安全审计）
- 退出码为 0

### AC-9: 文档同步更新
- `docs/reports/coverage-baseline.md` 更新 R324 实测覆盖率数据（行/函数/分支/语句覆盖率实际数值）
- `docs/ROADMAP.md` 状态表更新：版本 v3.4.3 / 迭代 R324 / 测试总数实测值 / 模块数实测值
- ROADMAP 路线图总览新增 Phase AV 条目

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| **零外部依赖** | 项目零运行时依赖，所有功能纯原生 JS 实现，不得引入新 devDependency |
| **Node.js 版本** | 测试环境为 Node.js v22.x（与 CI 一致） |
| **覆盖率工具** | c8 (V8 native coverage)，不引入 Istanbul/nyc |
| **测试框架** | Node.js 内置 test runner (`node --test`)，不引入 Jest/Mocha/Vitest |
| **ESLint 版本** | v9.x flat config，`--max-warnings 0` 严格执行 |
| **Manifest V3** | Chrome Extension Manifest V3，不得降级至 MV2 |
| **模块大小** | 所有 lib/ 文件 ≤ 400 行（re-export 模式保持 API 兼容） |
| **版本号格式** | semver `MAJOR.MINOR.PATCH`，三处文件同步（package.json / manifest.json / CHANGELOG） |
| **测试性能** | 单用例不得引入 `setTimeout`/`await sleep` 阻塞（R198/R202 已清理） |

---

## 4. 依赖关系

### 4.1 上游依赖（必须先完成）

| 迭代 | 名称 | 状态 | 影响 |
|------|------|------|------|
| R320 | BookmarkContentPreview | ✅ 已完成 | 新增 `lib/bookmark-content-preview.js` + 测试文件，测试数增加 |
| R321 | ChangelogHygiene | ✅ 已完成 | CHANGELOG 归档 + ROADMAP/ARCH 审查，元数据一致性基线 |
| R322 | (跳过/无变更) | — | 无影响 |
| R323 | BookmarkStatisticsDashboard | ✅ 已完成 | 新增 `lib/bookmark-statistics-dashboard.js` + 测试文件，测试数增加 |

### 4.2 同级依赖（需要验证通过）

| 脚本/测试 | 用途 | 对应 AC |
|-----------|------|---------|
| `npm run test:ci` | 全量单元测试（排除 e2e/coverage-boost/lint/release 测试） | AC-1 |
| `npm run lint` | ESLint 检查 | AC-2 |
| `npm run coverage:gate` | 覆盖率门禁 | AC-3 |
| `scripts/check-test-time.sh` | 测试执行时间门禁 | AC-4 |
| `npm run test:ci:release` | 版本同步 + CHANGELOG 格式验证 | AC-5, AC-6 |
| `npm run test:e2e` | Chrome E2E 用户路径 | AC-7 |
| `scripts/publish-check.sh` | 发布产物自检 | AC-8 |

### 4.3 下游影响

| 受影响方 | 说明 |
|---------|------|
| Chrome Web Store | v3.4.3 发布后需重新打包提交（`scripts/build.sh` 生成 .zip） |
| docs/ROADMAP.md | 状态表和路线图需同步更新 |
| docs/reports/coverage-baseline.md | 覆盖率基线快照需更新（如阈值收紧则同步更新门禁映射表） |

### 4.4 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| R320-R323 新模块引入回归测试失败 | 中 | 逐模块 `npm run test:ci` 定位失败用例，快速修复 |
| 覆盖率门禁收紧至 Lines≥30% 未达标 | 高（当前实测 24.89%） | R320-R323 新增 ~80 测试用例提升覆盖；若仍不足可为 Top-10 未覆盖模块补充边界用例 |
| Functions 覆盖率收紧至 ≥53% 未达标 | 中（当前实测 49.79%） | 同上策略，或适当放宽至 52% |
| E2E 路径不稳定（TimeoutError） | 低 | E2E 已配置 2 次自动重试机制（R288/R312 策略） |
| CHANGELOG `test:ci:release` 格式校验失败 | 低 | 严格遵循 Keep a Changelog 格式，[3.4.3] 区段参照 [3.1.0] 模板 |

---

## 5. 执行清单（按序）

1. **全量测试回归**: `npm run test:ci` → 确认 0 fail，记录 pass 总数
2. **Lint 检查**: `npm run lint` → 确认 0 errors / 0 warnings
3. **覆盖率测量**: `npm run test:coverage && npm run coverage:gate` → 记录实测值，确认门禁通过
4. **测试性能检查**: `npm run test:ci:gate` → 确认 ≤35s
5. **版本号 bump**: `package.json` + `manifest.json` → `3.4.3`
6. **CHANGELOG 更新**: 新增 `[3.4.3]` 区段，清空 `[Unreleased]`
7. **Release 测试**: `npm run test:ci:release` → 全部通过
8. **E2E 测试**: `npm run test:e2e` → ≥9 条通过
9. **发布检查**: `bash scripts/publish-check.sh` → 退出码 0
10. **文档更新**: `coverage-baseline.md` + `ROADMAP.md`

---

*文档生成于 2026-05-26 by Plan Agent*
