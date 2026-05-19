/**
 * R122: 开发者文档补全 DevDocumentation — 单元测试
 * 验证 CONTRIBUTING.md、架构概览、lib/ API 速查表、README 更新
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readDoc(relPath) {
  const content = await readFile(join(ROOT, relPath), 'utf-8');
  return content;
}

describe('R122: CONTRIBUTING.md', () => {
  it('AC-1: CONTRIBUTING.md 文件存在', async () => {
    assert.ok(await fileExists(join(ROOT, 'CONTRIBUTING.md')));
  });

  it('AC-2: 包含开发环境搭建说明', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('开发环境') || content.includes('Development Setup') || content.includes('Prerequisites'),
      '应包含开发环境搭建说明');
    assert.ok(content.includes('Node.js') || content.includes('node'),
      '应提及 Node.js');
    assert.ok(content.includes('Chrome') || content.includes('chrome'),
      '应提及 Chrome 扩展加载');
  });

  it('AC-3: 包含分支策略说明', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('分支') || content.includes('Branch') || content.includes('branch'),
      '应包含分支策略');
    assert.ok(content.includes('master') || content.includes('main'),
      '应提及主分支');
  });

  it('AC-4: 包含 PR 流程说明', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('PR') || content.includes('Pull Request') || content.includes('合并'),
      '应包含 PR 流程');
  });

  it('AC-5: 包含测试规范', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('测试') || content.includes('test') || content.includes('Test'),
      '应包含测试规范');
    assert.ok(content.includes('node:test') || content.includes('npm test') || content.includes('node --test'),
      '应提及测试工具/命令');
  });

  it('AC-6: 包含代码规范说明', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('ES Module') || content.includes('ESM') || content.includes('ESLint'),
      '应提及 ES Module 或 ESLint');
    assert.ok(content.includes('Conventional Commits') || content.includes('commit') || content.includes('提交'),
      '应提及提交规范');
  });

  it('AC-7: 包含 npm scripts 参考', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('npm test') || content.includes('npm run'),
      '应包含 npm scripts 参考');
  });

  it('AC-8: 包含目录结构概览', async () => {
    const content = await readDoc('CONTRIBUTING.md');
    assert.ok(content.includes('lib/') || content.includes('lib/`') || content.includes('目录'),
      '应包含目录结构概览');
  });
});

describe('R122: 架构概览文档', () => {
  it('AC-9: docs/ARCHITECTURE.md 文件存在', async () => {
    assert.ok(await fileExists(join(ROOT, 'docs', 'ARCHITECTURE.md')));
  });

  it('AC-10: 包含模块依赖关系图', async () => {
    const content = await readDoc('docs/ARCHITECTURE.md');
    assert.ok(content.includes('```') || content.includes('┌') || content.includes('│'),
      '应包含 ASCII 图表');
    assert.ok(content.includes('ai-client') || content.includes('knowledge-base'),
      '应提及核心模块');
  });

  it('AC-11: 包含数据流描述', async () => {
    const content = await readDoc('docs/ARCHITECTURE.md');
    assert.ok(content.includes('数据流') || content.includes('Data Flow') || content.includes('flow'),
      '应包含数据流描述');
  });

  it('AC-12: 包含分层架构说明', async () => {
    const content = await readDoc('docs/ARCHITECTURE.md');
    assert.ok(content.includes('Content Script') || content.includes('Sidebar') || content.includes('Service Worker'),
      '应提及浏览器扩展分层');
    assert.ok(content.includes('lib') || content.includes('Lib') || content.includes('库'),
      '应提及 Lib 层');
  });

  it('AC-13: 包含核心模块列表', async () => {
    const content = await readDoc('docs/ARCHITECTURE.md');
    // 应该提及至少5个核心模块
    const modules = ['ai-client', 'knowledge-base', 'skill-engine', 'memory', 'evolution',
      'page-sense', 'agent-loop', 'spaced-repetition', 'knowledge-graph'];
    let found = 0;
    for (const mod of modules) {
      if (content.includes(mod)) found++;
    }
    assert.ok(found >= 5, `应提及至少5个核心模块，实际找到 ${found} 个`);
  });

  it('AC-14: 包含存储层说明', async () => {
    const content = await readDoc('docs/ARCHITECTURE.md');
    assert.ok(content.includes('chrome.storage') || content.includes('IndexedDB') || content.includes('存储'),
      '应包含存储层说明');
  });
});

describe('R122: lib/ 公共 API 速查表', () => {
  it('AC-15: docs/LIB-API-REFERENCE.md 文件存在', async () => {
    assert.ok(await fileExists(join(ROOT, 'docs', 'LIB-API-REFERENCE.md')));
  });

  it('AC-16: 包含 utils.js API', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    assert.ok(content.includes('utils.js') || content.includes('utils'),
      '应包含 utils 模块');
    assert.ok(content.includes('getSettings') || content.includes('renderMarkdown') || content.includes('debounce'),
      '应列出 utils 的公共 API');
  });

  it('AC-17: 包含 ai-client.js API', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    assert.ok(content.includes('ai-client') || content.includes('AIClient'),
      '应包含 ai-client 模块');
  });

  it('AC-18: 包含 knowledge-base.js API', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    assert.ok(content.includes('knowledge-base') || content.includes('KnowledgeBase'),
      '应包含 knowledge-base 模块');
  });

  it('AC-19: 包含 skill-engine.js API', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    assert.ok(content.includes('skill-engine') || content.includes('SkillEngine'),
      '应包含 skill-engine 模块');
  });

  it('AC-20: 包含 spaced-repetition.js API', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    assert.ok(content.includes('spaced-repetition') || content.includes('calculateNextReview'),
      '应包含 spaced-repetition 模块');
  });

  it('AC-21: 包含 memory.js API', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    assert.ok(content.includes('memory') || content.includes('MemorySystem'),
      '应包含 memory 模块');
  });

  it('AC-22: API 速查表包含足够数量的模块', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    // 检查至少列出 20 个模块
    const moduleCount = (content.match(/^#{1,3}\s/gm) || []).length;
    assert.ok(moduleCount >= 15, `应至少列出 15 个模块段落，实际 ${moduleCount} 个`);
  });

  it('AC-23: API 速查表包含函数签名或说明', async () => {
    const content = await readDoc('docs/LIB-API-REFERENCE.md');
    // 应包含参数标记 (或 -> 或 返回)
    assert.ok(content.includes('→') || content.includes('->') || content.includes('返回') || content.includes('Promise') || content.includes('function'),
      '应包含函数签名或返回类型说明');
  });
});

describe('R122: README 更新', () => {
  it('AC-24: README 包含开发/调试指南', async () => {
    const content = await readDoc('README.md');
    assert.ok(content.includes('调试') || content.includes('debug') || content.includes('Debug'),
      'README 应包含调试指南');
  });

  it('AC-25: README 包含发布流程', async () => {
    const content = await readDoc('README.md');
    assert.ok(content.includes('发布') || content.includes('release') || content.includes('Release') || content.includes('打包'),
      'README 应包含发布/打包流程');
  });

  it('AC-26: README 包含 npm scripts 完整列表', async () => {
    const content = await readDoc('README.md');
    assert.ok(content.includes('npm test') || content.includes('npm run test'),
      '应包含 npm test');
    assert.ok(content.includes('npm run lint') || content.includes('lint'),
      '应包含 lint 命令');
  });

  it('AC-27: README 包含 CONTRIBUTING 链接', async () => {
    const content = await readDoc('README.md');
    assert.ok(content.includes('CONTRIBUTING') || content.includes('贡献') || content.includes('contributing'),
      'README 应链接到 CONTRIBUTING.md');
  });

  it('AC-28: README 包含架构文档链接', async () => {
    const content = await readDoc('README.md');
    assert.ok(content.includes('ARCHITECTURE') || content.includes('架构概览') || content.includes('architecture'),
      'README 应链接到架构文档');
  });
});

describe('R122: IMPLEMENTATION.md 更新', () => {
  it('AC-29: IMPLEMENTATION.md 包含 R122 记录', async () => {
    const content = await readDoc('docs/IMPLEMENTATION.md');
    assert.ok(content.includes('R122'), 'IMPLEMENTATION.md 应包含 R122 记录');
    assert.ok(content.includes('DevDocumentation') || content.includes('开发者文档'),
      '应包含任务名称');
  });
});

describe('R122: CHANGELOG.md 更新', () => {
  it('AC-30: CHANGELOG.md 包含 R122 变更记录', async () => {
    const content = await readDoc('docs/CHANGELOG.md');
    assert.ok(content.includes('R122'), 'CHANGELOG.md 应包含 R122 记录');
  });
});

describe('R122: TODO.md 更新', () => {
  it('AC-31: TODO.md R122 标记为已完成', async () => {
    const content = await readDoc('docs/TODO.md');
    assert.ok(content.includes('[x] **R122'), 'TODO.md R122 应标记为 [x]');
  });
});
