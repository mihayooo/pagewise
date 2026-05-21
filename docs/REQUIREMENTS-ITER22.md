# 需求文档 — 飞轮迭代 R22

> 日期: 2026-05-21
> 迭代: R250
> 作者: Plan Agent
> 任务: **R250: settings-manager.js 模块拆分 SettingsManagerSplit**

---

## R250: settings-manager.js 模块拆分 SettingsManagerSplit

### 1. 用户故事

作为 **PageWise 扩展的开发者**，我希望将 R248 新建的 `settings-manager.js`（575 行）按职责拆分为多个 ≤400 行的小模块，使代码符合历经 12 期迭代（R116-R226）建立的模块尺寸约束，同时保持所有公开 API 签名不变，确保下游消费者零感知。

---

### 2. 现状分析

#### 2.1 违规现状

| 文件 | 行数 | 限制 | 差距 | 状态 |
|------|------|------|------|------|
| `lib/settings-manager.js` | **575** | ≤ 400 | +175 | ❌ 违规 |
| `lib/page-sense.js`（次大） | 400 | ≤ 400 | 0 | ✅ 刚好合规 |

`settings-manager.js` 是当前 `lib/` 目录中**唯一**超过 400 行限制的文件。

#### 2.2 当前模块结构（575 行内部分区）

| 区域 | 行范围 | 行数（约） | 职责 | 拆分目标 |
|------|--------|-----------|------|---------|
| 常量 + 类型定义 | 23-49 | ~27 | `STORAGE_KEY`、`SETTING_TYPES`、`SETTING_CATEGORIES`、`SENSITIVE_KEYS` | `settings-registry.js` |
| 内置设置定义 `BUILTIN_SETTINGS` | 53-273 | ~220 | 15+ 内置设置项声明（含 validator、options、default） | `settings-registry.js` |
| 工厂函数：内部方法 | 275-361 | ~87 | `_load`/`_save`/`_enqueue`/`_getDefaults`/`_validate`/`_emit` | 按职责分配到 storage/events/registry |
| 工厂函数：API | 364-559 | ~195 | `get`/`set`/`getAll`/`getSchema`/`getSchemaByCategory`/`onSettingChange`/`exportSettings`/`importSettings`/`resetToDefaults`/`registerSetting`/`getRegisteredKeys` | 各模块内部实现，manager re-export |
| JSDoc `@typedef` | 562-575 | ~14 | `SettingsManagerAPI` 类型定义 | `settings-manager.js`（编排层） |

#### 2.3 下游消费情况

- `lib/` 内部：**无其他模块** import `settings-manager.js`（R248 新建，尚未被广泛引用）
- `tests/test-settings-manager.js`：**114 条断言**，import 路径 `../lib/settings-manager.js`
- `options/` 页面：暂未发现直接 import（通过 `createSettingsManager` 工厂注入）

---

### 3. 验收标准

| # | 验收条件 | 验证方式 | 优先级 |
|---|---------|---------|--------|
| **AC-1** | 新模块 `lib/settings-registry.js` 行数 **≤ 200**，`lib/settings-storage.js` 行数 **≤ 150**，`lib/settings-events.js` 行数 **≤ 80** | `wc -l lib/settings-*.js` | P0 |
| **AC-2** | `lib/settings-manager.js` 行数 **≤ 150**（薄编排层 + re-export） | `wc -l lib/settings-manager.js` | P0 |
| **AC-3** | `lib/` 目录下**所有**文件 ≤ 400 行（Module Size Guard 无违规） | CI 中的 Module Size Guard 检查 pass | P0 |
| **AC-4** | `npm run test:ci` 输出 **0 fail**，R248 的 37 个测试用例**全部通过**，pass 数量不减少 | 命令行运行，exit code 0 | P0 |
| **AC-5** | 所有公开 API 签名**完全不变**：`createSettingsManager(storage)` 返回的对象包含 `get`/`set`/`getAll`/`getSchema`/`getSchemaByCategory`/`onSettingChange`/`exportSettings`/`importSettings`/`resetToDefaults`/`registerSetting`/`getRegisteredKeys` — 参数类型、返回值类型、行为语义均不变 | 现有测试全部通过 + 手动 API diff 审查 | P0 |
| **AC-6** | `npm run lint` 输出 **0 errors, 0 warnings** | 命令行运行，exit code 0 | P0 |
| **AC-7** | `npm run coverage:gate` 三项门禁通过（lines ≥28% / functions ≥50% / branches ≥75%），拆分不得导致覆盖率下降 | 命令行运行 | P1 |

---

### 4. 技术约束

| 约束 | 说明 |
|------|------|
| **≤ 400 行硬限** | 每个 `lib/` 模块 ≤ 400 行（含注释和空行），这是 R116-R226 共 12 期迭代确立的架构约束 |
| **纯 ES Module** | 新拆分模块保持 `export` / `import` 语法，不引入 CommonJS |
| **零外部依赖** | `settings-registry.js`、`settings-storage.js`、`settings-events.js` 仅依赖 Node.js 原生 API，不引入第三方包 |
| **依赖注入** | `storage` 接口继续通过工厂参数注入，不直接引用 `chrome.storage` |
| **内部模块不对外暴露** | `settings-storage.js` 和 `settings-events.js` 由 `settings-manager.js` 内部 import，外部消费者只通过 `settings-manager.js` 的 `createSettingsManager()` 入口使用 |
| **常量统一出口** | `SETTING_TYPES` 和 `SETTING_CATEGORIES` 从 `settings-registry.js` 定义、`settings-manager.js` re-export，确保 `import { SETTING_TYPES } from '../lib/settings-manager.js'` 继续可用 |
| **测试 import 路径不变** | 测试文件仍然 `import('../lib/settings-manager.js')`，无需修改 import 路径 |
| **JSDoc 完整** | 每个新模块头部保留功能说明 + 设计约束注释 |

---

### 5. 拆分方案

#### 5.1 模块职责划分

```
settings-registry.js    ← 设置注册/校验/分类/内置定义（~180 行）
  ├─ SETTING_TYPES, SETTING_CATEGORIES, SENSITIVE_KEYS, SUPPORTED_LOCALES
  ├─ BUILTIN_SETTINGS[]
  ├─ createRegistry() → { register(), get(), getAll(), validate(), getDefaults() }
  └─ 内置定义自动注册

settings-storage.js     ← 存储读写/导入导出/重置/并发安全（~130 行）
  ├─ STORAGE_KEY
  ├─ createStorageAdapter(storage, registry, emit) → { load(), save(), enqueue(), exportSettings(), importSettings(), resetToDefaults() }
  └─ 串行化写队列 (_writeQueue)

settings-events.js      ← 变更事件/订阅/取消订阅（~50 行）
  ├─ createEventBus() → { emit(), on(), off() }
  └─ Map<string, Set<Function>> 监听器管理

settings-manager.js     ← 薄编排层（~130 行）
  ├─ re-export: SETTING_TYPES, SETTING_CATEGORIES, createSettingsManager
  ├─ createSettingsManager(storage) 内部组合 registry + storage + events
  ├─ getSchema() / getSchemaByCategory()
  └─ SettingsManagerAPI @typedef
```

#### 5.2 依赖关系图

```
settings-manager.js (编排层, 入口)
  ├── import settings-registry.js  (注册/校验/定义)
  ├── import settings-storage.js   (持久化/IO)
  └── import settings-events.js    (事件总线)
```

三叶子模块之间**无交叉依赖**，仅通过编排层 `settings-manager.js` 组合。

---

### 6. 依赖关系

| 依赖 | 方向 | 说明 |
|------|------|------|
| **R248** UnifiedSettingsPanel | **前置（必须已完成）** | 提供原始 `settings-manager.js` 代码 + 37 个测试用例，本任务在此基础上拆分 |
| **R116-R226** 模块拆分系列 | **架构约束来源** | 建立了 ≤400 行的 Module Size Guard 规则和 CI 门禁 |
| **R243** CoverageGateAlign | **间接依赖** | 覆盖率门禁阈值定义（lines ≥28% / functions ≥50% / branches ≥75%），拆分不得导致覆盖率下降 |
| **Module Size Guard** CI 检查 | **已存在** | CI 中自动校验 `lib/` 下所有文件 ≤ 400 行，本任务拆分后需通过此检查 |
| `tests/test-settings-manager.js` | **需验证** | R248 的 37 个测试用例必须原样通过（或仅修改 import 路径），验证拆分后行为不变 |

---

### 7. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 拆分后闭包状态共享出错 | 中 | AC-5 行为不一致 | `_registry`/`_listeners`/`_cache`/`_writeQueue` 的生命周期由编排层 `createSettingsManager()` 统一管理，通过参数注入子模块，不使用模块级全局变量 |
| 测试 import 路径断裂 | 低 | AC-4 测试失败 | 保持 `settings-manager.js` re-export 所有公开符号，测试文件无需修改 import |
| 覆盖率下降（新增模块行数未被测试覆盖） | 低 | AC-7 门禁失败 | 新模块仅为拆分重组，不新增逻辑分支；现有 37 个测试已覆盖全部 API |
| `BUILTIN_SETTINGS` 拆入 registry 后循环引用 | 低 | 运行时错误 | 确保 `settings-events.js` 不 import `settings-registry.js`，三叶子模块之间无交叉依赖 |

---

### 8. 成功指标

| 指标 | 目标值 | 验证命令 |
|------|--------|---------|
| `settings-registry.js` 行数 | **≤ 200** | `wc -l lib/settings-registry.js` |
| `settings-storage.js` 行数 | **≤ 150** | `wc -l lib/settings-storage.js` |
| `settings-events.js` 行数 | **≤ 80** | `wc -l lib/settings-events.js` |
| `settings-manager.js` 行数 | **≤ 150** | `wc -l lib/settings-manager.js` |
| lib/ 最大文件行数 | **≤ 400** | `wc -l lib/*.js \| sort -rn \| head -5` |
| 测试通过数 | **≥ 现有值**（不减少） | `npm run test:ci 2>&1 \| grep "# pass"` |
| 测试失败数 | **0** | `npm run test:ci 2>&1 \| grep "# fail"` |
| Lint 结果 | **0 errors / 0 warnings** | `npm run lint` |
| 覆盖率门禁 | **三项通过** | `npm run coverage:gate` |

---

### 变更记录

| 日期 | 变更 |
|------|------|
| 2026-05-21 | 初始版本，基于 R248 完成后的 settings-manager.js 575 行违规拆分需求 |
