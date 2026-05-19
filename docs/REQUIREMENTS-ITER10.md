# 需求文档 — R113: CI 流水线修复 CiLintFix

> 迭代: 飞轮迭代 R10 (Phase I / R113)
> 复杂度: Simple
> 创建日期: 2026-05-19

---

## 1. 用户故事

作为 **项目维护者**，我希望 **CI 流水线中 `lint` job 真正执行 ESLint 静态检查（而非仅做 `node --check` 语法校验），且设计文档的 TD 表包含 ESLint 基础设施记录**，以便 **R109 建立的 ESLint 体系在持续集成中得到正确体现，所有设计验证测试全部通过**。

---

## 2. 验收标准

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| AC-1 | `.github/workflows/ci.yml` 的 `lint` job 新增一个步骤，执行 `npm run lint`（或等效的 `npx eslint .` 命令），且该步骤在 `node --check` 之后、`Validate manifest.json` 之前（或之后）执行 | `grep -n "npm run lint\|npx eslint" .github/workflows/ci.yml` 返回匹配行；手动阅读 ci.yml lint job 确认步骤顺序合理 |
| AC-2 | CI lint job 新增步骤在 ESLint 执行前执行 `npm install`（或使用 `actions/setup-node` 的 `npm ci`），确保 devDependencies 中的 eslint 已安装 | 在 CI 环境中 lint job 通过，不报 `eslint: command not found` |
| AC-3 | `docs/DESIGN.md` 已知技术债务表新增 TD004 记录：`TD004 | ESLint CI 集成缺失 | 低 | 已关闭 (via R113)`；或在现有设计决策区域新增关于 R109 ESLint 基础设施的说明段落（含 `ESLint` 或 `eslint` 或 `lint` 关键词） | `grep -c "ESLint\|eslint\|lint" docs/DESIGN.md` 返回值 ≥ 1；`grep "TD004" docs/DESIGN.md` 返回匹配 |
| AC-4 | `npm run test` 全量回归通过（6004 pass, 0 fail），`tests/test-eslint-infs.js` 中所有 24 个用例全部通过 | `node --test tests/test-eslint-infs.js` 输出 `pass 24, fail 0` |
| AC-5 | `npm run lint` 本身可正常执行（即使存在 warnings，不产生 fatal error 阻断） | `npm run lint; echo $?` 退出码为 0 或仅 warning 级别 |

---

## 3. 技术约束

| 约束 | 说明 |
|------|------|
| **CI Workflow 格式** | 遵循现有 `.github/workflows/ci.yml` 的 YAML 结构和 `actions/checkout@v4` + `actions/setup-node@v4` 模式 |
| **npm install 时机** | lint job 当前未执行 `npm install`，新增 ESLint 步骤前必须确保 `node_modules` 已就绪；推荐在 lint job 顶部添加 `npm install` 或 `npm ci` 步骤，与 test job 保持一致 |
| **ESLint max-warnings** | 现有 `package.json` 中 `npm run lint` 定义为 `eslint . --max-warnings 10000`，允许大量 warnings 存在；CI 中应使用此脚本，不修改阈值 |
| **TD 表格式** | 新增 TD004 行须与现有 TD001–TD003 格式一致：`| TD{NNN} | {描述} | {优先级} | {状态} |` |
| **设计文档风格** | DESIGN.md 中如新增设计决策段落，应遵循现有 D001–D022 的格式：`### D{NNN}: {标题}` + 决策日期 + 问题 + 方案选择 + 原因 |
| **不影响功能代码** | 本次仅修改 CI 配置（ci.yml）和设计文档（DESIGN.md），不改动任何 lib/ 或 tests/ 功能代码 |

---

## 4. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| R103 (TestInfrastructureFix) | 前置 ✅ | 提供 `npm run test` / `npm run test:ci` scripts，是 AC-4 回归验证的基础 |
| R108 (TestCoverage) | 前置 ✅ | 提供 `npm run test:coverage` 脚本，c8 已集成到 devDependencies |
| R109 (ESLintSetup) | 前置 ✅ | 提供 `eslint.config.js` flat config、`package.json` 中的 `lint` script 和 eslint devDependency；R113 是 R109 的 CI 补完 |
| R112 (TechDebtCleanup) | 前置 ✅ | 已关闭 TD001–TD003，TD004 新增延续同一 TD 表体系 |
| R114 (TestCoverageGap) | 下游 🔜 | R113 修复后 CI 全绿，R114 的新增测试才能在 CI 中得到验证 |
| R115 (TestSuiteTrim) | 下游 🔜 | R115 的测试精简结果需在绿色 CI 基础上回归 |

---

## 5. 变更范围预估

| 文件 | 操作 | 变更内容 |
|------|------|----------|
| `.github/workflows/ci.yml` | 修改 | lint job 新增 `npm install` 步骤 + `npm run lint` 步骤（~8 行 YAML） |
| `docs/DESIGN.md` | 修改 | TD 表新增 TD004 行（1 行）；可选：新增 D023 设计决策段落说明 ESLint CI 集成决策 |

---

## 6. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| ESLint 在 CI 环境报错阻断流水线 | 低 | `--max-warnings 10000` 已预留极大容忍空间；本地 `npm run lint` 已验证可执行 |
| npm install 增加 CI 耗时 | 低 | 仅安装 eslint + c8 两个 devDeps，缓存机制下增量安装 < 5s |
| TD004 引入后设计文档格式偏移 | 低 | 严格遵循现有表格格式，仅追加一行 |

---

## 7. 背景：失败测试分析

以下两个测试用例来自 `tests/test-eslint-infs.js`（R109 产出），目前因 CI 配置和设计文档的滞后而失败：

### 失败 1：CI lint job 未执行 `npm run lint`（line 221-226）

```
it('lint job 包含 npm run lint 步骤', () => {
  assert.ok(
    ciContent.includes('npm run lint') || ciContent.includes('eslint'),
    'CI lint 步骤应调用 npm run lint 或 eslint'
  );
});
```

**根因**：当前 `ci.yml` 的 `lint` job 仅使用 `node --check` 做语法校验 + manifest.json 字段验证，从未调用 `npm run lint` 或 `eslint` 命令。

**修复**：在 lint job 中新增步骤执行 `npm run lint`。

### 失败 2：DESIGN.md 无 ESLint 相关记录（line 231-242）

```
it('TD 状态表包含 ESLint 相关记录或新增 lint 条目', () => {
  const hasLintMention = designContent.includes('lint') ||
                         designContent.includes('ESLint') ||
                         designContent.includes('eslint') ||
                         designContent.includes('TD004');
  assert.ok(hasLintMention, '设计文档应提及 lint/ESLint 相关内容');
});
```

**根因**：R112 更新 TD 表时仅结算了 TD001–TD003，未为 R109 的 ESLint 基础设施创建对应 TD 记录，DESIGN.md 中全文无 `lint` / `ESLint` / `TD004` 字样。

**修复**：在 TD 表新增 TD004 记录，或在设计决策区域补充 ESLint 相关说明。
