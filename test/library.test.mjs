import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SkillLibrary, hash } from '../dist/library.js';
import { callTool } from '../dist/server.js';

let root, library;
const main = '---\nname: example\ndescription: Investigate reproducible debugging failures.\n---\n\nRead references/checklist.md.\n';
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'skill-library-test-'));
  await mkdir(path.join(root, 'packages/example/references'), { recursive: true });
  await writeFile(path.join(root, 'packages/example/SKILL.md'), main);
  await writeFile(path.join(root, 'packages/example/references/checklist.md'), 'Reproduce first.\n');
  await writeFile(path.join(root, 'packages/example/asset.bin'), Buffer.from([0, 255, 128]));
  await writeFile(path.join(root, 'catalog.json'), JSON.stringify({ version: 1, skills: [{ skill_id: 'owner/example', package: 'packages/example', tags: ['debugging'], preferred: true, status: 'active', personal_notes: 'My preferred debugger', requirements: ['shell'], source: { url: 'local:fixture', path: 'example' } }] }));
  library = await SkillLibrary.load(root);
});
after(async () => { await rm(root, { recursive: true, force: true }); });

test('progressive retrieval returns metadata, then exact instructions and manifested bytes', () => {
  const listed = library.list({});
  assert.equal(listed.skills.length, 1);
  assert.equal('instructions' in listed.skills[0], false);
  const skill = library.get('owner/example');
  assert.equal(skill.instructions, main);
  const file = library.read(skill.skill_id, skill.revision, 'references/checklist.md');
  assert.equal(file.content, 'Reproduce first.\n');
  assert.equal(file.sha256, hash(Buffer.from(file.content)));
  assert.equal(skill.manifest.length, 3);
});

test('search can return no matches and distinguishes unknown and missing capabilities', () => {
  assert.deepEqual(library.search({ query: 'astronomy orbital telescope' }).matches, []);
  assert.equal(library.search({ query: 'debugging' }).matches[0].compatibility, 'unknown');
  const missing = library.search({ query: 'debugging', capabilities: [] }).matches[0];
  assert.equal(missing.compatibility, 'missing_requirements');
  assert.deepEqual(missing.missing_requirements, ['shell']);
  assert.equal(library.search({ query: 'debugging', capabilities: ['shell'] }).matches[0].compatibility, 'compatible');
});

test('supporting files cannot escape the manifest or mix revisions', () => {
  const { revision } = library.get('owner/example');
  for (const p of ['../catalog.json', '/etc/passwd', 'references/../SKILL.md', 'references\\checklist.md']) {
    assert.throws(() => library.read('owner/example', revision, p), { code: 'INVALID_PATH' });
  }
  assert.throws(() => library.read('owner/example', revision, 'missing.md'), { code: 'FILE_NOT_FOUND' });
  assert.throws(() => library.read('owner/example', 'wrong-version', 'SKILL.md'), { code: 'REVISION_NOT_FOUND' });
});

test('binary assets retain exact bytes via base64', () => {
  const { revision } = library.get('owner/example');
  const result = library.read('owner/example', revision, 'asset.bin');
  assert.equal(result.encoding, 'base64');
  assert.deepEqual(Buffer.from(result.content, 'base64'), Buffer.from([0, 255, 128]));
});

test('invalid tool arguments are actionable errors', () => {
  for (const input of [{ query: '' }, { query: 'debug', limit: 999 }, { query: 'debug', unexpected: true }]) {
    const result = callTool(library, 'search_skills', input);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'INVALID_INPUT');
  }
});

test('snapshot reads stay stable even when source files change', async () => {
  const original = library.get('owner/example');
  const p = path.join(root, 'packages/example/references/checklist.md');
  await writeFile(p, 'Changed after startup.\n');
  assert.equal(library.read('owner/example', original.revision, 'references/checklist.md').content, 'Reproduce first.\n');
  const reloaded = await SkillLibrary.load(root);
  assert.notEqual(reloaded.get('owner/example').revision, original.revision);
  await writeFile(p, 'Reproduce first.\n');
});

test('archived skills disappear from discovery and retrieval', async () => {
  const p = path.join(root, 'catalog.json');
  const original = await readFile(p, 'utf8');
  const edited = JSON.parse(original);
  edited.skills[0].status = 'archived';
  await writeFile(p, JSON.stringify(edited));
  const archived = await SkillLibrary.load(root);
  assert.equal(archived.list({}).skills.length, 0);
  assert.equal(archived.search({ query: 'debugging' }).matches.length, 0);
  assert.throws(() => archived.get('owner/example'), { code: 'ARCHIVED_SKILL' });
  await writeFile(p, original);
});

test('symlinked files are rejected when loading a package', async () => {
  const link = path.join(root, 'packages/example/escape');
  await symlink(path.join(root, 'catalog.json'), link);
  try { await assert.rejects(SkillLibrary.load(root), { code: 'INVALID_PATH' }); }
  finally { await rm(link); }
});

test('local import copies complete packages and rejects duplicate IDs', async () => {
  const importedRoot = await mkdtemp(path.join(os.tmpdir(), 'skill-import-test-'));
  try {
    await writeFile(path.join(importedRoot, 'catalog.json'), JSON.stringify({ version: 1, skills: [] }));
    const run = () => spawnSync(process.execPath, ['dist/import.js', '--from', path.join(root, 'packages/example'), '--id', 'new/example', '--tags', 'debugging'], { cwd: process.cwd(), env: { ...process.env, SKILL_LIBRARY_DIR: importedRoot }, encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const imported = await SkillLibrary.load(importedRoot);
    assert.equal(imported.get('new/example').manifest.length, 3);
    assert.deepEqual(JSON.parse(await readFile(path.join(importedRoot, 'catalog.json'), 'utf8')).skills, []);
    assert.equal(JSON.parse(await readFile(path.join(importedRoot, '.local/catalog.json'), 'utf8')).skills.length, 1);
    assert.notEqual(run().status, 0);
    assert.equal((await SkillLibrary.load(importedRoot)).stats().skills, 1);
  } finally { await rm(importedRoot, { recursive: true, force: true }); }
});

test('cursors are bound to filters and catalog snapshots', async () => {
  const seeded = await SkillLibrary.load();
  const page1 = seeded.list({ limit: 1 });
  assert.ok(page1.next_cursor);
  const page2 = seeded.list({ limit: 1, cursor: page1.next_cursor });
  assert.notEqual(page1.skills[0].skill_id, page2.skills[0].skill_id);
  assert.throws(() => seeded.list({ tags: ['research'], cursor: page1.next_cursor }), { code: 'CURSOR_EXPIRED' });
  assert.throws(() => library.list({ cursor: page1.next_cursor }), { code: 'CURSOR_EXPIRED' });
  assert.throws(() => seeded.list({ cursor: 'not-a-cursor' }), { code: 'CURSOR_EXPIRED' });
});
