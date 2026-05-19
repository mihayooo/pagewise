# 需求文档 — R112: 技术债务结算 TechDebtCleanup

> 迭代: 飞轮迭代 R9 (Phase H / R112)
> 复杂度: Simple
> 创建日期: 2026-05-19

---

## 1. 用户故事

作为 **项目维护者**，我希望 **将 R103–R108 迭代中偿还的技术债务正式结算并同步到项目文档**，以便 **新协作者能通过 README、CHANGELOG 和 TD 表快速了解项目当前质量状态，不存在历史遗留误解**。

---

## 2. 验收标准

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| AC-1 | `docs/DESIGN.md` TD 表中 TD002 状态从「待解决」更新为「已关闭 (via R104)」，TD003 从「待评估」更新为「已关闭 (via R105)」 | `grep -A1 "TD002\|TD003" docs/DESIGN.md` 确认状态列文本 |
| AC-2 | `lib/test-r97.js` 文件已删除，`ls lib/test-r97.js` 返回非零退出码 | `test -f lib/test-r97.js && echo FAIL \|\| echo PASS` |
| AC-3 | `README.md` 顶部新增三个 badge 图片链接：CI 状态、测试覆盖率、ESLint lint 状态；badge 指向正确的 GitHub Actions workflow 和仓库 URL | 手动检查 README 渲染效果，badge 图片可正常加载（URL 格式正确） |
| AC-4 | `docs/CHANGELOG.md` Unreleased 区域补充 R104、R105、R106、R107 四条变更记录，格式与现有 R103/R108 条目风格一致（标题行 + 要点列表） | `grep "R104\|R105\|R106\|R107" docs/CHANGELOG.md` 确认四条均已写入 |
| AC-5 | `npm run test` 全量回归通过（≥ 5883 pass, 0 fail），`npm run lint` 无新增 error | CI 流水线绿色 |

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| **文档范围** | 本次仅修改 Markdown 文档和删除一个无用 `.js` 文件，不涉及功能代码变更 |
| **Badge URL 格式** | GitHub Actions badge: `https://github.com/whalemalus/pagewise/actions/workflows/ci.yml/badge.svg`；Coverage badge 可用 `shields.io/endpoint` 或手动说明（因 c8 未上传第三方服务，暂用静态 badge 标注 `coverage ≥ 92%`）；Lint badge 用 GitHub Actions workflow badge |
| **CHANGELOG 格式** | 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 格式，中文描述 |
| **TD 表行文** | 状态字段统一格式: `已关闭 (via R{NNN})`，与 TD001 已有格式保持一致 |
| **删除文件** | `lib/test-r97.js` 仅含 `export const test = 1;`，无任何模块引用，删除后不影响测试和功能 |

---

## 4. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| R103 (TestInfrastructureFix) | 前置 ✅ | 提供 `npm run test` / `npm run test:ci` scripts，是 AC-5 回归验证的基础 |
| R104 (AiClientErrorHandling) | 前置 ✅ | 关闭 TD002 的事实依据（ai-client.js 错误分类 + 指数退避重试 + 降级策略） |
| R105 (KnowledgeBaseIndexOpt) | 前置 ✅ | 关闭 TD003 的事实依据（IndexedDB 复合索引 + 查询缓存层） |
| R106 (CoreFlowAudit) | 前置 ✅ | CHANGELOG 需补充的 R106 变更记录来源 |
| R107 (CodeHealthDashboard) | 前置 ✅ | CHANGELOG 需补充的 R107 变更记录来源 |
| R108 (TestCoverage) | 前置 ✅ | 提供 `npm run test:coverage` 脚本和覆盖率数据，是 README badge 的数据源；TD001 已在 R108 中关闭 |
| R111 (InputSanitization) | 前置 ✅ | 最后一个功能迭代，R112 作为收尾 |

**无下游依赖**：R112 是 Phase H 的最后一轮，无后续迭代依赖本任务产出。

---

## 5. 变更范围预估

| 文件 | 操作 | 变更内容 |
|------|------|----------|
| `docs/DESIGN.md` | 修改 | TD 表 TD002/TD003 状态更新（2 行） |
| `lib/test-r97.js` | 删除 | 残留测试文件清理 |
| `README.md` | 修改 | 顶部新增 3 个 badge（~5 行 Markdown） |
| `docs/CHANGELOG.md` | 修改 | Unreleased 区域新增 R104–R107 四条记录（~40 行） |
| `docs/TODO.md` | 修改 | R112 从 `[ ]` 标记为 `[x]` |

---

## 6. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Badge 图片链接 404 | 低 | 使用 GitHub 官方 badge API，无需第三方服务 |
| 覆盖率 badge 无法动态更新 | 低 | 用静态 badge + 文字标注 `≥ 92%`，后续如接入 Codecov/Coveralls 可替换为动态 badge |
| CHANGELOG 补充遗漏关键信息 | 低 | 参照 R103–R107 对应的飞轮迭代报告（docs/reports/）还原变更内容 |
