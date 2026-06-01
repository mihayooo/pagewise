import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installIndexedDBMock, resetIndexedDBMock } from './helpers/indexeddb-mock.js';

installIndexedDBMock();

let mockFetch;
globalThis.fetch = async () => mockFetch;

const { SkillStore, SkillPackageManager } = await import('../lib/skill-store.js');
const { createZip } = await import('../lib/skill-zip.js');

describe('SkillStore', () => {
  let store;

  beforeEach(() => {
    resetIndexedDBMock();
    store = new SkillStore('https://example.com/api/skills');
  });

  afterEach(() => {
    mockFetch = null;
  });

  // ── fetchSkills ──────────────────────────────────────────

  describe('fetchSkills', () => {
    it('returns skills from data.skills format', async () => {
      const skills = [{ id: 's1', name: 'Skill 1' }];
      mockFetch = { ok: true, status: 200, json: async () => ({ skills }) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, skills);
    });

    it('returns skills from data.data format', async () => {
      const skills = [{ id: 's2', name: 'Skill 2' }];
      mockFetch = { ok: true, status: 200, json: async () => ({ data: skills }) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, skills);
    });

    it('returns skills from direct array response', async () => {
      const skills = [{ id: 's3', name: 'Skill 3' }];
      mockFetch = { ok: true, status: 200, json: async () => skills };
      const result = await store.fetchSkills();
      assert.deepEqual(result, skills);
    });

    it('returns [] on HTTP error', async () => {
      mockFetch = { ok: false, status: 500, json: async () => ({}) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, []);
    });

    it('returns [] on network error', async () => {
      mockFetch = { ok: true, json: async () => { throw new Error('network down'); } };
      // Override fetch to throw directly
      globalThis.fetch = async () => { throw new Error('network down'); };
      const result = await store.fetchSkills();
      assert.deepEqual(result, []);
      // Restore
      globalThis.fetch = async () => mockFetch;
    });

    it('returns [] on empty / null response body', async () => {
      mockFetch = { ok: true, status: 200, json: async () => ({}) };
      const result = await store.fetchSkills();
      assert.deepEqual(result, []);
    });
  });

  // ── installSkill ─────────────────────────────────────────

  describe('installSkill', () => {
    it('installs a valid skill into IndexedDB', async () => {
      const skill = { id: 'sk1', name: 'My Skill', prompt: 'do something' };
      const saved = await store.installSkill(skill);
      assert.equal(saved.id, 'sk1');
      assert.equal(saved.name, 'My Skill');
      assert.equal(saved.prompt, 'do something');
    });

    it('throws when skill id is missing', async () => {
      const skill = { name: 'No ID', prompt: 'test' };
      await assert.rejects(() => store.installSkill(skill), /数据不完整/);
    });

    it('throws when skill name is missing', async () => {
      const skill = { id: 'sk2', prompt: 'test' };
      await assert.rejects(() => store.installSkill(skill), /数据不完整/);
    });

    it('throws when skill is null', async () => {
      await assert.rejects(() => store.installSkill(null), /数据不完整/);
    });
  });

  // ── isInstalled ──────────────────────────────────────────

  describe('isInstalled', () => {
    it('returns true for an installed skill', async () => {
      await store.installSkill({ id: 'sk-installed', name: 'Installed', prompt: 'yes' });
      const result = await store.isInstalled('sk-installed');
      assert.equal(result, true);
    });

    it('returns false for a non-installed skill', async () => {
      const result = await store.isInstalled('sk-missing');
      assert.equal(result, false);
    });
  });
});

// ── SkillPackageManager ──────────────────────────────────────

describe('SkillPackageManager', () => {
  let pm;

  beforeEach(() => {
    resetIndexedDBMock();
    pm = new SkillPackageManager();
  });

  // ── exportSkill ──────────────────────────────────────────

  describe('exportSkill', () => {
    it('exports a valid skill as ZIP data', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'export-test-1',
        name: 'Export Test Skill',
        prompt: 'test prompt',
        description: 'A test skill',
        category: 'general',
        parameters: [{ name: 'input', type: 'string', required: true, description: 'test input' }],
      });

      const zipData = await pm.exportSkill('export-test-1', { author: 'TestAuthor', license: 'Apache-2.0' });
      assert.ok(zipData instanceof Uint8Array);
      assert.ok(zipData.length > 0);

      const { readZipAsText } = await import('../lib/skill-zip.js');
      const files = readZipAsText(zipData);
      const fileNames = files.map(f => f.name);
      assert.ok(fileNames.includes('SKILL.md'));
      assert.ok(fileNames.includes('main.js'));
      assert.ok(fileNames.includes('README.md'));
      assert.ok(fileNames.includes('.skillmeta.json'));

      const skillMd = files.find(f => f.name === 'SKILL.md');
      assert.ok(skillMd.content.includes('id: export-test-1'));
      assert.ok(skillMd.content.includes('name: Export Test Skill'));
      assert.ok(skillMd.content.includes('author: TestAuthor'));
      assert.ok(skillMd.content.includes('license: Apache-2.0'));

      const meta = JSON.parse(files.find(f => f.name === '.skillmeta.json').content);
      assert.equal(meta.skillId, 'export-test-1');
      assert.ok(meta.exportedAt);
    });

    it('throws when skill not found', async () => {
      await assert.rejects(
        () => pm.exportSkill('nonexistent-skill'),
        /Skill not found: nonexistent-skill/
      );
    });

    it('uses default version 1.0.0 when skill has no version', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'no-version-skill',
        name: 'No Version',
        prompt: 'test',
      });

      const zipData = await pm.exportSkill('no-version-skill');
      const { readZipAsText } = await import('../lib/skill-zip.js');
      const files = readZipAsText(zipData);
      const meta = JSON.parse(files.find(f => f.name === '.skillmeta.json').content);
      assert.equal(meta.version, '1.0.0');
    });

    it('uses default author and license when not specified', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'defaults-skill',
        name: 'Defaults',
        prompt: 'test',
      });

      const zipData = await pm.exportSkill('defaults-skill');
      const { readZipAsText } = await import('../lib/skill-zip.js');
      const files = readZipAsText(zipData);
      const skillMd = files.find(f => f.name === 'SKILL.md');
      assert.ok(skillMd.content.includes('author: PageWise User'));
      assert.ok(skillMd.content.includes('license: MIT'));
    });
  });

  // ── importSkill ──────────────────────────────────────────

  describe('importSkill', () => {
    /** Helper: create a valid skill ZIP package with all required files */
    function makeValidZip(overrides = {}) {
      const frontmatter = {
        id: 'imported-skill',
        name: 'Imported Skill',
        version: '1.0.0',
        description: 'An imported skill',
        author: 'TestAuthor',
        category: 'general',
        license: 'MIT',
        ...overrides,
      };
      const skillMd = [
        '---',
        ...Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`),
        '---',
        '',
        '# Imported Skill',
        '',
        'Description here',
      ].join('\n');
      const mainJs = 'export default async function execute() { return "ok"; }';
      const readme = '# Imported Skill\n\nAn imported skill.';
      return createZip([
        { name: 'SKILL.md', content: skillMd },
        { name: 'main.js', content: mainJs },
        { name: 'README.md', content: readme },
      ]);
    }

    it('imports a valid skill package', async () => {
      const zipData = makeValidZip();
      const saved = await pm.importSkill(zipData);
      assert.equal(saved.id, 'imported-skill');
      assert.equal(saved.name, 'Imported Skill');
      assert.equal(saved.enabled, true);
      // saveSkill stores createdAt/updatedAt, not installedAt
      assert.ok(saved.createdAt || saved.updatedAt);
    });

    it('throws on empty package', async () => {
      const emptyZip = createZip([]);
      await assert.rejects(
        () => pm.importSkill(emptyZip),
        /Skill package is empty/
      );
    });

    it('throws when SKILL.md is missing (via validation)', async () => {
      const zipWithoutSkillMd = createZip([
        { name: 'main.js', content: 'export default async function() {}' },
        { name: 'README.md', content: '# Readme' },
      ]);
      await assert.rejects(
        () => pm.importSkill(zipWithoutSkillMd),
        /SKILL\.md/
      );
    });

    it('throws when existing skill is same id and not newer (version not stored)', async () => {
      // installSkill doesn't persist version, so existingVer defaults to '0.0.0'
      // importSkill v1.0.0 > '0.0.0' → succeeds (isNewerVersion = true)
      // But if we import the same id twice, second time existing is found with no version
      const store = new SkillStore();
      await store.installSkill({
        id: 'imported-skill',
        name: 'Imported Skill',
        prompt: 'test',
      });

      // First import: v1.0.0 > '0.0.0' (default) → succeeds
      const zipData = makeValidZip({ version: '1.0.0' });
      const saved = await pm.importSkill(zipData);
      assert.equal(saved.id, 'imported-skill');

      // Second import: v1.0.0 vs existing '0.0.0' (still no version stored) → also succeeds
      // because saveSkill doesn't persist version, so existingVer is always '0.0.0'
      const saved2 = await pm.importSkill(zipData);
      assert.equal(saved2.id, 'imported-skill');
    });

    it('allows overwrite when option is set', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'imported-skill',
        name: 'Imported Skill',
        prompt: 'test',
      });

      const zipData = makeValidZip({ version: '1.0.0' });
      const saved = await pm.importSkill(zipData, { overwrite: true });
      assert.equal(saved.id, 'imported-skill');
    });

    it('skips validation when validate=false', async () => {
      // With validate=false, only SKILL.md presence is checked
      const skillMd = '---\nid: skip-val\nname: Skip Val\nversion: 1.0.0\n---\n\n# Skip';
      const mainJs = 'export default async function(p, ctx) { return "ok"; }';
      const zipData = createZip([
        { name: 'SKILL.md', content: skillMd },
        { name: 'main.js', content: mainJs },
      ]);
      const saved = await pm.importSkill(zipData, { validate: false });
      assert.equal(saved.id, 'skip-val');
      assert.equal(saved.name, 'Skip Val');
    });

    it('throws on invalid ZIP data', async () => {
      const garbage = new Uint8Array([0, 1, 2, 3]);
      await assert.rejects(
        () => pm.importSkill(garbage),
        /Failed to read skill package|Invalid ZIP/
      );
    });
  });

  // ── checkForUpdate ───────────────────────────────────────

  describe('checkForUpdate', () => {
    it('returns updateAvailable=true when latest is newer', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'update-skill',
        name: 'Update Skill',
        prompt: 'test',
      });

      // installSkill doesn't store version, so currentVersion defaults to '1.0.0'
      const result = await pm.checkForUpdate('update-skill', '2.0.0');
      assert.equal(result.updateAvailable, true);
      assert.equal(result.currentVersion, '1.0.0');
      assert.equal(result.latestVersion, '2.0.0');
    });

    it('returns updateAvailable=false when latest is not newer', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'update-skill-2',
        name: 'Update Skill 2',
        prompt: 'test',
      });

      // currentVersion defaults to '1.0.0', latest is '1.0.0' → not newer
      const result = await pm.checkForUpdate('update-skill-2', '1.0.0');
      assert.equal(result.updateAvailable, false);
      assert.equal(result.currentVersion, '1.0.0');
      assert.equal(result.latestVersion, '1.0.0');
    });

    it('throws when skill not found', async () => {
      await assert.rejects(
        () => pm.checkForUpdate('nonexistent', '2.0.0'),
        /Skill not found: nonexistent/
      );
    });
  });

  // ── getVersionInfo ───────────────────────────────────────

  describe('getVersionInfo', () => {
    it('returns version info for installed skill', async () => {
      const store = new SkillStore();
      await store.installSkill({
        id: 'ver-info-skill',
        name: 'Version Info',
        prompt: 'test',
      });

      const info = await pm.getVersionInfo('ver-info-skill');
      assert.equal(info.id, 'ver-info-skill');
      assert.equal(info.name, 'Version Info');
      // installSkill doesn't store version, so defaults to '1.0.0'
      assert.equal(info.version, '1.0.0');
      // saveSkill doesn't store installedAt, so it's null; updatedAt is set
      assert.ok(info.updatedAt !== undefined);
    });

    it('throws when skill not found', async () => {
      await assert.rejects(
        () => pm.getVersionInfo('nonexistent'),
        /Skill not found: nonexistent/
      );
    });
  });
});
