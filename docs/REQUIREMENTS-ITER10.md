# 需求文档 — R286: Chrome Web Store 真正提交 CWSActualSubmit

> 迭代: 飞轮迭代 R10 (R286)
> 复杂度: Medium
> 创建日期: 2026-05-25

---

## 1. 用户故事

作为 **PageWise 项目维护者**，我经历了 R210/R239/R274/R284 四次"发布就绪"自检均停留在 `publish-check.sh` 绿灯阶段而未实际提交 Chrome Web Store Developer Dashboard，我需要在 v3.4.0 上完成从产物验证到实际提交审核的全链路闭环，让 PageWise 真正进入 Chrome Web Store 审核流程并获得 submission ID，从而结束长达数月的"准备但不提交"循环。

---

## 2. 验收标准

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| AC-1 | `bash scripts/publish-check.sh` 退出码 0（全部 PASS），随后 `bash scripts/build.sh chrome` 成功生成 `dist/pagewise-v3.4.0-chrome.zip`，且 zip 体积 ≤ 500KB | `ls -lh dist/pagewise-v3.4.0-chrome.zip` 确认文件存在且大小 ≤ 512000 bytes |
| AC-2 | `.zip` 产物在 Chrome 中可正常加载运行：通过 `chrome://extensions` → 开发者模式 → 加载已解压扩展程序后，侧边栏可正常打开、页面感知生效、AI 问答可触发（或通过 Puppeteer 自动化验证加载无报错） | 手动截图 或 Puppeteer 脚本输出 `extension loaded: true, sidePanel opened: true` |
| AC-3 | `docs/privacy-policy.html` 覆盖 v3.4.0 全部数据处理声明：cross-browser compat（`lib/browser-compat.js`）、performance-monitor（`lib/performance-monitor.js`）、crash-reporter（如有 `lib/crash-reporter.js`）、telemetry（`lib/telemetry.js`），且"最后更新日期"为 2026-05-25 | `grep -c 'v3.4.0' docs/privacy-policy.html` ≥ 1；人工审查各模块声明完整 |
| AC-4 | Chrome Web Store Listing 资产就绪：5 张功能截图（1280×800px PNG）、1 张宣传图（1400×560px PNG）、中英文产品描述（各 ≤132 字符的简短描述 + 详细描述）存储在 `docs/cws-assets/` 目录下 | `ls docs/cws-assets/*.png \| wc -l` ≥ 6；`docs/cws-assets/description-zh.md` 和 `docs/cws-assets/description-en.md` 存在 |
| AC-5 | 在 Chrome Web Store Developer Dashboard 创建商品并提交审核，记录 submission ID 到 `docs/reports/cws-submission.md` | 文件 `docs/reports/cws-submission.md` 存在，包含 submission ID（格式 `chrome-extension-submission-YYYYMMDD-XXXX`）、提交时间、版本号 3.4.0、状态"待审核" |
| AC-6 | `docs/reports/cws-submission.md` 包含完整的提交状态记录和后续跟进计划（审核预计时间线、被拒常见原因及预案、上线后待办事项） | 文件存在且包含「提交状态」「审核跟进计划」「上线后待办」三个章节 |

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| **产物完整性** | `.zip` 必须通过 `scripts/publish-check.sh` 全部 7 项检查（版本一致性、权限最小化、图标完整、i18n 完整、default_locale、无残留文件、安全审计），且由 `scripts/build.sh chrome` 白名单模式构建 |
| **版本号锁定** | `manifest.json` 和 `package.json` 版本均为 `3.4.0`（R279/R280 已完成同步），本次不可修改版本号 |
| **隐私政策完整性** | `docs/privacy-policy.html` 当前已覆盖 v3.4.0 的性能监控（§3.1）、用户反馈（§3.2）、使用统计（§3.3）、跨浏览器兼容层（§3.4），但需核实 `lib/crash-reporter.js` 是否已实现——若已实现则需新增声明；若未实现则隐私政策中不应提及 |
| **截图规范** | Chrome Web Store 截图要求：1280×800px 或 640×400px，PNG/JPEG 格式；宣传图（Promotional Tile）1400×560px；不得包含浏览器 chrome 装饰、个人信息 |
| **Listing 描述限制** | 简短描述 ≤132 字符；详细描述 ≤16000 字符；名称 ≤45 字符；需提供中文（zh_CN）和英文（en）双语版本 |
| **Host 权限声明** | CWS 审核严格审查 `host_permissions`：当前声明 `api.anthropic.com`、`api.openai.com`、`api.deepseek.com`、`localhost`、`127.0.0.1`，需在提交说明中解释每个域名的用途 |
| **content_scripts <all_urls>** | 当前 `content_scripts.matches` 使用 `<all_urls>`（用于划词提问功能），CWS 审核可能质疑权限过度。需在提交备注中说明用途（用户在任意页面选中文本后提问），或考虑缩减为 `http://*/*` + `https://*/*` |
| **提交账号** | 需要已注册的 Chrome Web Store Developer 账号（一次性注册费 $5），由人工登录操作，非自动化脚本可完成 |
| **不引入新功能代码** | 本次迭代的核心动作是"提交"而非"开发"。仅允许：(a) 构建截图/UI 微调；(b) 隐私政策文字补充；(c) Listing 描述文案撰写。不新增 lib/ 模块功能代码 |
| **Node.js 环境** | 构建验证在 Node.js ≥ v22 执行 |

---

## 4. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| R210 (首次 CWS 提交准备) | 历史前置 ✅ | 首次建立 `publish-check.sh` + `build.sh` 发布工具链 |
| R239 (二次 CWS 提交准备) | 历史前置 ✅ | 完善权限最小化和 i18n 审计 |
| R274 (FirstRunPolish) | 前置 ✅ | 隐私政策初版、权限审计、i18n 完整性验证已在该迭代完成 |
| R279 (ReleaseV340) | 前置 ✅ | 版本号 bump 至 3.4.0、`publish-check.sh` 全 PASS |
| R280 (ChangelogV340Fix) | 前置 ✅ | CHANGELOG `[3.4.0]` 区段补全，CI 测试 7847 pass / 0 fail |
| R282 (JSDocAuditR282) | 前置 ✅ | JSDoc 完整性审计，提升代码可维护性 |
| R283 (E2ESmokeStable) | 前置 ✅ | E2E 冒烟测试稳定化，确保加载验证可靠 |
| R284 (ReleaseAutomationR284) | 前置 ✅ | 发布自动化脚本完善，提供 `publish-check.sh` 增强 |
| R285 (TestInfraFixR285) | 前置 ⏳ | 测试基础设施修复——如在 R286 执行前未完成，需优先恢复 CI 绿灯 |
| `scripts/publish-check.sh` | 工具依赖 | 已存在的发布前自检脚本，AC-1 直接调用 |
| `scripts/build.sh` | 工具依赖 | 已存在的构建脚本，AC-1 直接调用 |
| Chrome Web Store Developer Dashboard | 外部依赖 | 需要人工登录 Google 账号在 Web Store Developer Console 操作提交；无法通过 API 自动化 |
| 截图工具 | 工具依赖 | 需要 Chrome 浏览器 + 截图工具（或 Puppeteer 脚本）生成 1280×800 功能截图 |

---

## 5. 变更范围预估

| 文件 | 操作 | 变更内容 |
|------|------|----------|
| `docs/privacy-policy.html` | 可能修改 | 如 `lib/crash-reporter.js` 已实现，新增 §3.5 崩溃报告声明；如未实现，确认无需变更 |
| `docs/cws-assets/description-zh.md` | 新建 | 中文 Listing 描述（简短描述 + 详细描述） |
| `docs/cws-assets/description-en.md` | 新建 | 英文 Listing 描述（简短描述 + 详细描述） |
| `docs/cws-assets/*.png` (×6) | 新建 | 5 张功能截图（1280×800）+ 1 张宣传图（1400×560） |
| `docs/reports/cws-submission.md` | 新建 | 提交状态记录（submission ID、时间、版本、状态、跟进计划） |
| `scripts/publish-check.sh` | 审查 | 确认 7 项检查均 PASS，无需修改 |
| `scripts/build.sh` | 审查 | 确认 `.zip` 构建成功且 ≤ 500KB |

---

## 6. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `<all_urls>` content_scripts 权限被 CWS 审核拒绝 | **高** | 在提交说明中详细解释用途（划词提问功能需在任意页面注入选区检测脚本）；备选方案：提交前将 matches 收窄为 `http://*/*` + `https://*/*`（排除 chrome:// 等协议页面） |
| `host_permissions` 含 4 个 API 域名 + localhost 被质疑 | **中** | 在 CWS 提交备注中逐一说明：Anthropic/OpenAI/DeepSeek 为用户自选 AI 服务，localhost 为本地 Ollama 模型支持；参考竞品 AIPRM、Merlin 等扩展的同类声明 |
| R285 测试基础设施未修复导致无法验证 CI 绿灯 | **中** | R286 应在 R285 修复后执行；若 R285 尚未完成，R286 的 AC-1/AC-2 验证可先执行 `publish-check.sh` + `build.sh`，但提交审核前必须确认 CI 状态 |
| `.zip` 产物体积超过 500KB 目标 | **低** | 当前白名单构建模式已排除 tests/docs/coverage/scripts/node_modules；如仍超限，检查是否包含未压缩的图片资源或冗余 JSON |
| 截图质量不满足 CWS 规范（分辨率/内容） | **低** | 使用 Puppeteer 在标准 1280×800 viewport 中截图；确保截图展示核心功能（划词提问、AI 回答、知识库、书签图谱、技能系统） |
| 首次提交被拒后需多轮修改 | **中** | `docs/reports/cws-submission.md` 中记录常见拒绝原因及预案（权限说明不足、隐私政策缺失、功能描述不清等）；预留修改后重新提交的时间窗口 |

---

## 7. 执行步骤概要

> 以下为人工执行步骤，非代码实现。

1. **验证产物完整性** — 运行 `publish-check.sh` + `build.sh chrome`，确认 7 项检查全部 PASS、`.zip` ≤ 500KB
2. **本地加载验证** — 在 Chrome 中加载 `.zip` 解压产物，验证侧边栏打开、页面感知、AI 问答基本流程
3. **隐私政策审查** — 确认 `privacy-policy.html` 覆盖 v3.4.0 所有数据处理模块，必要时补充声明
4. **Listing 资产准备** — 截取 5 张功能截图 + 1 张宣传图，撰写中英文描述，存储到 `docs/cws-assets/`
5. **Dashboard 提交** — 登录 Chrome Web Store Developer Dashboard，创建商品、上传 `.zip`、填写 Listing 信息、提交审核
6. **记录跟进** — 创建 `docs/reports/cws-submission.md`，记录 submission ID 和后续跟进计划

---

*文档创建于 2026-05-25，飞轮迭代 R10*

---

# (以下为 R279 历史文档，保留参考)

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

---

# 需求文档 — R280: CHANGELOG v3.4.0 补全与版本断言修复 ChangelogV340Fix

> 迭代: 飞轮迭代 R10 (R280)
> 复杂度: Simple
> 创建日期: 2026-05-25

---

## 1. 用户故事

作为 **PageWise 项目维护者**，我在 R279 发布 v3.4.0 后发现 `npm run test:ci` 中 `test-r197-version-sync.js:167` 断言 `changelog.includes('[3.4.0]')` 失败，原因是 CHANGELOG.md 中 `[3.4.0]` 区段缺失（R275-R279 的变更记录仅停留在 Unreleased 区段），以及测试文件中可能存在硬编码的旧版本号未随版本升级同步更新。我需要补全 CHANGELOG 版本区段并修复所有版本断言，以恢复 CI 绿灯状态。

---

## 2. 验收标准

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| AC-1 | `docs/CHANGELOG.md` 包含 `## [3.4.0] - 2026-05-25` 区段，该区段内涵盖 R275-R279 五个迭代的变更条目（WCAG 无障碍合规、用户反馈闭环、运行时性能优化、跨浏览器兼容层、v3.4.0 发布收尾） | `grep '\[3.4.0\] - 2026-05-25' docs/CHANGELOG.md` 返回匹配；且该区段内容包含 R275/R276/R277/R278/R279 编号 |
| AC-2 | `Unreleased` 区段在 `[3.4.0]` 区段之后仅保留为空壳或已清空，不与版本区段重复 | `docs/CHANGELOG.md` 中第一个 `## [Unreleased]` 位于 `## [3.4.0]` 之前且内容为空（仅 `---` 分隔）；`[3.4.0]` 区段之前的条目不包含 R275-R279 的变更 |
| AC-3 | 全部测试文件中的硬编码版本号与 `3.4.0` 对齐：`tests/` 目录下不包含断言 `3.3.0` 版本号的代码 | `grep -rn '3\.3\.0' tests/` 返回空；`grep -rn 'assert.*3\.4\.0' tests/` 存在且与实际版本一致 |
| AC-4 | `npm run test:ci` 全部通过：≥7847 pass / 0 fail | CI 流水线输出 `# pass 7847` 以上，`# fail 0` |
| AC-5 | `npm run lint` 0 errors / 0 warnings | `npm run lint; echo $?` 退出码 0，输出无 error/warning |

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| **CHANGELOG 格式** | 遵循 [Keep a Changelog](https://keepachangelog.com/) 格式；`## [3.4.0] - 2026-05-25` 位于 `[3.2.0]` 之后、`[3.1.0]` 之前（版本降序） |
| **变更条目来源** | R275-R279 的变更描述应从 `docs/TODO.md` Phase AO 区段和各迭代报告 (`docs/reports/`) 中提取，确保信息准确且与实际交付物一致 |
| **分类标签** | 使用 CHANGELOG 中已有的中文分类标签：`### 功能`、`### 测试`、`### 架构`、`### 修复`、`### 其他` |
| **测试断言审查** | 仅修改断言中的版本号字符串，不改变断言逻辑或测试意图；对 CHANGELOG 引用历史版本区段（如 `[3.1.0]`、`[3.2.0]`）的断言保持不变（这些是历史记录，合法存在） |
| **不新增功能代码** | 本次仅做文档补全和测试断言对齐，不新增 lib/ 功能代码 |
| **R279 前置状态** | `package.json` 和 `manifest.json` 版本号在 R279 中已 bump 至 `3.4.0`，本次不再修改 |
| **Node.js 环境** | 测试在 Node.js ≥ v22 执行，与 CI 环境一致 |

---

## 4. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| R279 (ReleaseV340) | 前置 ✅ | 版本号 bump 至 3.4.0 已完成（`package.json` + `manifest.json`）；但 CHANGELOG `[3.4.0]` 区段未按预期补全，导致 R280 产生 |
| R275 (AccessibilityWCAG) | 前置 ✅ | 变更记录需迁移至 `[3.4.0]` 区段：WCAG 2.1 AA 合规、`lib/bookmark-accessibility.js` ARIA 增强、79 测试用例 |
| R276 (FeedbackLoopV34) | 前置 ✅ | 变更记录需迁移至 `[3.4.0]` 区段：用户反馈闭环、crash-reporter、usage-analytics-dashboard |
| R277 (RuntimePerfOpt) | 前置 ✅ | 变更记录需迁移至 `[3.4.0]` 区段：运行时性能监控、IndexedDB 查询优化、LRU 缓存淘汰 |
| R278 (CrossBrowserCompat) | 前置 ✅ | 变更记录需迁移至 `[3.4.0]` 区段：跨浏览器兼容层、存储适配层、多平台构建脚本 |
| R197 (VersionSyncAndChangelog) | 测试依赖 | `test-r197-version-sync.js` AC-5 断言 `changelog.includes('[3.4.0]')` 是本次修复的直接触发点；AC-1/AC-3 已对齐 3.4.0 |
| R218 (ChangelogV310Finalize) | 测试依赖 | `test-r218-changelog-v310.js` AC-2 已对齐 3.4.0，无需修改 |
| R244 (ReleaseV321) | 测试依赖 | `test-r244-release-v321.js` AC-1/AC-2 已对齐 3.4.0，AC-4 断言 `[3.2.0]` 为合法历史引用 |

---

## 5. 变更范围预估

| 文件 | 操作 | 变更内容 |
|------|------|----------|
| `docs/CHANGELOG.md` | 修改 | 补充 `## [3.4.0] - 2026-05-25` 区段（将 Unreleased 中 R275-R279 条目迁移至此）；清理重复的 Unreleased 区段（line 242 处的旧条目归入正确的历史版本区段或保留为第二 Unreleased 块） |
| `tests/test-r197-version-sync.js` | 审查/可能修改 | AC-5 断言已对齐 3.4.0（line 172-174），确认无遗漏 |
| `tests/test-r218-changelog-v310.js` | 审查/可能修改 | AC-2 断言已对齐 3.4.0（line 79/84），`describe` 描述中仍写 `3.1.0`/`3.2.0`（注释级，不影响运行），确认无遗漏 |
| `tests/test-r244-release-v321.js` | 审查/可能修改 | AC-1/AC-2 断言已对齐 3.4.0（line 46/53），AC-4 断言 `[3.2.0]` 为合法历史引用，确认无需修改 |

---

## 6. 现状诊断

### 问题根因分析

1. **CHANGELOG 缺失 `[3.4.0]` 区段**：R279 执行版本号 bump（`package.json` + `manifest.json` → 3.4.0），但 R275-R278 的变更条目仅记录在 `## [Unreleased]` 区段中，未迁移至正式的版本区段。导致 `test-r197-version-sync.js:174` 断言 `changelog.includes('[3.4.0]')` 失败。

2. **测试断言已部分对齐**：`test-r197-version-sync.js`、`test-r218-changelog-v310.js`、`test-r244-release-v321.js` 中的 `assert.equal(version, '3.4.0')` 断言已在先前迭代中更新至 3.4.0，不存在残留的 `3.3.0` 硬编码引用。

3. **Unreleased 区段结构混乱**：`docs/CHANGELOG.md` 存在两个 `## [Unreleased]` 块（line 7 和 line 242），后者包含 R190/R185/R165 等旧条目，属于历史遗留格式问题。

### 当前验证状态

| 检查项 | 当前状态 | 说明 |
|--------|---------|------|
| `npm run test:ci` | ✅ 7847 pass / 0 fail | 已恢复绿灯 |
| `npm run lint` | ✅ 0 errors / 0 warnings | 无问题 |
| `[3.4.0]` 区段 | ✅ 已存在 | `docs/CHANGELOG.md` line 11 含 R275-R278 条目 |
| 测试断言对齐 | ✅ 已完成 | 无 `3.3.0` 残留引用 |

---

*文档创建于 2026-05-25，飞轮迭代 R10*
