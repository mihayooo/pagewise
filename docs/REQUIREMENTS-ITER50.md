# R208: Chrome Web Store 发布产物构建 — ReleaseBuildPipeline

> 生成日期: 2026-05-20  
> 迭代轮次: R50 (飞轮迭代)  
> 复杂度: Medium

---

## 背景

PageWise v3.1.0 已经历 200+ 轮飞轮迭代，功能完备（AI 问答、知识库、书签图谱、多页面分析等），测试覆盖 70+ 文件。但当前缺少**标准化、可重复的发布流水线**，阻碍 Chrome Web Store 上架。

**现状审计发现：**

| 维度 | 现状 | 问题 |
|------|------|------|
| `scripts/build.sh` | ✅ 多浏览器打包可用 | 产出物仅用于本地开发调试，不含发布级校验 |
| `scripts/package.sh` | ✅ Chrome Web Store 专用打包 | 存在但缺少 `_locales` 完整性校验、版本一致性检查、权限最小化审计 |
| `publish-check.sh` | ❌ 不存在 | 发布前自检无标准化脚本，依赖人工检查 |
| 截图指引 | ❌ 不存在 | Chrome Web Store 要求 1280×800 / 640×400 截图，无脚本辅助 |
| `RELEASE-NOTES-v3.1.md` | ❌ 不存在 | v3.0.0 的 release notes 存在，v3.1.0 缺失 |
| `locales/` vs `_locales/` | ⚠️ 两套并存 | `locales/` 是旧版自定义格式 (v2.4.0)；`_locales/` 是 Chrome 标准 i18n。打包时需明确只含 `_locales/` |
| 版本号同步 | ⚠️ 手动维护 | `manifest.json` 与 `package.json` 均为 `3.1.0`，但无自动化校验机制 |

---

## 用户故事

1. **作为开发者**，我希望运行一条命令即可生成可直接上传 Chrome Web Store 的 .zip 产物，省去手动筛选文件和反复验证的繁琐过程。

2. **作为发布负责人**，我希望在上传前运行自检脚本，自动发现版本不一致、权限过宽、图标缺失、国际化不全等问题，避免被 Web Store 审核打回。

---

## 验收标准

### AC-1: 完善 `scripts/build.sh`，生成发布级 .zip 产物

- [ ] `bash scripts/build.sh chrome` 输出 `dist/pagewise-v{VERSION}-chrome.zip`
- [ ] .zip 内仅包含以下目录/文件：
  ```
  manifest.json
  background/
  content/
  popup/
  options/
  sidebar/
  lib/
  skills/
  icons/
  _locales/
  ```
- [ ] **明确排除**：`tests/`、`docs/`、`coverage/`、`scripts/`、`locales/`（旧版目录）、`node_modules/`、`*.md`、`*.json`（仅保留 manifest.json）、`manifest.firefox.json`、`manifest.edge.json`、`.DS_Store`、`Thumbs.db`、`*.bak`、`*.tmp`
- [ ] 产物在 Chrome 中**可正常加载**（`chrome://extensions` → 开发者模式 → 加载已解压扩展程序），核心功能可运行（侧边栏打开、popup 弹出、页面选中即问）
- [ ] 产物体积 ≤ 10MB（Chrome Web Store 硬限制）

### AC-2: 新增 `scripts/publish-check.sh` 发布前自检

脚本执行以下检查项，任一 FAIL 即退出码非零：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | **manifest 版本一致性** | `manifest.json` 的 `version` 字段 = `package.json` 的 `version` 字段 |
| 2 | **权限最小化审计** | 列出 `permissions` 和 `host_permissions`，标注 `"<all_urls>"` 等宽泛匹配，提示人工确认 |
| 3 | **必需图标存在** | `icons/icon16.png`、`icons/icon48.png`、`icons/icon128.png` 存在且 > 100 bytes |
| 4 | **`_locales` 完整性** | `zh_CN` 与 `en` 的 message key 完全一致（当前已一致，但需防未来漂移） |
| 5 | **`default_locale` 存在** | `manifest.json` 的 `default_locale` 目录在 `_locales/` 中存在 |
| 6 | **无残留开发文件** | 构建产物中无 `tests/`、`coverage/`、`scripts/`、`locales/`（旧版）、`node_modules/` |
| 7 | **安全审计** | 无 `eval()` 使用、无内联 `<script>`、无非 HTTPS 外部资源（localhost/127.0.0.1 除外） |

- [ ] 脚本输出彩色 PASS/FAIL/WARN 报告
- [ ] 全部 PASS 时退出码 = 0；任一 FAIL 时退出码 ≠ 0
- [ ] 支持 `bash scripts/publish-check.sh` 独立运行（不依赖 `build.sh` 产物）

### AC-3: Chrome Web Store 截图脚本指引

- [ ] 在 `docs/` 目录下新增 `SCREENSHOT-GUIDE.md`
- [ ] 内容覆盖：
  - Chrome Web Store 要求的截图尺寸（1280×800 或 640×400）
  - 推荐的 5 张截图场景（侧边栏 AI 问答、知识库搜索、书签图谱可视化、popup 快捷操作、options 设置页）
  - 使用 Chrome DevTools Protocol 或 Puppeteer 的自动化截图脚本示例（可选，人工截取也可）
  - 截图命名规范与上传顺序建议

### AC-4: 生成 `RELEASE-NOTES-v3.1.md`

- [ ] 文件位于 `docs/RELEASE-NOTES-v3.1.md`
- [ ] 涵盖 v3.0.0 → v3.1.0 的全部变更：
  - R203-R208 迭代摘要（模块拆分、覆盖率冲刺、模块合并、发布流水线）
  - 新增功能/修复/架构改进分类
  - 安装/升级说明
- [ ] 格式与现有 `docs/RELEASE-NOTES-v3.md` 保持一致

### AC-5: 端到端验证

- [ ] 运行 `bash scripts/publish-check.sh` → 全部 PASS
- [ ] 运行 `bash scripts/build.sh chrome` → 产出 `dist/pagewise-v3.1.0-chrome.zip`
- [ ] 在 Chrome 中加载 .zip 产物 → 扩展正常启动，无控制台报错
- [ ] 全量测试回归 0 fail（`node --test`）

---

## 技术约束

1. **无构建工具链**：项目采用纯 JavaScript ES Modules，无 webpack/rollup/vite 等打包器。所有脚本必须是 Shell (bash) 或 Node.js，不引入新依赖。
2. **Manifest V3**：Chrome Web Store 已停止接受 MV2 新提交，`manifest_version` 必须为 3。
3. **`_locales` 格式**：严格使用 Chrome 标准 i18n 格式（`_locales/{locale}/messages.json`），`locales/` 旧版目录不得出现在产物中。
4. **权限声明**：Chrome Web Store 审核对 `"<all_urls>"` 和宽泛权限敏感。`content_scripts.matches` 中的 `"<all_urls>"` 是内容脚本注入所必需（选中即问功能），需在提交说明中解释理由。
5. **产物体积**：Chrome Web Store 限制 10MB，当前 `lib/` 目录含 50,000+ 行代码需确认压缩后体积。
6. **Shell 可移植性**：脚本需兼容 Linux/macOS (bash 4+)，使用 POSIX 兼容命令或提供 fallback。
7. **向后兼容**：`build.sh` 现有参数格式（`bash scripts/build.sh [chrome|firefox|edge|all]`）不得破坏。

---

## 依赖关系

| 依赖项 | 类型 | 说明 |
|--------|------|------|
| `manifest.json` | 前置 | 必须已正确声明所有权限、图标、service worker 路径 |
| `icons/icon{16,48,128}.png` | 前置 | 发布必需的三种尺寸图标已存在（✅ 已确认） |
| `_locales/{zh_CN,en}/messages.json` | 前置 | 国际化 key 已完整且一致（✅ 已确认，32 个 key 同步） |
| R203-R207 (模块拆分/合并) | 前置 | lib/ 模块已拆分至 ≤400 行，合并已完成，全量回归 0 fail |
| 测试基础设施 | 前置 | `node --test` 全量回归需在发布前通过 |
| `docs/RELEASE-NOTES-v3.md` | 参考 | v3.1.0 release notes 格式参考 |

---

## 非目标（Out of Scope）

- **CI/CD 集成**：本迭代不涉及 GitHub Actions / GitLab CI 自动发布流水线
- **Chrome Web Store API 自动上传**：不实现 `chrome-webstore-upload-cli` 等自动提交
- **Firefox / Edge 商店发布**：本迭代聚焦 Chrome Web Store，多浏览器商店发布留待后续
- **代码签名 / 混淆**：Chrome 扩展不强制要求，暂不引入
- **自动版本号递增**：版本号仍手动管理，不引入 semantic-release 等工具

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 产物体积超 10MB | 低 | 高（审核打回） | `package.sh` 已有体积检查；`lib/pdf*.mjs` 已排除；必要时对 lib/ 做 tree-shaking |
| `content_scripts` 使用 `"<all_urls>"` 被审核质疑 | 中 | 中 | 在提交描述中说明"选中即问"功能的技术必要性；host_permissions 已限定 API 域名 |
| `locales/` 旧目录误入产物 | 低 | 低 | `publish-check.sh` 显式检查并报警 |
| `build.sh` 修改影响 Firefox/Edge 打包 | 低 | 中 | 仅修改 chrome 分支逻辑；全量回归验证 |

---

## 实施建议（供执行 Agent 参考）

1. **优先级**：AC-2 (`publish-check.sh`) > AC-1 (完善 `build.sh`) > AC-4 (release notes) > AC-3 (截图指引) > AC-5 (端到端验证)
2. 可在现有 `package.sh` 基础上重构为 `publish-check.sh`，剥离打包逻辑，只保留校验逻辑
3. `build.sh` 的 chrome 分支复用 `package.sh` 的清理逻辑，确保产物干净
4. 截图指引为纯文档，无代码实现

---

*文档结束 — R208: Chrome Web Store 发布产物构建 ReleaseBuildPipeline*
