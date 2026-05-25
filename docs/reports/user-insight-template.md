# 用户洞察报告模板 — PageWise 遥测数据

> **用途**: 从 `chrome.storage.local` 遥测数据提取可行动的产品改进清单
> **数据源**: `pagewise_telemetry` 键值（本地存储，不上传服务器）
> **生成工具**: `lib/user-insight-analyzer.js`
> **迭代**: R298 DataDrivenIteration

---

## 1. 数据提取指南

### 1.1 从 chrome.storage.local 导出数据

在 Chrome DevTools Console 中执行:

```javascript
// 打开扩展的 Service Worker DevTools 或 SidePanel DevTools
chrome.storage.local.get('pagewise_telemetry', (result) => {
  console.log(JSON.stringify(result.pagewise_telemetry, null, 2));
});
```

或使用 `lib/telemetry.js` 的导出 API:

```javascript
import { createTelemetry } from './lib/telemetry.js';
const telemetry = createTelemetry(chrome.storage.local);
const data = telemetry.exportData();
console.log(JSON.stringify(data, null, 2));
```

### 1.2 数据结构说明

```json
{
  "enabled": true,
  "features": {
    "text_select": 150,     // 选中文字触发次数
    "ask_ai": 80,           // AI 提问次数
    "ai_response": 75,      // AI 回答成功次数
    "bookmark": 40,         // 书签操作次数
    "knowledge_search": 60  // 知识库查询次数
  },
  "errors": {
    "ai_timeout": {
      "total": 5,
      "lastOccurrence": 1716662400000,
      "lastMessage": "Request timeout"
    }
  },
  "metrics": {
    "ai_response_time": {
      "count": 50,
      "total": 15000,
      "min": 100,
      "max": 600,
      "latest": 250
    }
  }
}
```

---

## 2. 分析步骤

### Step 1: 功能使用频率排名

从 `features` 字段按使用次数降序排列:

| 排名 | 功能 | 使用次数 | 占比 | 分析 |
|------|------|----------|------|------|
| 1 | text_select | - | - | 最高频功能 |
| 2 | ask_ai | - | - | |
| 3 | knowledge_search | - | - | |
| 4 | ai_response | - | - | |
| 5 | bookmark | - | - | |

**分析要点**:
- 占比 >60% 的功能说明用户行为高度集中，可能意味着其他功能曝光度不足
- 占比 <5% 的功能需评估是否有 UI 引导缺失

### Step 2: 核心路径完成率漏斗

追踪用户核心旅程: **选中文字 → 提出问题 → 获得回答 → 归档书签**

```
选中文字  [████████████████████████] 100%  (N)
    ↓ 流失 ____%
提出问题  [██████████████         ] ___%  (N)
    ↓ 流失 ____%
获得回答  [██████████             ] ___%  (N)
    ↓ 流失 ____%
归档书签  [████                   ] ___%  (N)
```

**分析要点**:
- 整体完成率 <30% = 高优先级问题
- 单步流失 >50% = 该步骤需要重点优化
- 完成率 >60% = 产品体验良好

### Step 3: 日活/周活趋势

| 指标 | 值 | 目标 | 状态 |
|------|-----|------|------|
| 估算活跃天数 | - | - | - |
| 日均使用次数 | - | ≥5 | - |
| 周活跃天数 | - | ≥3 | - |

**分析要点**:
- 日均 <3 次 = 使用深度不足，需提升互动频次
- 周活跃 <2 天 = 用户粘性低，需增加使用场景

### Step 4: 错误率 Top-5

| 排名 | 错误类型 | 总次数 | 最近消息 | 修复优先级 |
|------|----------|--------|----------|------------|
| 1 | - | - | - | - |
| 2 | - | - | - | - |
| 3 | - | - | - | - |
| 4 | - | - | - | - |
| 5 | - | - | - | - |

**分析要点**:
- 总错误 >50 = 高优先级修复
- 单类错误 >10 = 需要根因分析
- 关注 `lastMessage` 字段获取错误详情

### Step 5: 性能指标

| 指标 | 平均值 | 最小值 | 最大值 | 最新值 | 目标 |
|------|--------|--------|--------|--------|------|
| ai_response_time | - ms | - ms | - ms | - ms | <3000ms |
| search_latency | - ms | - ms | - ms | - ms | <500ms |

---

## 3. 产品改进清单模板

基于以上分析，填写以下优先级矩阵:

### P0 — 必须立即修复
- [ ] _(例如: ai_timeout 错误率 >10%)_

### P1 — 下个迭代修复
- [ ] _(例如: 核心路径完成率 <30%，最大流失在「获得回答」步骤)_

### P2 — 计划中改进
- [ ] _(例如: 功能使用集中度过高，需提升低频功能曝光)_

### P3 — 长期观察
- [ ] _(例如: 日均使用次数 2.5，低于目标 5)_

---

## 4. 使用 user-insight-analyzer 自动分析

```javascript
import { createUserInsightAnalyzer } from '../lib/user-insight-analyzer.js'

// 获取遥测数据
const telemetryData = telemetry.exportData()

// 创建分析器
const analyzer = createUserInsightAnalyzer(telemetryData)

// 获取完整报告
const report = analyzer.generateInsightReport()

// 或分别获取各维度洞察
const ranking = analyzer.getFeatureRanking()       // 功能使用排名
const funnel = analyzer.getCorePathCompletion()     // 核心路径漏斗
const trends = analyzer.getUsageTrends()            // 使用趋势
const errors = analyzer.getErrorTop5()              // 错误 Top-5
const metrics = analyzer.getMetricStats()           // 指标统计

// 输出推荐建议
for (const rec of report.recommendations) {
  console.log(`[${rec.priority.toUpperCase()}] ${rec.title}`)
  console.log(`  详情: ${rec.detail}`)
  console.log(`  行动: ${rec.action}`)
  console.log()
}
```

---

## 5. 采集点验证清单

确保以下 5 个核心动作均触发了 `telemetry.trackFeature()`:

| # | 核心动作 | Feature Key | 验证方法 |
|---|----------|-------------|----------|
| 1 | 选中文字 | `text_select` | 选中页面文字后检查 features.text_select 计数 +1 |
| 2 | AI 提问 | `ask_ai` | 输入问题并发送后检查 features.ask_ai 计数 +1 |
| 3 | AI 回答 | `ai_response` | AI 回答渲染完成后检查 features.ai_response 计数 +1 |
| 4 | 书签操作 | `bookmark` | 添加/编辑/删除书签后检查 features.bookmark 计数 +1 |
| 5 | 知识库查询 | `knowledge_search` | 执行知识库搜索后检查 features.knowledge_search 计数 +1 |

**验证步骤**:

1. 安装开发版扩展
2. 打开 SidePanel
3. 依次执行 5 个核心动作
4. 在 Console 中运行 `chrome.storage.local.get('pagewise_telemetry', console.log)`
5. 确认 features 对象中对应 key 的计数正确递增

---

## 6. NPS 反馈验证清单

确认 `lib/feedback-collector.js` 触发逻辑:

| 条件 | 预期行为 | 验证方法 |
|------|----------|----------|
| 安装 <7 天 | 不显示 NPS 弹窗 | 安装后第 3 天打开扩展，确认无弹窗 |
| 安装 ≥7 天 + 未提交 | 显示 NPS 弹窗 | 模拟 7 天后打开扩展，确认弹窗出现 |
| 低分 (0-6) | 触发"帮助改进"通知 | 提交 3 分，确认收到改进引导通知 |
| 中分 (7-8) | 不触发通知 | 提交 8 分，确认无通知 |
| 高分 (9-10) | 引导 CWS 评价 | 提交 10 分，确认收到 Chrome Web Store 评价链接 |
| 已提交 | 不再显示弹窗 | 提交后再次打开扩展，确认无弹窗 |
| 用户跳过 | 不再显示弹窗 | 跳过后再次打开扩展，确认无弹窗 |
