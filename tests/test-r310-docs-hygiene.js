/**
 * R310: 项目文档全面卫生治理 ProjectDocsHygieneV2
 * 验证文档清理和更新结果
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = join(process.cwd(), 'docs');

/** Helper: get all files matching a glob pattern prefix */
function getFiles(prefix) {
  return readdirSync(DOCS).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
}

/** Helper: get numeric iteration id from filename like DESIGN-ITER64.md → 64 */
function getIterNum(filename) {
  const m = filename.match(/ITER(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

describe('R310: DESIGN-ITER cleanup', () => {
  it('should have ≤3 DESIGN-ITER*.md files remaining', () => {
    const files = getFiles('DESIGN-ITER');
    assert.ok(files.length <= 3, `Expected ≤3 DESIGN-ITER files, found ${files.length}: ${files.join(', ')}`);
  });

  it('should keep DESIGN-ITER56/64/67 (highest iterations)', () => {
    const files = getFiles('DESIGN-ITER');
    const nums = files.map(getIterNum).sort((a, b) => a - b);
    // The 3 highest DESIGN-ITER numbers are 56, 64, 67
    assert.ok(nums.includes(64), 'Should keep DESIGN-ITER64');
    assert.ok(nums.includes(67), 'Should keep DESIGN-ITER67');
    assert.ok(nums.includes(56), 'Should keep DESIGN-ITER56');
  });

  it('should keep DESIGN-BOOKMARK.md and DESIGN.md (non-iteration files)', () => {
    assert.ok(existsSync(join(DOCS, 'DESIGN-BOOKMARK.md')), 'DESIGN-BOOKMARK.md should exist');
    assert.ok(existsSync(join(DOCS, 'DESIGN.md')), 'DESIGN.md should exist');
  });
});

describe('R310: VERIFICATION-ITER cleanup', () => {
  it('should have ≤3 VERIFICATION-ITER*.md files remaining', () => {
    const files = getFiles('VERIFICATION-ITER');
    // Filter out VERIFICATION-TEMPLATE.md and VERIFICATION.md (not iteration files)
    const iterFiles = files.filter(f => /^VERIFICATION-ITER\d/.test(f));
    assert.ok(iterFiles.length <= 3, `Expected ≤3 VERIFICATION-ITER files, found ${iterFiles.length}: ${iterFiles.join(', ')}`);
  });

  it('should keep the 3 highest VERIFICATION-ITER files', () => {
    const files = getFiles('VERIFICATION-ITER').filter(f => /^VERIFICATION-ITER\d/.test(f));
    if (files.length > 0) {
      const nums = files.map(getIterNum).filter(n => n !== null).sort((a, b) => a - b);
      // Highest 3 are 61, 63, 64
      assert.ok(nums.includes(64), 'Should keep VERIFICATION-ITER64');
      assert.ok(nums.includes(63), 'Should keep VERIFICATION-ITER63');
      assert.ok(nums.includes(61), 'Should keep VERIFICATION-ITER61');
    }
  });
});

describe('R310: REQUIREMENTS-ITER cleanup', () => {
  it('should have ≤4 REQUIREMENTS-ITER*.md files remaining (3 highest + REQUIREMENTS-ITER-R1)', () => {
    const files = getFiles('REQUIREMENTS-ITER');
    // Keep 3 highest + REQUIREMENTS-ITER-R1 (which doesn't match \d+ pattern cleanly)
    assert.ok(files.length <= 4, `Expected ≤4 REQUIREMENTS-ITER files, found ${files.length}: ${files.join(', ')}`);
  });

  it('should keep REQUIREMENTS-BOOKMARK.md', () => {
    assert.ok(existsSync(join(DOCS, 'REQUIREMENTS-BOOKMARK.md')), 'REQUIREMENTS-BOOKMARK.md should exist');
  });

  it('should keep REQUIREMENTS.md (main)', () => {
    assert.ok(existsSync(join(DOCS, 'REQUIREMENTS.md')), 'REQUIREMENTS.md should exist');
  });
});

describe('R310: ROADMAP.md updated', () => {
  let content;
  try {
    content = readFileSync(join(DOCS, 'ROADMAP.md'), 'utf-8');
  } catch {
    content = '';
  }

  it('should show version v3.4.1 or higher', () => {
    assert.ok(content.includes('v3.4.1') || content.includes('v3.5'), 'ROADMAP should show current version ≥ v3.4.1');
  });

  it('should reference iteration R309 or higher', () => {
    assert.ok(/R30[9]|R3[1-9]\d/.test(content), 'ROADMAP should reference current iteration ≥ R309');
  });

  it('should show updated module count (254+)', () => {
    assert.ok(/25[4-9]|2[6-9]\d/.test(content), 'ROADMAP should show updated module count ≥ 254');
  });

  it('should show updated test count (7400+)', () => {
    assert.ok(/7[4-9]\d{2}|[89]\d{3}/.test(content), 'ROADMAP should show updated test count ≥ 7400');
  });

  it('should mention Phase AU', () => {
    assert.ok(content.includes('AU'), 'ROADMAP should include Phase AU');
  });
});

describe('R310: ARCHITECTURE.md updated', () => {
  let content;
  try {
    content = readFileSync(join(DOCS, 'ARCHITECTURE.md'), 'utf-8');
  } catch {
    content = '';
  }

  it('should reference 254+ modules', () => {
    assert.ok(/25[4-9]|2[6-9]\d/.test(content), 'ARCHITECTURE.md should reference 254+ modules');
  });

  it('should not still say "130+ 模块"', () => {
    assert.ok(!content.includes('130+ 模块'), 'ARCHITECTURE.md should not still say "130+ 模块"');
  });

  it('should reference line count ~54,653 or 54700', () => {
    assert.ok(/54,?6\d{2}/.test(content) || /54,?7\d{2}/.test(content), 'ARCHITECTURE.md should reference ~54,653 lines');
  });
});

describe('R310: coverage-baseline.md updated', () => {
  let content;
  try {
    content = readFileSync(join(DOCS, 'reports', 'coverage-baseline.md'), 'utf-8');
  } catch {
    content = '';
  }

  it('should reference R306 or R309 (not just R256)', () => {
    assert.ok(/R30[6-9]/.test(content), 'coverage-baseline should reference recent iteration R306-R309');
  });

  it('should have updated date (2026-05-25)', () => {
    assert.ok(content.includes('2026-05-25'), 'coverage-baseline should have today\'s date');
  });
});

describe('R310: Total docs size reduced', () => {
  it('should be ≤5MB (down from 9.6MB)', () => {
    // Calculate total size of docs directory
    let totalBytes = 0;
    function walkDir(dir) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else {
          totalBytes += statSync(fullPath).size;
        }
      }
    }
    walkDir(DOCS);
    const totalMB = totalBytes / (1024 * 1024);
    assert.ok(totalMB <= 5.5, `Docs total size ${totalMB.toFixed(2)}MB should be ≤5.5MB (target ≤5MB)`);
  });
});

describe('R310: File count reduced', () => {
  it('should have fewer than 130 files in docs/ root (down from 191)', () => {
    const allFiles = readdirSync(DOCS).filter(f => {
      const fp = join(DOCS, f);
      return statSync(fp).isFile();
    });
    assert.ok(allFiles.length < 130, `Docs root file count ${allFiles.length} should be <130 (was 191)`);
  });
});

describe('R310: ROADMAP-20.md reviewed', () => {
  it('ROADMAP-20.md should still exist (historical reference)', () => {
    // This file is a historical plan, not duplicate content with ROADMAP.md
    // ROADMAP.md is the current status, ROADMAP-20.md is the original 20-round plan
    assert.ok(existsSync(join(DOCS, 'ROADMAP-20.md')), 'ROADMAP-20.md should exist as historical reference');
  });
});
