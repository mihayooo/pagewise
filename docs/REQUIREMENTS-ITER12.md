# 需求文档 — R240: 版本同步断言修复 VersionSyncFix

> 需求编号: R240
> 优先级: P0 (CI 红灯阻塞发布)
> 迭代: Phase AH, 飞轮迭代 R67
> 日期: 2026-05-21
> 复杂度: Simple

---

## 一、背景与动机

### 问题陈述

`npm run test:ci` 当前 **7549 pass / 2 fail**，两个失败用例全部集中在 `tests/test-r197-version-sync.js`：

| 失败用例 | 断言内容 | 实际值 | 根因 |
|----------|----------|--------|------|
| `AC-3: manifest.json version consistency` → "manifest.json version should be \"3.1.0\"" | `manifest.version === '3.1.0'` | `'3.2.0'` | R231 将 manifest.json 更新至 3.2.0，但测试硬编码断言未同步 |
| `AC-5: no functional regression` → "version files should be consistent across all three files" | `pkg.version === '3.1.0'` 且 `manifest.version === '3.1.0'` | 两者均为 `'3.2.0'` | 同上 |

**根因链**：R231 (CHANGELOG 补全与 v3.2.0 版本发布) 将 `package.json` 和 `manifest.json` 的版本号从 `3.1.0` 更新至 `3.2.0`，同时在 CHANGELOG.md 新增了 `[3.2.0]` 区段，但 `test-r197-version-sync.js` 中 AC-3（第 108-110 行）和 AC-5（第 167-174 行）的硬编码断言仍指向 `3.1.0`。

### 影响范围

| 维度 | 影响 |
|------|------|
| CI 流水线 | `npm run test:ci` 2 个 fail，CI 红灯 |
| 发布流程 | v3.2.0 发布就绪检查（R239）无法通过全量回归 |
| 测试可信度 | 版本同步测试（R197 设计目的）丧失保护意义 |

---

## 二、用户故事

> 作为 CI 流水线的守护者，我希望所有测试中的版本号断言与 `package.json` / `manifest.json` 中的实际版本号保持同步，这样 `npm run test:ci` 能恢复 0 fail 状态，v3.2.0 发布流程不再被阻塞。

---

## 三、验收标准

### AC-1: test-r197-version-sync.js AC-3 断言更新

- [ ] `test-r197-version-sync.js` 第 108-110 行，`manifest.json version should be "3.1.0"` 断言更新为 `manifest.json version should be "3.2.0"`
- [ ] `assert.equal(manifest.version, '3.1.0')` 改为 `assert.equal(manifest.version, '3.2.0')`

### AC-2: test-r197-version-sync.js AC-5 断言更新

- [ ] `test-r197-version-sync.js` 第 172-173 行，AC-5 中 `pkg.version === '3.1.0'` 和 `manifest.version === '3.1.0'` 断言更新为 `'3.2.0'`
- [ ] AC-5 的 CHANGELOG 检查（`changelog.includes('[3.1.0]')`）保留不变——CHANGELOG.md 确实包含 `[3.1.0]` 历史区段，此断言验证的是历史完整性而非当前版本

### AC-3: 全量硬编码版本号扫描

- [ ] 对 `tests/` 目录执行 `grep -rn "3\.1\.0" tests/ --include="*.js"` 全量扫描
- [ ] 排除以下合理的 `3.1.0` 引用（不需修改）：
  - `test-r218-changelog-v310.js`：该文件 AC-2 已在 R235 中更新为断言 `3.2.0`；其余 `3.1.0` 引用是验证 CHANGELOG `[3.1.0]` 区段的存在性和完整性，属于历史验证，合理
  - `test-r208-release-build.js` 第 225-227 行：断言 `RELEASE-NOTES-v3.1.md` 文件中包含 `3.1.0`，验证的是 v3.1 发布说明的历史内容，合理
  - `test-r197-version-sync.js` AC-2 部分：验证 CHANGELOG.md 包含 `[3.1.0]` 区段，属于历史完整性验证，合理
- [ ] 对所有不合理引用（断言 package.json/manifest.json 版本为 3.1.0）批量更新为 3.2.0

### AC-4: CI 绿灯

- [ ] `npm run test:ci` 结果为 **≥7551 pass / 0 fail**
- [ ] `npm run lint` 结果为 **0 errors / 0 warnings**

---

## 四、技术约束

### TC-1: 最小变更原则

- 仅修改测试断言，不修改任何源码（`lib/`、`sidebar/`、`popup/`、`options/`）
- 不修改 `package.json`、`manifest.json`、`CHANGELOG.md` 等产物文件（版本号已是正确的 3.2.0）
- 变更文件预期 ≤ 3 个（`test-r197-version-sync.js` 必改，其余视扫描结果）

### TC-2: 保留历史验证

- `test-r197-version-sync.js` AC-2 中所有验证 CHANGELOG.md 包含 `[3.1.0]` 区段的断言**不得修改**——这些断言验证的是 R197 的交付物（CHANGELOG 历史完整性），而非当前版本号
- `test-r218-changelog-v310.js` 中验证 `[3.1.0]` CHANGELOG 区段的断言**不得修改**——同理
- `test-r208-release-build.js` 中验证 `RELEASE-NOTES-v3.1.md` 内容的断言**不得修改**——验证的是 v3.1 发布说明

### TC-3: 版本一致性守恒

- 修改后，`test-r197-version-sync.js` 中断言的版本号必须与 `package.json` `version` 字段和 `manifest.json` `version` 字段实际值一致（当前均为 `3.2.0`）
- `test-r197-version-sync.js` AC-1 的 `describe` 注释 `"AC-1: package.json 版本号更新为 3.1.0"` 已在 R235 中改为 `"3.2.0"`——如未改则需同步更新注释

---

## 五、依赖关系

| 依赖 | 类型 | 说明 |
|------|------|------|
| R231 (CHANGELOG 补全与 v3.2.0 版本发布) | 根因依赖 | R231 将版本号更新至 3.2.0，是本次修复的直接根因 |
| R235 (15 个测试失败批量修复) | 前置依赖 | R235 已修复 test-r197-version-sync.js 中 AC-1 的版本断言（第 28-30 行），但遗漏了 AC-3 和 AC-5 |
| package.json `version: "3.2.0"` | 数据源 | 断言的目标值来源 |
| manifest.json `version: "3.2.0"` | 数据源 | 断言的目标值来源 |
| CHANGELOG.md `[3.2.0]` 区段 | 历史验证 | AC-2 断言应验证 `[3.2.0]` 区段的存在，但当前 AC-2 验证的是 `[3.1.0]` 区段（历史完整性，合理保留） |

---

## 六、不在范围内 (Out of Scope)

| 项目 | 原因 |
|------|------|
| 修改 source code 版本号 | `package.json` / `manifest.json` 版本号已是 `3.2.0`，无需修改 |
| CHANGELOG.md 补全 | `[3.2.0]` 区段已存在（R231 创建），无需修改 |
| 覆盖率治理 | 属于 R241 范围 |
| 测试执行效率优化 | 属于 R242 范围 |
| 新增测试用例 | 本次仅修复现有断言，不新增用例 |
| 版本号 bump 至 3.2.1 | 属于 R244 范围 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 遗漏其他测试文件中的 3.1.0 硬编码断言 | 中 | 低（仅导致 CI 再次 fail） | AC-3 要求全量 `grep` 扫描，逐条审查 |
| 过度修改（误改历史验证断言） | 低 | 中（破坏 CHANGELOG 完整性验证） | TC-2 明确列出不得修改的断言清单 |
| test-r218-changelog-v310.js 中残留不一致 | 低 | 低 | R235 已更新 AC-2 断言，本次扫描二次确认 |

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| CI 测试通过率 | ≥7551 pass / 0 fail | `npm run test:ci` 输出 |
| Lint 零告警 | 0 errors / 0 warnings | `npm run lint` 输出 |
| 硬编码版本号残留 | tests/ 中无 `assert.*('3.1.0')` 指向 package.json/manifest.json | `grep -rn "3\.1\.0" tests/` 逐条审查 |
| 变更文件数 | ≤ 3 个 | `git diff --stat` |

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-21 | 初始化 R240 需求文档 |
