/**
 * R159: ESLint 警告清零 — 验证 0 errors / 0 warnings
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

describe('R159: ESLint 0 warnings', () => {
  it('npm run lint produces 0 errors and 0 warnings', () => {
    let output = '';
    let exitCode = 0;
    try {
      output = execSync('npm run lint 2>&1', {
        cwd: new URL('..', import.meta.url).pathname,
        encoding: 'utf-8',
      });
    } catch (err) {
      output = err.stdout || err.stderr || '';
      exitCode = err.status ?? 1;
    }
    // Extract summary line
    const summaryMatch = output.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);
    assert.ok(summaryMatch, `Could not parse ESLint output:\n${output}`);
    const errors = parseInt(summaryMatch[2], 10);
    const warnings = parseInt(summaryMatch[3], 10);
    assert.equal(errors, 0, `Expected 0 errors, got ${errors}`);
    assert.equal(warnings, 0, `Expected 0 warnings, got ${warnings}`);
  });
});
