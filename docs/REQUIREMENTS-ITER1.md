# 需求文档 R103: 测试基础设施修复 (TestInfrastructureFix)

> 作者: Plan Agent · 2026-05-19
> 迭代: Phase G — 质量巩固 (R103-R107)
> 复杂度: Simple

---

## 1. 背景与问题陈述

PageWise 项目经过 R1-R102 共 102 轮迭代，累积了 **193 个测试文件、~5900 条用例**。
但当前 `package.json` 中 **缺少 `"test"` script**，团队与 CI 无法通过标准 `npm test` 命令执行测试。
直接运行 `node --test` 时，Node.js 22 的默认发现行为虽可遍历 `tests/` 目录，但在部分 CI 环境下
由于工作目录或 glob 展开差异，可能导致 0 pass / 0 fail 的"空跑"假象——测试未被真正执行，
质量门禁形同虚设。

---

## 2. 用户故事

> **作为** 开发者 / CI 系统，
> **我需要** 在 `package.json` 中有一个确定的 `"test"` script，
> **以便** 每次 `npm test`（或 CI 触发）都能可靠地执行全量测试并得到准确的通过/失败报告。

---

## 3. 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| AC-1 | `package.json` 包含 `"test"` script，命令为 `node --test 'tests/*.js'`（或同等明确 glob），**不含** 依赖工具（如 jest / mocha），保持纯 Node.js 内置测试运行器 | 检查 package.json |
| AC-2 | 在项目根目录执行 `npm test`，测试运行器能发现并执行 `tests/` 下全部 193 个测试文件，输出 `# pass ≥ 5857`、`# fail 0`、退出码 `0` | 终端运行 |
| AC-3 | 测试报告包含 **pass / fail / skipped / duration** 四项摘要统计，可直接在终端阅读 | 终端输出 |
| AC-4 | 相同命令在 **GitHub Actions CI**（或等效 CI）中执行结果一致：绿色通过、无 flaky fail | CI 日志 |
| AC-5 | 不存在隐藏的测试未执行——对比 `node --test 'tests/*.js'` 与手动 `node --test tests/test-*.js` 的 pass 数差异 ≤ 1%（允许因 glob 匹配范围差异导致的边际变化） | 比对输出 |

---

## 4. 技术约束

| 约束 | 说明 |
|------|------|
| **运行时** | Node.js ≥ 22（`node:test` 内置模块，无需第三方测试框架） |
| **模块系统** | ESM (`"type": "module"`) |
| **零新依赖** | 不引入 jest / mocha / ava 等；保持纯 `node --test` |
| **测试文件位置** | `tests/*.js`（一级目录），不涉及 `tests/e2e/`、`tests/integration/`、`tests/helpers/` 子目录中的辅助文件 |
| **向后兼容** | 修改仅限 `package.json` 的 `scripts` 字段，不改任何测试文件或源码 |
| **CI 无阻断** | 如 CI 中存在并行 / 分片策略，`"test"` script 应作为默认全量入口兼容 |

---

## 5. 依赖关系

```
前置（无阻断）
  └── R92: BookmarkGraph v3.0.0 正式发布  ✅ 已完成
       └── R102: BookmarkReleaseFinal      ✅ 已完成

后续（本 R 完成后解锁）
  ├── R104: AI 客户端错误处理增强    ← 需要 CI 绿色才能推进
  ├── R105: 知识库索引优化           ← 需要可靠测试基础设施
  ├── R106: 核心流程端到端审计       ← 依赖全量回归结果
  └── R107: 代码健康度仪表盘         ← 需要 CI 集成
```

---

## 6. 实施范围（不含代码）

本次变更 **仅修改一个文件**：`package.json`

### 6.1 变更内容

```json
+ "scripts": {
+   "test": "node --test 'tests/*.js'"
+ }
```

### 6.2 验证清单

1. `npm test` → `# pass ≥ 5857`, `# fail 0`
2. `echo $?` → `0`
3. 确认无测试文件遗漏（`ls tests/*.js | wc -l` ≈ 193）
4. CI 流水线截图 / 日志确认绿色

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Glob `'tests/*.js'` 在 CI shell 中被错误转义 | 低 | 测试不执行 | 转义策略验证：双引号内嵌单引号 或 `tests/` 前缀 |
| 子目录测试文件未被包含 | 低 | 部分用例漏跑 | AC-5 差异对比 |
| Node 版本不一致 | 中 | 旧版不支持 `node:test` | 锁定 Node ≥ 22，engines 字段 |

---

## 8. 成功指标

- **首要**: `npm test` → 0 fail, ≥ 5857 pass, 退出码 0
- **次要**: CI 流水线首次运行即绿色，无需重跑
- **长期**: R104-R107 后续迭代均基于 `npm test` 驱动，测试覆盖率只增不减

---

*本文档为纯需求文档，不包含实现代码。*
