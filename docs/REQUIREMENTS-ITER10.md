# 需求文档 — R279: 全量回归与 v3.4.0 发布 ReleaseV340

> 迭代: 飞轮迭代 R10 (R279)
> 复杂度: Simple
> 创建日期: 2026-05-25

---

## 1. 用户故事

作为 **PageWise 项目维护者**，我希望在 R275-R278（无障碍合规、运行时性能优化、跨浏览器兼容层、首次体验打磨）全部完成后执行一次完整的发布门禁验证，将版本号升级至 v3.4.0 并生成规范的发布产物，以便将本迭代新增的 WCAG 合规、性能治理和跨浏览器能力以稳定版本交付给 Chrome Web Store 用户。

---

## 2. 验收标准

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| AC-1 | `npm run test:ci` 全部通过，0 fail，总通过数 ≥ 7900（当前基线 7551，R275-R278 新增 ~350 用例） | CI 流水线输出 `# pass N` ≥ 7900，`# fail 0` |
| AC-2 | `npm run lint` 0 errors / 0 warnings（`--max-warnings 0`） | `npm run lint; echo $?` 退出码 0，输出无 error/warning |
| AC-3 | 覆盖率门禁通过：`npm run coverage:gate` 退出码 0（lines ≥ 28%、functions ≥ 50%、branches ≥ 75%） | `npm run test:coverage && npm run coverage:gate; echo $?` 退出码 0 |
| AC-4 | WCAG 合规测试全部通过：`tests/test-bookmark-accessibility.js` 49 用例 0 fail | `node --test tests/test-bookmark-accessibility.js` 输出 `pass 49, fail 0` |
| AC-5 | 版本号同步：`package.json` version 和 `manifest.json` version 均为 `"3.4.0"` | `grep '"version"' package.json manifest.json` 两处均输出 `3.4.0` |
| AC-6 | CHANGELOG.md 新增 `[3.4.0]` 区段，覆盖 R275-R278 四个迭代的变更摘要（无障碍合规、性能优化、跨浏览器兼容、首次体验打磨） | `grep '\[3.4.0\]' CHANGELOG.md` 返回匹配 |
| AC-7 | 基线文档已更新：`docs/reports/coverage-baseline.md` 快照数值与 `npm run test:coverage` 实测值一致；`docs/reports/performance-baseline.md` 新建并记录 R277 性能基线指标 | 文件存在且数据与实测一致 |
| AC-8 | `bash scripts/publish-check.sh` 退出码 0（manifest 版本一致、权限审计、图标存在、i18n 完整、无残留文件、安全审计全部 PASS） | `bash scripts/publish-check.sh; echo $?` 退出码 0 |

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| **版本号同步** | `package.json` 和 `manifest.json` 必须同步更新为 `3.4.0`，不可遗漏任一文件；当前均为 `3.2.2` |
| **CHANGELOG 格式** | 遵循 Keep a Changelog 格式，新增 `## [3.4.0] - 2026-05-25` 区段，位于 `[3.1.0]` 之前；子分类为 Added / Changed / Fixed / Performance / Tests / Documentation |
| **覆盖率基线刷新** | `docs/reports/coverage-baseline.md` 中的「基线快照」表（Lines/Branches/Functions 分子分母百分比）必须用本次 `npm run test:coverage` 实测值覆盖，不可保留旧数据；「门禁阈值映射」表中的门禁阈值维持不变（lines ≥28%、functions ≥50%、branches ≥75%） |
| **性能基线新建** | `docs/reports/performance-baseline.md` 当前不存在，需新建；内容应包含 R277 RuntimePerfOpt 定义的核心指标：SidePanel 首屏 <300ms、知识库搜索 <50ms、图谱渲染 <1s (200 nodes)；以及测量环境、工具、日期 |
| **测试依赖** | AC-1 的 ≥7900 pass 数量依赖 R275（49 无障碍用例）+ R277（≥20 性能监控用例）+ R278（≥25 跨浏览器用例）的测试均已就绪且通过 |
| **publish-check.sh 依赖** | 该脚本检查 manifest ↔ package.json 版本一致性（AC-5 是前提）、图标完整性、`_locales` 双语一致性、安全审计；AC-8 必须在 AC-5 之后执行 |
| **不新增功能代码** | 本次迭代仅做版本发布准备（版本号 bump、文档更新、回归验证），不新增 lib/ 功能代码；如回归中发现失败用例，仅允许最小修复 |
| **Node.js 环境** | 测试在 Node.js ≥ v22 执行，与 CI 环境一致 |

---

## 4. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| R275 (AccessibilityWCAG) | 前置 ✅ | 提供 `lib/bookmark-accessibility.js` + 49 个 WCAG 测试用例；AC-4 直接验证此交付物 |
| R277 (RuntimePerfOpt) | 前置 ✅ | 提供性能监控模块 + 性能基线定义（SidePanel <300ms / 知识库搜索 <50ms / 图谱渲染 <1s）；AC-7 中 `performance-baseline.md` 记录的指标来源 |
| R278 (CrossBrowserCompat) | 前置 ✅ | 提供 `lib/browser-compat.js` + `lib/platform-detector.js` + `lib/storage-adapter.js` + ≥25 跨浏览器测试用例；对 AC-1 的 7900+ pass 数量有贡献 |
| R274 (FirstRunPolish) | 前置 ✅ | 隐私政策、权限最小化、i18n 完整性在该迭代已验证；`publish-check.sh`（AC-8）依赖这些前置清理已完成 |
| R276 (版本号当前状态) | 前置 ✅ | 当前 `package.json` / `manifest.json` 版本为 `3.2.2`；AC-5 需 bump 至 `3.4.0` |
| `scripts/publish-check.sh` (R208) | 工具依赖 | 已存在的发布前自检脚本，AC-8 直接调用 |
| `scripts/bump-version.sh` (R214) | 工具依赖 | 可选：使用已有的版本号同步脚本简化 AC-5 操作，或手动编辑两个文件 |
| Chrome Web Store 提交 | 下游 🔜 | v3.4.0 发布产物就绪后，上传至 Chrome Web Store Dev Console |

---

## 5. 变更范围预估

| 文件 | 操作 | 变更内容 |
|------|------|----------|
| `package.json` | 修改 | version: `"3.2.2"` → `"3.4.0"` |
| `manifest.json` | 修改 | version: `"3.2.2"` → `"3.4.0"` |
| `CHANGELOG.md` | 修改 | 新增 `## [3.4.0] - 2026-05-25` 区段（~40-60 行），含 R275-R278 四项变更摘要 |
| `docs/reports/coverage-baseline.md` | 修改 | 刷新基线快照表（Lines/Branches/Functions 实测值） |
| `docs/reports/performance-baseline.md` | 新建 | 性能基线文档（测量环境、核心指标阈值、测量工具、历史对比） |

---

## 6. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| R275-R278 存在未通过用例导致 AC-1 失败 | 中 | 执行 `npm run test:ci` 后逐个排查失败用例，对回归性修复提交最小变更 |
| 覆盖率门禁 lines ≥28% 未达到（当前基线 24.89%） | 高 | R275-R278 新增模块均有对应测试，lines 覆盖率有望提升；如仍未达标，需检查 c8 是否正确采集新模块；不得降低门禁阈值 |
| `publish-check.sh` 报 FAIL | 低 | 已在 R274 进行过自检；如 FAIL 项为 R275-R278 引入的新问题（如新增模块未注册 i18n key），针对性修复 |
| CHANGELOG 遗漏 R276 迭代内容 | 低 | R274 (FirstRunPolish) 是 v3.3.0 提交前的合规审查，本次 CHANGELOG 需确认是否也纳入 v3.4.0 变更记录 |

---

*文档创建于 2026-05-25，飞轮迭代 R10*
