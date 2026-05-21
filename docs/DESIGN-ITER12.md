# 设计文档 — R240: 版本同步断言修复 VersionSyncFix

> 日期: 2026-05-21
> 状态: 待实现
> 复杂度: Simple
> 需求来源: docs/REQUIREMENTS-ITER12.md

---

## 一、问题分析

### 根因链

```
R231 将 package.json / manifest.json 版本从 3.1.0 → 3.2.0
    ↓
R235 修复了 test-r197-version-sync.js AC-1 的断言（第 28-30 行）
    ↓
R235 遗漏了 AC-3（第 108-110 行）和 AC-5（第 172-174 行）
    ↓
npm run test:ci → 7549 pass / 2 fail（全部在 test-r197-version-sync.js）
```

### 失败用例定位

| 用例 | 文件位置 | 断言 | 实际值 | 修复方案 |
|------|----------|------|--------|----------|
| AC-3: manifest.json version | 第 108-110 行 | `assert.equal(manifest.version, '3.1.0')` | `'3.2.0'` | `'3.1.0'` → `'3.2.0'` |
| AC-5: version consistency | 第 172-173 行 | `pkg.version === '3.1.0'` 且 `manifest.version === '3.1.0'` | 两者均为 `'3.2.0'` | 两处 `'3.1.0'` → `'3.2.0'` |

---

## 二、变更范围

### 需要修改的文件

| # | 文件 | 变更类型 | 变更行数 | 说明 |
|---|------|----------|----------|------|
| 1 | `tests/test-r197-version-sync.js` | 修改断言 | ~4 行 | AC-3 + AC-5 版本断言从 `3.1.0` → `3.2.0` |

### 不需要修改的文件（全量扫描结果）

对 `tests/` 目录执行 `grep -rn "3\.1\.0" tests/` 扫描结果及审查结论：

| 文件 | 引用内容 | 审查结论 | 原因 |
|------|----------|----------|------|
| `test-r218-changelog-v310.js` | AC-1 中 ~15 处 `[3.1.0]` 引用 | **保留不改** | 验证 CHANGELOG `[3.1.0]` 历史区段的存在性和完整性，是历史验证断言 |
| `test-r218-changelog-v310.js` | AC-2 中 2 处 `'3.2.0'` 断言 | **已是正确值** | R235 已更新，断言 `pkg.version === '3.2.0'` |
| `test-r208-release-build.js` | 第 225-227 行 `content.includes('3.1.0')` | **保留不改** | 验证 `RELEASE-NOTES-v3.1.md` 文件包含 `3.1.0`，是 v3.1 发布说明的历史内容验证 |
| `test-r197-version-sync.js` AC-2 | ~10 处 `[3.1.0]` 引用（第 47-104 行） | **保留不改** | 验证 CHANGELOG.md 包含 `[3.1.0]` 历史区段 |
| `test-r197-version-sync.js` AC-4 | 第 159 行 `content.includes('3.1.0')` | **保留不改** | 迭代报告中包含 `3.1.0` 字样是合理的历史引用 |

### 无需修改的产物文件（版本号已是正确值）

| 文件 | 当前版本 | 状态 |
|------|----------|------|
| `package.json` | `"version": "3.2.0"` | ✅ 正确 |
| `manifest.json` | `"version": "3.2.0"` | ✅ 正确 |
| `docs/CHANGELOG.md` | 包含 `[3.2.0]` 和 `[3.1.0]` 区段 | ✅ 正确 |

---

## 三、详细变更设计

### 变更 1: AC-3 断言更新（第 107-111 行）

**位置**: `tests/test-r197-version-sync.js` 第 108-110 行

**当前代码**:
```javascript
it('manifest.json version should be "3.1.0"', () => {
  const manifest = readJson('manifest.json');
  assert.equal(manifest.version, '3.1.0');
});
```

**修改为**:
```javascript
it('manifest.json version should be "3.2.0"', () => {
  const manifest = readJson('manifest.json');
  assert.equal(manifest.version, '3.2.0');
});
```

**变更点**:
1. 第 108 行：`it()` 描述字符串中 `"3.1.0"` → `"3.2.0"`
2. 第 110 行：`assert.equal()` 第二参数 `'3.1.0'` → `'3.2.0'`

### 变更 2: AC-5 断言更新（第 166-175 行）

**位置**: `tests/test-r197-version-sync.js` 第 172-173 行

**当前代码**:
```javascript
assert.equal(pkg.version, '3.1.0');
assert.equal(manifest.version, '3.1.0');
```

**修改为**:
```javascript
assert.equal(pkg.version, '3.2.0');
assert.equal(manifest.version, '3.2.0');
```

**变更点**:
1. 第 172 行：`assert.equal(pkg.version, '3.1.0')` → `'3.2.0'`
2. 第 173 行：`assert.equal(manifest.version, '3.1.0')` → `'3.2.0'`
3. 第 174 行：`changelog.includes('[3.1.0]')` **保留不改** — CHANGELOG.md 确实包含 `[3.1.0]` 历史区段，此断言验证历史完整性

### 变更 3: AC-1 注释更新（第 26 行）

**位置**: `tests/test-r197-version-sync.js` 第 26 行

**当前注释**:
```javascript
// ── AC-1: package.json 版本号更新为 3.1.0 ──
```

**修改为**:
```javascript
// ── AC-1: package.json 版本号更新为 3.2.0 ──
```

**理由**: 注释中的 `3.1.0` 与实际断言值 `3.2.0`（第 29 行已由 R235 更新）不一致，属于文档陈旧。本次一并修正。

---

## 四、接口设计

本次无新增函数/类/接口。变更仅涉及测试文件中的字面量断言值。

---

## 五、设计决策

### D1: 仅修改 1 个文件，不引入版本常量抽取

**决策**: 直接将断言字面量从 `'3.1.0'` 改为 `'3.2.0'`，不抽取 `const EXPECTED_VERSION = '3.2.0'` 共享常量。

**原因**:
1. 最小变更原则 — 需求文档 TC-1 要求"仅修改测试断言"
2. `test-r197-version-sync.js` 本身设计目的就是验证版本号一致性，动态读取 `package.json` 的 version 字段再比对才是"真实验证"；如果抽取常量，断言就变成了"常量 === 常量"的空验证
3. 已有的第 123-127 行用例 `pkg.version === manifest.version` 实现了跨文件一致性验证，无需再加一层

### D2: 保留 AC-2 中所有 `[3.1.0]` 断言不改

**决策**: `test-r197-version-sync.js` AC-2 的 8 个用例（第 47-104 行）中所有 `[3.1.0]` 引用保持原样。

**原因**:
1. AC-2 的设计目的是验证 CHANGELOG.md 中 `[3.1.0]` 区段的历史完整性
2. CHANGELOG.md 确实包含 `[3.1.0]` 区段（v3.1.0 发布记录），断言验证的是"历史存在"而非"当前版本"
3. 需求文档 TC-2 明确要求保留此类断言

### D3: 保留 test-r218 和 test-r208 中的 3.1.0 引用不改

**决策**: 不修改 `test-r218-changelog-v310.js` 和 `test-r208-release-build.js`。

**原因**:
1. `test-r218-changelog-v310.js` AC-1 验证 CHANGELOG `[3.1.0]` 区段的存在性、内容充实度、版本降序排列 — 全部是历史验证
2. `test-r218-changelog-v310.js` AC-2 的版本断言已在 R235 中更新为 `3.2.0`（第 79、84 行）
3. `test-r208-release-build.js` 第 225-227 行验证 `RELEASE-NOTES-v3.1.md` 包含 `3.1.0` — 验证的是 v3.1 发布说明文档内容

### D4: 不修改第 159 行的 `'3.1.0'` 引用

**决策**: 保留 `test-r197-version-sync.js` 第 159 行 `content.includes('3.1.0')` 不变。

**原因**: AC-4 验证迭代报告文件中是否提及版本同步相关内容，报告中提到 `3.1.0` 是合理的历史引用（R197 原始交付物描述）。该文件 `docs/reports/2026-05-20-R39.md` 是历史快照，不应被修改，因此断言也不应修改。

---

## 六、验证方案

### 验证步骤

1. **单元验证**: 修改后单独运行 `tests/test-r197-version-sync.js`
   ```bash
   node --test tests/test-r197-version-sync.js
   ```
   预期: 26 个用例全部通过（AC-1 到 AC-5）

2. **全量 CI 验证**: 
   ```bash
   npm run test:ci
   ```
   预期: ≥7551 pass / 0 fail

3. **回归扫描**:
   ```bash
   grep -rn "assert.*['\"]3\.1\.0['\"]" tests/test-r197-version-sync.js
   ```
   预期: 仅第 174 行 `changelog.includes('[3.1.0]')` — 验证 CHANGELOG 历史完整性，合理保留

### 成功指标

| 指标 | 目标值 |
|------|--------|
| `npm run test:ci` | ≥7551 pass / 0 fail |
| 修改文件数 | 1 个（`test-r197-version-sync.js`） |
| 修改行数 | ~4 行（含注释） |
| 硬编码 `assert.*('3.1.0')` 残留 | 0 处（指向 package.json/manifest.json 的） |

---

## 七、变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-21 | 初始化设计文档 |
