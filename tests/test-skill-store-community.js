// tests/test-skill-store-community.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVersion, compareVersions, isNewerVersion, isVersionCompatible, SkillCommunityHub } from '../lib/skill-store-community.js';

// Utility to create a mock fetch response
function mockResponse(json, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => json,
  };
}

// Base64 encode helper
function b64(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

test('parseVersion should split version strings correctly', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion('10.0'), { major: 10, minor: 0, patch: 0 });
  assert.deepEqual(parseVersion('5'), { major: 5, minor: 0, patch: 0 });
  assert.deepEqual(parseVersion(''), { major: 0, minor: 0, patch: 0 });
});

test('compareVersions should compare correctly', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
});

test('isNewerVersion should detect newer versions', () => {
  assert.equal(isNewerVersion('2.0.0', '1.5.0'), true);
  assert.equal(isNewerVersion('1.0.0', '1.0.1'), false);
});

test('isVersionCompatible should verify minimum version', () => {
  assert.equal(isVersionCompatible('1.5.0', '1.4.0'), true);
  assert.equal(isVersionCompatible('1.3.0', '1.4.0'), false);
});

test('SkillCommunityHub fetchFromGitHub returns files and manifest', async () => {
  // Mock fetch that returns expected files for required list
  const mockFetch = async (url) => {
    const name = url.split('/').pop().split('?')[0];
    const contentMap = {
      'SKILL.md': '---\ntitle: TestSkill\nversion: 1.0.0\n---\n# Skill',
      'main.js': 'export default {}',
      'README.md': '# Readme',
    };
    if (contentMap[name]) {
      return mockResponse({ encoding: 'base64', content: b64(contentMap[name]) });
    }
    // optional test.js not present -> 404
    return mockResponse({ message: 'Not Found' }, false, 404);
  };

  const hub = new SkillCommunityHub({ fetch: mockFetch, githubApiBase: 'https://api.github.com' });
  const result = await hub.fetchFromGitHub('owner/repo', { branch: 'main', path: '' });
  // Verify required files are present
  const names = result.files.map(f => f.name).sort();
  assert.deepEqual(names, ['README.md', 'SKILL.md', 'main.js']);
  // Manifest frontmatter extraction is delegated to parseSkillManifest – we just ensure it's defined
  assert.ok(result.manifest);
});

test('SkillCommunityHub fetchFromGitHub throws on invalid repo format', async () => {
  const hub = new SkillCommunityHub({ fetch: async () => mockResponse({}) });
  await assert.rejects(() => hub.fetchFromGitHub('invalidrepo'), /Invalid repo format/);
});

test('SkillCommunityHub fetchFromGitHub propagates 404 for missing required file', async () => {
  const mockFetch = async (url) => {
    const name = url.split('/').pop().split('?')[0];
    if (name === 'SKILL.md') {
      return mockResponse({ message: 'Not Found' }, false, 404);
    }
    return mockResponse({ encoding: 'base64', content: b64('data') });
  };
  const hub = new SkillCommunityHub({ fetch: mockFetch });
  await assert.rejects(() => hub.fetchFromGitHub('owner/repo'), /File not found: SKILL.md/);
});
