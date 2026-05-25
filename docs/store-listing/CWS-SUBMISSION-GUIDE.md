# Chrome Web Store 提交指南 — PageWise v3.4.0

> 创建日期: 2026-05-25
> 目标: Chrome Web Store Developer Dashboard 正式提交审核

---

## 1. 提交前检查清单

| # | 检查项 | 状态 | 命令/说明 |
|---|--------|------|----------|
| 1 | `publish-check.sh` 全部 PASS | ✅ | `bash scripts/publish-check.sh` |
| 2 | manifest.json 版本 = package.json 版本 | ✅ | 3.4.0 |
| 3 | 图标文件完整 (16/48/128px) | ✅ | `icons/icon{16,48,128}.png` |
| 4 | _locales 双语一致性 (zh_CN/en) | ✅ | 32 个 key 完全一致 |
| 5 | `npm run test:ci` 0 fail | ✅ | 7869 pass / 0 fail |
| 6 | `npm run lint` 0/0 | ✅ | 0 errors / 0 warnings |
| 7 | 覆盖率门禁通过 | ✅ | lines≥22% / branches≥75% / functions≥50% |
| 8 | build.sh 生成 .zip | ✅ | `dist/pagewise-v3.4.0-chrome.zip` (1.1MB) |
| 9 | 隐私政策已更新 | ✅ | `docs/privacy-policy.html` |
| 10 | 截图已准备 | ⬜ | 见下方截图清单 |
| 11 | 宣传图已准备 | ⬜ | 1400×560px |
| 12 | 商品描述已准备 | ✅ | `docs/store-listing/listing-{zh,en}.md` |

---

## 2. 截图清单（5 张）

Chrome Web Store 要求至少 1 张截图，推荐 5 张。每张 1280×800px 或 640×400px。

| # | 文件名 | 内容 | 操作步骤 |
|---|--------|------|----------|
| 1 | `01-sidebar-ai-chat.png` | 侧边栏 AI 问答界面 | 打开技术文档 → Ctrl+Shift+Y → 提问 → 截图 |
| 2 | `02-knowledge-base.png` | 知识库搜索 | 侧边栏 → 知识库标签 → 搜索 → 截图 |
| 3 | `03-bookmark-graph.png` | 书签知识图谱 | 选项页 → 书签图谱标签 → 等待渲染 → 截图 |
| 4 | `04-popup-overview.png` | Popup 概览 | 点击扩展图标 → 截图 |
| 5 | `05-options-settings.png` | 设置页面 | 选项页 → 设置标签 → 截图 |

**截图工具方法**：
1. 运行 `bash scripts/build.sh chrome` 构建
2. Chrome → `chrome://extensions` → 开发者模式 → 加载已解压扩展
3. DevTools (F12) → Ctrl+Shift+P → "Capture screenshot"

### 宣传图

| 文件 | 尺寸 | 说明 |
|------|------|------|
| `promo-tile-1400x560.png` | 1400×560px | Web Store 搜索结果展示图 |

**设计建议**：左半展示侧边栏 AI 问答，右半展示书签图谱，中间放 Logo + 标语 "AI 驱动的网页阅读助手"

---

## 3. Developer Dashboard 提交步骤

1. 登录 https://chrome.google.com/webstore/devconsole
2. 点击「New Item」（首次提交）或选择已有项目
3. 上传 `dist/pagewise-v3.4.0-chrome.zip`
4. 填写商品信息：
   - **Category**: Productivity
   - **Language**: Chinese (Simplified) + English
   - **Short description**: 从 `listing-zh.md` / `listing-en.md` 复制
   - **Detailed description**: 从 `listing-zh.md` / `listing-en.md` 复制
5. 上传 5 张截图（1280×800）
6. 上传宣传图（1400×560）
7. 填写隐私政策 URL: `https://pagewise.github.io/privacy-policy.html`
8. 权限说明: 逐一说明每个权限的用途（见隐私政策 §5）
9. 提交审核

---

## 4. 权限审核说明（供 CWS 审核参考）

| 权限 | 必要性说明 |
|------|-----------|
| `storage` | 存储用户设置、API 配置、使用统计 |
| `sidePanel` | 显示侧边栏 AI 问答界面（核心功能） |
| `contextMenus` | 右键菜单「用智阅提问」快捷操作 |
| `tabs` | 获取当前页面标题/URL，用于知识归档 |
| `activeTab` | 仅在用户主动操作时访问当前标签页内容 |
| `bookmarks` | 读取 Chrome 书签用于图谱可视化 |
| `host_permissions` | 仅限 AI API 域名，不包含 `<all_urls>` |
| `content_scripts` | `<all_urls>` 匹配用于文字选中检测（核心功能） |

---

## 5. 审核常见问题准备

| 问题 | 回答 |
|------|------|
| 为什么需要 `<all_urls>` content_scripts？ | 文字选中检测功能需要在所有页面运行，用于「选中文字→提问」核心交互 |
| 为什么需要 `bookmarks` 权限？ | 书签知识图谱功能需要读取 Chrome 书签数据 |
| 数据发送到哪里？ | 仅发送到用户自行配置的 AI API 端点（Claude/OpenAI/DeepSeek/本地），不发送到开发者服务器 |
| 是否有远程代码？ | 无。CSP 严格限制 `script-src 'self'`，不加载任何外部脚本 |
| 性能监控是否上报数据？ | 否。性能监控仅在本地内存中运行，不上传任何数据 |
| 反馈数据如何处理？ | NPS 评分和文字反馈仅存储在 `chrome.storage.local`，不上传 |

---

## 6. 发布后验证

发布通过审核后，验证以下项目：
1. 在 Chrome Web Store 搜索「PageWise」可找到
2. 点击安装，扩展正常工作
3. 侧边栏、Popup、选项页均可正常打开
4. AI 问答功能正常（需配置 API key）
5. 更新隐私政策 URL 可访问
