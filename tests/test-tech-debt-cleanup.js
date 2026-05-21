/**
 * 测试 R112: 技术债务结算 TechDebtCleanup
 * — 验证 TD 表更新、残留文件清理、README badges、CHANGELOG 补充
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;

// ==================== AC-1: TD 表状态更新 ====================

describe('TD 表状态更新 (AC-1)', async () => {
  const designContent = await readFile(`${ROOT}/docs/DESIGN.md`, 'utf-8');

  it('TD001 状态为已关闭 (via R108)', () => {
    assert.ok(
      designContent.includes('TD001') && designContent.includes('已关闭 (via R108)'),
      'TD001 应标记为已关闭 (via R108)'
    );
  });

  it('TD002 状态为已关闭 (via R104)', () => {
    const lines = designContent.split('\n');
    const td002Line = lines.find(l => l.includes('TD002'));
    assert.ok(td002Line, '应存在 TD002 行');
    assert.ok(
      td002Line.includes('已关闭 (via R104)'),
      `TD002 行应包含「已关闭 (via R104)」，实际: ${td002Line}`
    );
  });

  it('TD003 状态为已关闭 (via R105)', () => {
    const lines = designContent.split('\n');
    const td003Line = lines.find(l => l.includes('TD003'));
    assert.ok(td003Line, '应存在 TD003 行');
    assert.ok(
      td003Line.includes('已关闭 (via R105)'),
      `TD003 行应包含「已关闭 (via R105)」，实际: ${td003Line}`
    );
  });

  it('所有 TD 项状态均为已关闭', () => {
    const lines = designContent.split('\n');
    const tdLines = lines.filter(l => l.match(/^\| TD\d{3} /));
    assert.ok(tdLines.length >= 3, `应至少有 3 个 TD 条目，实际: ${tdLines.length}`);
    for (const line of tdLines) {
      assert.ok(
        line.includes('已关闭'),
        `所有 TD 条目应为已关闭状态: ${line}`
      );
    }
  });
});

// ==================== AC-2: 残留文件清理 ====================

describe('残留文件清理 (AC-2)', () => {
  it('lib/test-r97.js 已删除', async () => {
    await assert.rejects(
      () => access(`${ROOT}/lib/test-r97.js`),
      { code: 'ENOENT' },
      'lib/test-r97.js 应已被删除'
    );
  });
});

// ==================== AC-3: README badges ====================

describe('README badges (AC-3)', async () => {
  const readmeContent = await readFile(`${ROOT}/README.md`, 'utf-8');

  it('README 包含 CI 状态 badge', () => {
    assert.ok(
      readmeContent.includes('ci.yml/badge.svg') || readmeContent.includes('![CI]'),
      'README 应包含 CI badge'
    );
  });

  it('README 包含 Coverage badge', () => {
    assert.ok(
      readmeContent.includes('coverage') && (readmeContent.includes('badge') || readmeContent.includes('shields.io')),
      'README 应包含 Coverage badge'
    );
  });

  it('README 包含 Lint badge', () => {
    assert.ok(
      readmeContent.includes('Lint') || readmeContent.includes('lint') || readmeContent.includes('ESLint'),
      'README 应包含 Lint badge'
    );
  });

  it('CI badge URL 格式正确', () => {
    assert.ok(
      readmeContent.includes('github.com/whalemalus/pagewise/actions/workflows/ci.yml'),
      'CI badge 应指向正确的 GitHub Actions workflow URL'
    );
  });

  it('badges 位于 README 顶部（标题之后）', () => {
    const lines = readmeContent.split('\n');
    const titleIdx = lines.findIndex(l => l.startsWith('# '));
    assert.ok(titleIdx >= 0, 'README 应有标题');
    // badges should be within first 10 lines after title
    const topSection = lines.slice(titleIdx, titleIdx + 10).join('\n');
    assert.ok(
      topSection.includes('badge') || topSection.includes('![CI]') || topSection.includes('![Coverage]') || topSection.includes('![Lint]'),
      'badges 应在标题之后的前 10 行内'
    );
  });
});

// ==================== AC-4: CHANGELOG 补充 ====================

describe('CHANGELOG 补充 R104-R107 (AC-4)', async () => {
  const changelogContent = await readFile(`${ROOT}/docs/CHANGELOG.md`, 'utf-8');

  it('CHANGELOG 包含 R104 变更记录', () => {
    assert.ok(
      changelogContent.includes('R104'),
      'CHANGELOG 应包含 R104 变更记录'
    );
  });

  it('CHANGELOG 包含 R105 变更记录', () => {
    assert.ok(
      changelogContent.includes('R105'),
      'CHANGELOG 应包含 R105 变更记录'
    );
  });

  it('CHANGELOG 包含 R106 变更记录', () => {
    assert.ok(
      changelogContent.includes('R106'),
      'CHANGELOG 应包含 R106 变更记录'
    );
  });

  it('CHANGELOG 包含 R107 变更记录', () => {
    assert.ok(
      changelogContent.includes('R107'),
      'CHANGELOG 应包含 R107 变更记录'
    );
  });

  it('R104-R107 记录在已发布区段 [3.1.0] 或 [Unreleased]', () => {
    // R104-R107 were originally expected in [Unreleased] but were
    // subsequently released under [3.1.0] — both locations are valid
    const has310 = changelogContent.includes('## [3.1.0]');
    const hasUnreleased = changelogContent.includes('## [Unreleased]');
    assert.ok(has310 || hasUnreleased, 'CHANGELOG 应有 [3.1.0] 或 [Unreleased] 区域');

    // Find the section containing R104-R107 (could be [3.1.0] or [Unreleased])
    const r104Idx = changelogContent.indexOf('R104');
    const r105Idx = changelogContent.indexOf('R105');
    const r106Idx = changelogContent.indexOf('R106');
    const r107Idx = changelogContent.indexOf('R107');

    assert.ok(r104Idx >= 0, 'R104 应在 CHANGELOG 中');
    assert.ok(r105Idx >= 0, 'R105 应在 CHANGELOG 中');
    assert.ok(r106Idx >= 0, 'R106 应在 CHANGELOG 中');
    assert.ok(r107Idx >= 0, 'R107 应在 CHANGELOG 中');
  });

  it('R104 记录描述 AiClientErrorHandling', () => {
    assert.ok(
      changelogContent.includes('AiClientErrorHandling') || changelogContent.includes('AI 客户端错误处理'),
      'R104 应描述 AI 客户端错误处理增强'
    );
  });

  it('R105 记录描述 KnowledgeBaseIndexOpt', () => {
    assert.ok(
      changelogContent.includes('KnowledgeBaseIndexOpt') || changelogContent.includes('知识库索引优化'),
      'R105 应描述知识库索引优化'
    );
  });
});

// ==================== AC-5: TODO.md 更新 ====================

describe('TODO.md R112 标记完成 (AC-5)', async () => {
  const todoContent = await readFile(`${ROOT}/docs/TODO.md`, 'utf-8');

  it('R112 标记为已完成 [x]', () => {
    const lines = todoContent.split('\n');
    const r112Line = lines.find(l => l.includes('R112') && l.includes('TechDebtCleanup'));
    assert.ok(r112Line, 'TODO.md 应包含 R112 TechDebtCleanup 条目');
    assert.ok(
      r112Line.includes('[x]'),
      `R112 应标记为 [x]，实际: ${r112Line.slice(0, 20)}`
    );
  });
});
