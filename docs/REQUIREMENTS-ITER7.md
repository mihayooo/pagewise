# 需求文档 — ITER7: 15 个测试失败批量修复 (R235)

> 版本: v3.2.0 迭代修复
> 日期: 2026-05-21
> 优先级: P0 — CI 红灯阻断，必须立即修复

---

## 1. 用户故事

**作为** PageWise 项目维护者，
**我希望** `npm run test:ci` 全部 7516+ 用例通过、0 失败，
**以便** CI 流水线恢复绿色，v3.2.0 可以正常发布。

---

## 2. 现状分析

### 2.1 失败总览

| 指标 | 数值 |
|------|------|
| 总用例数 | 7516 |
| 通过 | 7501 |
| 失败 | **15** |
| 执行耗时 | 35.6s |

### 2.2 三类根因分解

| 类别 | 失败数 | 涉及测试文件 | 根因描述 |
|------|--------|-------------|----------|
| **A: 版本号断言过期** | 5 个子断言 | `test-r197-version-sync.js` (3个), `test-r218-changelog-v310.js` (2个) | R231 已将 package.json / manifest.json 版本从 3.1.0 更新至 3.2.0，但测试仍硬编码断言 `'3.1.0'` |
| **B: coverage:gate 阈值断言** | 1 个子断言 | `test-r156-coverage-infra.js:106` | 测试断言 `--lines 50` 但 package.json 中实际值为 `--lines 23` |
| **C: build.sh 权限拒绝** | 9 个子断言 | `test-r208-release-build.js` (9个: AC-5 #1~#9) | `dist/` 目录由 root 创建（UID=0），当前用户执行 `rm` 删除旧 .zip 时 `Permission denied` → build.sh 执行失败 → .zip 未生成 → 后续 8 个产物验证断言全部连锁失败 |

### 2.3 根因 C 详细分析

```
dist/ 目录权限:
  Owner: root:root (UID=0, GID=0)
  Mode:  drwxr-xr-x (755)
  
build.sh 执行流程:
  1. rm -rf dist/ ← ❌ Permission denied (当前用户非 root)
  2. mkdir dist/
  3. zip → dist/pagewise-v3.2.0-chrome.zip ← 未执行到此步骤
  
连锁失败:
  #1 build.sh 执行成功 → FAIL
  #2 生成 .zip 产物文件 → FAIL (文件不存在)
  #3 .zip 产物体积 ≤ 10MB → FAIL (ENOENT)
  #4 .zip 内包含 manifest.json → FAIL (unzip 找不到文件)
  #5 .zip 内包含核心目录 → FAIL
  #6 .zip 内不包含排除目录 → FAIL
  #7 .zip 内不包含开发配置文件 → FAIL
  #8 .zip 内不包含旧版 locales/ → FAIL
  #9 .zip 内不包含多浏览器 manifest → FAIL
```

---

## 3. 验收标准

### AC-1: 版本号断言同步至 3.2.0 ✅ 必须

将以下测试文件中的硬编码版本号 `'3.1.0'` 全部更新为 `'3.2.0'`：

| 文件 | 行号 | 当前断言 | 目标断言 |
|------|------|---------|---------|
| `test-r197-version-sync.js` | 30 | `'3.1.0'` | `'3.2.0'` |
| `test-r197-version-sync.js` | 110 | `'3.1.0'` | `'3.2.0'` |
| `test-r197-version-sync.js` | 172-174 | `'3.1.0'` | `'3.2.0'` |
| `test-r218-changelog-v310.js` | 77-79 | `'3.1.0'` | `'3.2.0'` |
| `test-r218-changelog-v310.js` | 82-84 | `'3.1.0'` | `'3.2.0'` |

> **注意**: `test-r208-release-build.js:225-227` 中也有 `3.1.0` 断言，但属于 RELEASE-NOTES 内容验证（非版本号断言），需评估是否更新。

### AC-2: coverage:gate 阈值断言对齐 ✅ 必须

| 文件 | 行号 | 当前断言 | package.json 实际值 | 目标断言 |
|------|------|---------|-------------------|---------|
| `test-r156-coverage-infra.js` | 106-108 | `--lines 50` | `--lines 23` | `--lines 23` |

### AC-3: build.sh 权限问题修复 ✅ 必须

修复 `dist/` 目录 root 所有权导致 build.sh 执行失败的问题。可选方案：

1. **方案 A（推荐）**: 在 `scripts/build.sh` 开头添加 `rm -rf dist/` 之前，先 `chmod` 或 `sudo chown` 确保目录可写
2. **方案 B**: 在测试 `test-r208-release-build.js` 的 before hook 中，执行 build.sh 前先清理 root 拥有的 dist 目录
3. **方案 C**: 修改 build.sh 使用 `rm -rf dist/ 2>/dev/null; mkdir -p dist/` 容错处理

### AC-4: 全量回归零失败 ✅ 必须

```
npm run test:ci
# tests 7516+
# pass 7516+
# fail 0
```

### AC-5: Lint 零告警（回归验证）✅ 必须

```
npm run lint
# 0 errors, 0 warnings
```

---

## 4. 技术约束

1. **不修改业务代码**: 本次修复仅涉及测试断言和构建脚本，不修改 `lib/`、`popup/`、`options/`、`sidebar/` 中的任何业务逻辑
2. **向后兼容**: 测试修改不得降低断言严格度（如删除断言），只能更新期望值以匹配当前实际值
3. **build.sh 修复必须可复现**: 解决权限问题后，连续执行两次 `bash scripts/build.sh` 均应成功
4. **不引入新依赖**: 权限修复使用标准 shell 命令（chmod/chown/rm），不引入新 npm 包

---

## 5. 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| R231 (v3.2.0 版本更新) | 前置已完成 | package.json / manifest.json 已更新为 3.2.0 |
| R233 (coverage:gate 硬化) | 前置已完成 | `coverage:gate --lines 23 --branches 75 --functions 48` 已设置 |
| R208 (build.sh 构建脚本) | 前置已完成 | build.sh 脚本已存在，仅权限问题阻断执行 |
| R236 (覆盖率冲刺 35%) | 后续依赖 | 本需求修复 CI 红灯后，R236 可开始覆盖率提升 |
| R239 (CWS 最终就绪) | 后续依赖 | build.sh 修复后，R239 可验证发布产物 |

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 版本号断言更新不完整（遗漏其他文件） | 中 | 低 | 使用 `grep -rn '3\.1\.0' tests/` 全量扫描 |
| build.sh 权限修复在 CI 环境中不适用 | 低 | 高 | CI 环境通常为当前用户运行，只需本地修复 |
| coverage:gate 阈值断言修改后覆盖率门禁变松 | 低 | 低 | 当前门禁 23% 已是实际基线，R236 将提升至 35% |

---

## 7. 测试矩阵

| 修复项 | 修改的测试文件 | 预期通过数变化 |
|--------|--------------|-------------|
| A: 版本号断言 | test-r197-version-sync.js, test-r218-changelog-v310.js | +5 |
| B: 覆盖率断言 | test-r156-coverage-infra.js | +1 |
| C: build.sh 权限 | test-r208-release-build.js (build.sh 本身) | +9 |
| **合计** | **4 个文件** | **+15 (7501 → 7516)** |
