/**
 * 工具函数
 */

import { storageGet, storageSet } from './storage-adapter.js'
import { highlightCode as _highlightCode } from './utils-highlight.js'

// 向后兼容 re-export
export { highlightCode } from './utils-highlight.js'

/**
 * 从 chrome.storage 读取设置（自动降级 sync → local）
 */
export async function getSettings() {
  const DEFAULTS = {
    apiKey: '',
    apiProtocol: 'openai',
    apiBaseUrl: 'https://api.openai.com',
    model: 'gpt-4o',
    maxTokens: 4096,
    autoExtract: false,
    theme: 'light',
    language: 'zh-CN',
    maxContentLength: 8000
  }
  try {
    const result = await storageGet(DEFAULTS)
    return result
  } catch (e) {
    console.warn('[PageWise] getSettings 失败，使用默认值:', e)
    return DEFAULTS
  }
}

/**
 * 保存设置到 chrome.storage（自动降级 sync → local）
 */
export async function saveSettings(settings) {
  return storageSet(settings)
}

/**
 * 截断文本
 */
export function truncate(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 格式化时间
 */
export function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * 简单的 Markdown 渲染（不依赖外部库）
 */
export function renderMarkdown(text) {
  if (!text) return '';

  // 代码块替换 — 带语法高亮
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const highlighted = _highlightCode(code, lang);
    return `<div class="code-block-wrapper"><button class="code-copy-btn" data-code-copy title="复制代码">复制</button><pre><code class="lang-${lang}">${highlighted}</code></pre></div>`;
  });

  return text
    // 代码块
    // (code blocks already handled above)
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 标题
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // 粗体 / 斜体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // 无序列表
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // 引用
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // 分隔线
    .replace(/^---$/gm, '<hr>')
    // 段落（双换行）
    .replace(/\n\n/g, '</p><p>')
    // 单换行
    .replace(/\n/g, '<br>');
}

// highlightCode 已提取至 utils-highlight.js，通过 re-export 向后兼容

/**
 * 防抖
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流
 */
export function throttle(fn, interval = 200) {
  let lastTime = 0;
  let timer = null;
  return function (...args) {
    const now = Date.now();
    const remaining = interval - (now - lastTime);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastTime = now;
      fn.apply(this, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * 生成唯一 ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ==================== 对话持久化 ====================

const CONVERSATION_STORAGE_KEY = 'pagewiseConversation';
const CONVERSATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 小时

/**
 * 保存对话历史到 chrome.storage.session
 * @param {Array} conversationHistory - 对话历史数组
 * @param {string} currentPageUrl - 当前页面 URL
 */
export async function saveConversation(conversationHistory, currentPageUrl) {
  const data = {
    conversationHistory,
    currentPageUrl: currentPageUrl || '',
    timestamp: Date.now()
  };
  return new Promise((resolve) => {
    chrome.storage.session.set({ [CONVERSATION_STORAGE_KEY]: data }, resolve);
  });
}

/**
 * 从 chrome.storage.session 恢复对话历史
 * @param {string} currentUrl - 当前页面 URL，用于判断是否同一页面
 * @returns {{ conversationHistory: Array, currentPageUrl: string, timestamp: number } | null}
 */
export async function loadConversation(_currentUrl) {
  return new Promise((resolve) => {
    chrome.storage.session.get(CONVERSATION_STORAGE_KEY, (result) => {
      const data = result[CONVERSATION_STORAGE_KEY];
      if (!data) {
        resolve(null);
        return;
      }
      // 超过 24 小时自动过期
      if (Date.now() - data.timestamp > CONVERSATION_EXPIRY_MS) {
        chrome.storage.session.remove(CONVERSATION_STORAGE_KEY);
        resolve(null);
        return;
      }
      resolve(data);
    });
  });
}

/**
 * 清除保存的对话历史
 */
export async function clearConversation() {
  return new Promise((resolve) => {
    chrome.storage.session.remove(CONVERSATION_STORAGE_KEY, resolve);
  });
}

// ==================== API Profile 管理 ====================

const PROFILES_STORAGE_KEY = 'pagewiseApiProfiles';

/**
 * 保存 API 配置 Profile 列表（自动降级 sync → local）
 * @param {Array} profiles - Profile 数组
 */
export async function saveProfiles(profiles) {
  return storageSet({ [PROFILES_STORAGE_KEY]: profiles })
}

/**
 * 加载 API 配置 Profile 列表（自动降级 sync → local）
 * @returns {Array} Profile 数组
 */
export async function loadProfiles() {
  const result = await storageGet({ [PROFILES_STORAGE_KEY]: [] })
  return result[PROFILES_STORAGE_KEY]
}

// ==================== 页面语言检测 ====================

/**
 * 检测页面内容的语言
 * 通过 Unicode 字符范围分析判断中文/英文/其他
 * @param {string} text - 页面文本内容（建议取前 2000 字符）
 * @returns {'zh' | 'en' | 'other'} 语言标签
 */
export function detectPageLanguage(text) {
  if (!text || typeof text !== 'string') return 'other';

  // 取前 2000 字符采样，避免大文本性能问题
  const sample = text.slice(0, 2000);
  let cjkCount = 0;
  let latinCount = 0;
  let totalLetters = 0;

  for (const char of sample) {
    const code = char.codePointAt(0);
    // CJK 统一汉字 (U+4E00–U+9FFF) + CJK 扩展 A (U+3400–U+4DBF) + 兼容 (U+F900–U+FAFF)
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0xF900 && code <= 0xFAFF)) {
      cjkCount++;
      totalLetters++;
    }
    // Latin 基本 + 扩展 (U+0041–U+024F)
    else if ((code >= 0x0041 && code <= 0x024F) ||
             (code >= 0x1E00 && code <= 0x1EFF)) {
      latinCount++;
      totalLetters++;
    }
  }

  if (totalLetters === 0) return 'other';

  const cjkRatio = cjkCount / totalLetters;
  const latinRatio = latinCount / totalLetters;

  // 中文判定：CJK 字符占比 ≥ 30%
  if (cjkRatio >= 0.3) return 'zh';
  // 英文判定：拉丁字符占比 ≥ 50%
  if (latinRatio >= 0.5) return 'en';

  return 'other';
}

/**
 * 获取语言标签的显示信息
 * @param {'zh' | 'en' | 'other'} lang - 语言标签
 * @returns {{ label: string, icon: string }} 显示信息
 */
export function getLanguageDisplay(lang) {
  const map = {
    zh: { label: '中文', icon: '🇨🇳' },
    en: { label: 'English', icon: '🇬🇧' },
    other: { label: 'Other', icon: '🌐' }
  };
  return map[lang] || map.other;
}
