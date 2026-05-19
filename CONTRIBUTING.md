# 贡献指南 — 智阅 PageWise

> 感谢你对 PageWise 项目的关注！本文档将帮助你快速搭建开发环境、了解项目规范并提交高质量的代码。

---

## 开发环境搭建

### 前置条件 (Prerequisites)

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 18.x | 运行测试和 lint |
| npm | ≥ 9.x | 随 Node.js 安装 |
| Chrome | ≥ 114 | 加载开发版扩展 |
| Git | ≥ 2.x | 版本控制 |

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/whalemalus/pagewise.git
cd pagewise

# 2. 安装开发依赖（仅 ESLint + c8，极少量依赖）
npm install

# 3. 运行测试确认环境正常
npm test

# 4. 运行 lint 检查
npm run lint
```

### 加载扩展到 Chrome

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择项目根目录
4. 扩展加载成功后，点击浏览器工具栏的 PageWise 图标即可使用
5. 修改代码后，在扩展管理页面点击扩展卡片上的 **刷新** 按钮

### 调试技巧

- **侧边栏调试**：右键侧边栏 → 检查（DevTools）
- **Service Worker 调试**：`chrome://extensions/` → 点击 "Service Worker" 链接
- **Content Script 调试**：页面 DevTools → Sources → Content scripts
- **Popup 调试**：右键扩展图标 → 检查弹出式窗口

```bash
# 开发时频繁运行单个测试文件
node --test tests/test-utils.js

# 只运行测试（排除 E2E）
npm test

# 运行全部测试（含 E2E）
npm run test:all

# 生成覆盖率报告
npm run test:coverage

# 查看 ESLint 报告
npm run lint
```

---

## 分支策略

项目采用 **主干开发** 模式：

```
master (主分支)
  │
  ├── feat/xxx    — 新功能开发
  ├── fix/xxx     — Bug 修复
  ├── docs/xxx    — 文档更新
  ├── refactor/xxx — 代码重构
  └── test/xxx    — 测试相关
```

### 分支命名规范

- `feat/R{NNN}-{简述}` — 如 `feat/R122-dev-documentation`
- `fix/{issue-id}-{简述}` — 如 `fix/42-sidebar-crash`
- `docs/{简述}` — 如 `docs/api-reference`

### 提交规范 (Conventional Commits)

```
<type>(<scope>): <subject>

[body]

[footer]
```

**Type 类型：**

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add review session management` |
| `fix` | Bug 修复 | `fix: sidebar crash on empty bookmarks` |
| `docs` | 文档变更 | `docs: add CONTRIBUTING guide` |
| `refactor` | 重构（不改功能） | `refactor: split knowledge-base.js` |
| `test` | 测试相关 | `test: add bookmark-graph unit tests` |
| `chore` | 构建/工具变更 | `chore: update eslint config` |
| `style` | 代码格式 | `style: fix indentation` |

**飞轮迭代格式：**
```
feat: **R{NNN}: {中文名} {EnglishName}** — {描述}。复杂度: {Simple/Medium/Complex} - 飞轮迭代 R{N}
```

---

## PR 流程

### 提交 PR 前的检查清单

- [ ] 所有测试通过：`npm test`
- [ ] Lint 零错误：`npm run lint`
- [ ] 新增功能有对应测试
- [ ] 更新 `docs/IMPLEMENTATION.md` 记录实现内容
- [ ] 更新 `docs/CHANGELOG.md` 记录变更
- [ ] 更新 `docs/TODO.md` 标记完成（如适用）

### PR 描述模板

```markdown
## 变更说明
简要描述本次变更的内容和动机。

## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 文档更新 (docs)
- [ ] 重构 (refactor)
- [ ] 测试 (test)

## 测试
- 新增测试数量: N
- 全量回归结果: X pass / 0 fail

## 关联 Issue
Closes #xxx
```

---

## 测试规范

### 测试框架

项目使用 **Node.js 内置 test runner** (`node:test`)，零外部依赖。

### 测试文件规范

- 文件命名：`tests/test-{模块名}.js`
- 每个 lib/ 模块应有对应的测试文件
- 使用 `describe` / `it` 组织测试套件

### 编写测试

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

describe('MyModule', () => {
  describe('核心功能', () => {
    it('should do something', () => {
      const result = myFunction(input);
      assert.strictEqual(result, expected);
    });

    it('should handle edge case', () => {
      assert.throws(() => myFunction(null), /invalid/);
    });
  });
});
```

### 测试分类

| 类型 | 命名模式 | 运行方式 | 说明 |
|------|---------|---------|------|
| 单元测试 | `test-*.js` | `npm test` | 测试单个模块 |
| E2E 测试 | `test-e2e-*.js` 或 `tests/e2e/*.js` | `npm run test:all` | 需要浏览器环境 |
| CI 测试 | 排除 E2E | `npm run test:ci` | CI 专用 |
| 覆盖率 | 全部单元测试 | `npm run test:coverage` | V8 覆盖率 |

### Mock 策略

- **Chrome API**：`tests/helpers/chrome-mock.js`
- **IndexedDB**：`tests/helpers/indexeddb-mock.js`
- **外部依赖**：通过依赖注入模拟

### 测试覆盖率

```bash
# 生成覆盖率报告
npm run test:coverage

# 输出位置
#   coverage/lcov.info  — CI 集成格式
#   终端 text-summary   — 快速查看
```

当前覆盖率基线：Statements ≥ 92% / Lines ≥ 92%

---

## 代码规范

### 通用规范

- **语言**：ES Module (`import` / `export`)，禁止 `require()`
- **变量**：`const` / `let` 优先，禁止 `var`
- **命名**：
  - 变量/函数：`camelCase`
  - 类：`PascalCase`
  - 常量：`UPPER_SNAKE_CASE`
- **注释**：关键函数必须有 JSDoc 注释
- **零外部依赖**：不引入 npm 运行时依赖，保持轻量

### ESLint

```bash
# 检查全部文件
npm run lint

# 检查单个文件
npx eslint lib/utils.js
```

主要规则：
- `no-unused-vars` — 禁止未使用变量
- `no-undef` — 禁止未声明变量
- `eqeqeq` — 要求严格相等 (`===` / `!==`)
- `no-implicit-globals` — 禁止隐式全局变量

### 文件结构约定

```
pagewise/
├── lib/                    # 核心库模块（纯 JS，无 DOM 依赖）
│   ├── ai-client.js        # AI API 客户端
│   ├── knowledge-base.js   # 知识库（入口）
│   ├── knowledge-base-*.js # 知识库子模块
│   └── ...
├── sidebar/                # 侧边栏 UI
├── background/             # Service Worker
├── content/                # Content Script
├── popup/                  # 弹窗
├── options/                # 设置页
├── tests/                  # 测试套件
│   ├── helpers/            # Mock 工具
│   ├── e2e/                # E2E 测试
│   └── test-*.js           # 单元测试
├── docs/                   # 项目文档
├── scripts/                # 构建脚本
└── _locales/               # 国际化
```

---

## npm Scripts 参考

| 命令 | 说明 |
|------|------|
| `npm test` | 运行单元测试（排除 E2E） |
| `npm run test:ci` | CI 专用测试命令 |
| `npm run test:all` | 运行全部测试（含 E2E） |
| `npm run test:coverage` | 生成覆盖率报告 |
| `npm run lint` | ESLint 静态检查 |

---

## 文档更新

重大变更需要更新以下文档：

1. **`docs/IMPLEMENTATION.md`** — 实现细节记录
2. **`docs/CHANGELOG.md`** — 用户可见变更
3. **`docs/TODO.md`** — 迭代计划进度
4. **`docs/DESIGN.md`** — 设计决策（如有）

---

## 问题反馈

- 通过 [GitHub Issues](https://github.com/whalemalus/pagewise/issues) 提交 Bug 报告或功能建议
- 使用 Issue 模板描述问题
- 附上复现步骤和环境信息

---

## 许可证

本项目采用 [MIT License](LICENSE)。提交代码即表示你同意将代码以 MIT 许可发布。
