# Chrome Web Store 截图指南 — PageWise v3.1.0

> 更新日期: 2026-05-20
> 用途: 指导生成 Chrome Web Store 所需的截图和宣传图

---

## 截图尺寸要求

Chrome Web Store 对截图和宣传图有严格尺寸要求：

| 类型 | 尺寸 | 数量 | 说明 |
|------|------|------|------|
| **小截图** | 640 × 400 px | 1-5 张 | 主要展示区域，必填 |
| **大截图** | 1280 × 800 px | 1-5 张 | 可选，高清展示 |
| **宣传图（Tile）** | 1400 × 560 px | 1 张 | Web Store 搜索结果展示 |
| **商店图标** | 128 × 128 px | 1 张 | 已包含在 icons/icon128.png |

**格式**: PNG 或 JPEG（推荐 PNG，质量更佳）
**最大文件**: 每张 ≤ 5MB

---

## 推荐截图场景（5 张）

按照以下顺序排列截图，形成完整的功能展示流：

### 截图 1: 侧边栏 AI 问答（必选）
- **场景**: 在技术文档页面上打开侧边栏，向 AI 提问并获得回答
- **展示**: AI 对话界面、流式回答、Markdown 渲染
- **Chrome 操作**: 打开任意技术文档 → Ctrl+Shift+Y 打开侧边栏 → 输入问题 → 等待回答完成 → 截图

### 截图 2: 知识库搜索（必选）
- **场景**: 在侧边栏的知识库标签页中搜索历史问答
- **展示**: 全文搜索、知识库条目列表、语义搜索结果
- **Chrome 操作**: 侧边栏 → 切换到知识库标签 → 输入搜索关键词 → 截图

### 截图 3: 书签图谱可视化（必选）
- **场景**: 选项页中的书签知识图谱全景视图
- **展示**: 力导向图、节点聚类、搜索高亮、详情面板
- **Chrome 操作**: 右键扩展图标 → 选项 → 书签图谱标签 → 等待图谱渲染 → 截图

### 截图 4: Popup 快捷操作
- **场景**: 点击扩展图标弹出的 Popup 窗口
- **展示**: 书签概览、快速搜索、最近添加、待读数量
- **Chrome 操作**: 点击扩展图标 → 截图 Popup 窗口

### 截图 5: 选项页设置
- **场景**: 扩展选项页的设置界面
- **展示**: 多标签页布局、AI 模型配置、主题选择
- **Chrome 操作**: 右键扩展图标 → 选项 → 截全景

---

## 截图规范

### 配色要求
- **浅色主题**截图为主（至少 3 张），深色主题可补充 1-2 张
- 确保文字清晰可读，避免纯白/纯黑背景

### 内容要求
- 侧边栏中使用**真实的中文技术问答**内容
- 书签图谱使用 ≥ 20 个书签节点展示（太稀疏不美观）
- 避免展示个人敏感信息（API key、个人书签标题等）

### 命名规范

截图文件按以下命名规范保存至 `docs/screenshots/` 目录：

```
docs/screenshots/
├── 01-sidebar-ai-chat.png         # 侧边栏 AI 问答
├── 02-knowledge-base-search.png   # 知识库搜索
├── 03-bookmark-graph.png          # 书签图谱
├── 04-popup-overview.png          # Popup 概览
├── 05-options-settings.png        # 选项页设置
├── promo-tile-1400x560.png        # 宣传图
└── icon-128.png                   # 商店图标（与 icons/icon128.png 相同）
```

---

## 自动化截图方法

### 方法 1: Chrome DevTools Protocol（推荐）

使用 Puppeteer 自动截图：

```javascript
// screenshot.mjs — 自动化截图脚本示例
import puppeteer from 'puppeteer';

const EXTENSION_PATH = './dist/pagewise-chrome-build';
const SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_HEIGHT = 800;

async function captureScreenshots() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      `--window-size=${SCREENSHOT_WIDTH},${SCREENSHOT_HEIGHT}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT });

  // 截图 1: 打开技术文档并使用侧边栏
  await page.goto('https://developer.chrome.com/docs/extensions/manifest/', {
    waitUntil: 'networkidle0',
  });
  // 打开侧边栏 (需要通过 chrome.sidePanel API 或快捷键)
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'docs/screenshots/01-sidebar-ai-chat.png' });

  // 截图 2: Popup
  // 注: Puppeteer 需要特殊处理 popup，可通过 chrome-extension:// URL 访问
  const extPages = await browser.pages();
  // ... 具体实现取决于扩展结构

  await browser.close();
  console.log('截图完成!');
}

captureScreenshots().catch(console.error);
```

安装依赖:
```bash
npm install --save-dev puppeteer
```

运行截图:
```bash
bash scripts/build.sh chrome
node screenshot.mjs
```

### 方法 2: 手动截图（简单快捷）

1. 运行 `bash scripts/build.sh chrome` 构建
2. 在 Chrome 中加载解压扩展：`chrome://extensions` → 开发者模式 → 加载已解压
3. 使用 Chrome 内置截图工具：
   - 打开 DevTools (F12)
   - Ctrl+Shift+P → 输入 "Capture screenshot"
   - 选择 "Capture full size screenshot" 或 "Capture node screenshot"
4. 使用系统截图工具（Win: Win+Shift+S / Mac: Cmd+Shift+4）

### 方法 3: 录屏转截图

如果需要动态操作的截图（如 AI 正在回答中）：
1. 使用 OBS 或系统录屏工具录制操作过程
2. 从视频中截取最佳帧作为截图

---

## 上传清单

Chrome Web Store Developer Dashboard 上传时需要：

| 文件 | 说明 | 状态 |
|------|------|------|
| `pagewise-v3.1.0-chrome.zip` | 扩展包 | `bash scripts/build.sh chrome` |
| `01-sidebar-ai-chat.png` | 截图 1 (640×400 / 1280×800) | 手动截取 |
| `02-knowledge-base-search.png` | 截图 2 | 手动截取 |
| `03-bookmark-graph.png` | 截图 3 | 手动截取 |
| `04-popup-overview.png` | 截图 4 | 手动截取 |
| `05-options-settings.png` | 截图 5 | 手动截取 |
| `promo-tile-1400x560.png` | 宣传图 | 手动设计 |
| `STORE-LISTING.md` | 商店描述文案 | 已有 |

---

## 注意事项

1. **截图中的语言**: 使用中文界面（zh_CN locale），因主要目标用户为中文社区
2. **避免版权问题**: 截图中不要展示其他扩展的 UI 或第三方品牌标识
3. **隐私合规**: 确保截图中不暴露 API key、个人信息或内部测试数据
4. **更新频率**: 每次大版本更新后重新截图，反映最新 UI
