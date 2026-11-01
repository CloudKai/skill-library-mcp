import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, access, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFixtureLibrary } from './fixture-library.mjs';
import { SkillLibrary } from '../dist/library/skill-library.js';
import { startHttp } from '../dist/http.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-release-'));
  const directory = path.join(root, 'library');
  const projectRoot = path.join(root, 'project');
  await createFixtureLibrary(directory);
  await mkdir(projectRoot);
  const listener = await startHttp(await SkillLibrary.load(directory), 0);
  const base = `http://127.0.0.1:${listener.address().port}`;
  const state = await fetch(`${base}/api/state`).then(r => r.json());
  const headers = { 'Content-Type': 'application/json', 'X-Skill-Library-Token': state.csrf_token };
  const request = (url, body, method = 'POST') => fetch(base + url, { method, headers, body: JSON.stringify(body) });
  const project = await (await request('/api/projects', { name: 'Release fixture', path: projectRoot })).json();
  return { root, directory, projectRoot, base, project, request, async close() { await new Promise(resolve => listener.close(resolve)); await rm(root, { recursive: true, force: true }); } };
}

test('native preview names exact filesystem effects without creating destination folders', async () => {
  const f = await fixture();
  try {
    const response = await f.request(`/api/projects/${f.project.id}/native/preview`, { skill_id: 'fixture/research', root: f.projectRoot, targets: ['codex'], enabled: true, expected_revision: f.project.revision });
    assert.equal(response.status, 200);
    const plan = await response.json();
    assert.equal(plan.can_apply, true);
    assert.equal(plan.changes[0].action, 'add');
    assert.equal(plan.changes[0].path, path.join(await realpath(f.projectRoot), '.agents/skills/research'));
    assert.equal(await access(path.join(f.projectRoot, '.agents')).then(() => true, () => false), false);
  } finally { await f.close(); }
});

test('project rename rejects stale writes and archiving removes availability while retaining a restorable profile', async () => {
  const f = await fixture();
  try {
    const renamedResponse = await f.request(`/api/projects/${f.project.id}`, { name: 'Renamed fixture', expected_revision: f.project.revision }, 'PATCH');
    assert.equal(renamedResponse.status, 200);
    const renamed = await renamedResponse.json();
    assert.equal(renamed.name, 'Renamed fixture');
    assert.equal((await f.request(`/api/projects/${f.project.id}`, { name: 'Stale', expected_revision: f.project.revision }, 'PATCH')).status, 409);
    const archivedResponse = await f.request(`/api/projects/${f.project.id}`, { archived: true, expected_revision: renamed.revision }, 'PATCH');
    assert.equal(archivedResponse.status, 200);
    const archived = await archivedResponse.json();
    assert.equal(archived.archived, true);
    assert.deepEqual(archived.enabled_skills, []);
    const state = await fetch(f.base + '/api/state').then(r => r.json());
    assert.equal(state.projects.find(p => p.id === f.project.id).archived, true);
    const restored = await f.request(`/api/projects/${f.project.id}`, { archived: false, expected_revision: archived.revision }, 'PATCH');
    assert.equal((await restored.json()).archived, false);
  } finally { await f.close(); }
});

test('portable backup restores packages and selections as new profiles without native bindings', async () => {
  const source = await fixture(), destination = await fixture();
  try {
    await source.request(`/api/projects/${source.project.id}/skills`, { skill_id: 'fixture/research', enabled: true, expected_revision: source.project.revision }, 'PATCH');
    const exported = await source.request('/api/backup', {});
    assert.equal(exported.status, 200);
    const backup = await exported.json();
    assert.equal(backup.version, 1);
    const preview = await destination.request('/api/restore/preview', { backup });
    assert.equal(preview.status, 200);
    const plan = await preview.json();
    assert.equal(plan.packages_to_add, 0);
    const restoredResponse = await destination.request('/api/restore', { plan_id: plan.plan_id });
    assert.equal(restoredResponse.status, 200);
    const state = await fetch(destination.base + '/api/state').then(r => r.json());
    const restored = state.projects.find(p => p.id !== destination.project.id);
    assert.deepEqual(restored.enabled_skills, ['fixture/research']);
    assert.equal(restored.path, '');
    assert.deepEqual(restored.native_bindings, []);
    const againPlan = await (await destination.request('/api/restore/preview', { backup })).json();
    await destination.request('/api/restore', { plan_id: againPlan.plan_id });
    assert.equal((await fetch(destination.base + '/api/state').then(r => r.json())).projects.length, 2);
  } finally { await source.close(); await destination.close(); }
});

test('curator notes support Unicode task search through scoped MCP without exposing disabled skills', async () => {
  const f = await fixture();
  const client = new Client({ name: 'release-search', version: '1' });
  try {
    const state = await fetch(f.base + '/api/state').then(r => r.json());
    const edit = await f.request('/api/skills/metadata', { skill_id: 'fixture/research', expected_catalog_revision: state.catalog_revision, personal_notes: '排查生产故障', preferred: true, tags: ['排查'] }, 'PATCH');
    assert.equal(edit.status, 200);
    await f.request(`/api/projects/${f.project.id}/skills`, { skill_id: 'fixture/research', enabled: true, expected_revision: f.project.revision }, 'PATCH');
    await client.connect(new StreamableHTTPClientTransport(new URL(f.base + `/mcp?project=${f.project.id}`)));
    const result = await client.callTool({ name: 'search_skills', arguments: { query: '排查' } });
    assert.deepEqual(result.structuredContent.matches.map(s => s.skill_id), ['fixture/research']);
  } finally { await client.close(); await f.close(); }
});

test('local status retains redacted operation outcomes without profile names or paths', async () => {
  const f = await fixture();
  try {
    await f.request(`/api/projects/${f.project.id}`, { name: 'Private fixture title', expected_revision: f.project.revision }, 'PATCH');
    const response = await fetch(f.base + '/api/status');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'ready');
    assert.equal(result.skills, 4);
    assert.ok(result.bytes > 0);
    assert.equal(result.operations.at(-1).action, 'project.edit');
    assert.equal(result.operations.at(-1).status, 'succeeded');
    assert.ok(!JSON.stringify(result.operations).includes('Private fixture title'));
    assert.ok(!JSON.stringify(result.operations).includes(f.projectRoot));
  } finally { await f.close(); }
});

test('invalid interrupted-operation journals fail closed with a recovery error at startup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-recovery-'));
  try {
    await createFixtureLibrary(root);
    await writeFile(path.join(root, 'native-transaction.json'), '{broken');
    await assert.rejects(startHttp(await SkillLibrary.load(root), 0), { code: 'RECOVERY_REQUIRED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('optional HTTP MCP access token rejects anonymous clients and stays out of public state', async () => {
  const before = process.env.SKILL_LIBRARY_HTTP_TOKEN;
  const token = 'c'.repeat(64);
  process.env.SKILL_LIBRARY_HTTP_TOKEN = token;
  let f;
  try { f = await fixture(); } finally { if (before === undefined) delete process.env.SKILL_LIBRARY_HTTP_TOKEN; else process.env.SKILL_LIBRARY_HTTP_TOKEN = before; }
  const client = new Client({ name: 'authorized-http', version: '1' });
  try {
    const rejected = await fetch(f.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(rejected.status, 401);
    assert.ok(!JSON.stringify(await fetch(f.base + '/api/state').then(r => r.json())).includes(token));
    await client.connect(new StreamableHTTPClientTransport(new URL(f.base + `/mcp?project=${f.project.id}`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    assert.deepEqual((await client.callTool({ name: 'list_skills', arguments: {} })).structuredContent.skills, []);
  } finally { await client.close(); await f.close(); }
});

test('undoing a project selection requires its exact latest revision', async () => {
  const f = await fixture();
  try {
    const enabled = await (await f.request(`/api/projects/${f.project.id}/skills`, { skill_id: 'fixture/research', enabled: true, expected_revision: f.project.revision }, 'PATCH')).json();
    assert.equal((await f.request(`/api/projects/${f.project.id}/selection`, { enabled_skills: [], expected_revision: f.project.revision })).status, 409);
    const undo = await f.request(`/api/projects/${f.project.id}/selection`, { enabled_skills: [], expected_revision: enabled.revision });
    assert.equal(undo.status, 200);
    assert.deepEqual((await undo.json()).enabled_skills, []);
  } finally { await f.close(); }
});

test('backup restore preserves private starter metadata overrides', async () => {
  const source = await fixture(), destination = await fixture();
  try {
    const state = await fetch(source.base + '/api/state').then(r => r.json());
    assert.equal((await source.request('/api/skills/metadata', { skill_id: 'fixture/research', expected_catalog_revision: state.catalog_revision, personal_notes: 'Saved recovery note', preferred: true, tags: ['recovery'] }, 'PATCH')).status, 200);
    const backup = await (await source.request('/api/backup', {})).json();
    const plan = await (await destination.request('/api/restore/preview', { backup })).json();
    assert.equal((await destination.request('/api/restore', { plan_id: plan.plan_id })).status, 200);
    const loaded = await SkillLibrary.load(destination.directory);
    const entry = loaded.exportPackage('fixture/research').entry;
    assert.equal(entry.personal_notes, 'Saved recovery note');
    assert.equal(entry.preferred, true);
    assert.deepEqual(entry.tags, ['recovery']);
  } finally { await source.close(); await destination.close(); }
});

test('curator metadata can change while native copies remain enabled', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request(`/api/projects/${f.project.id}/native`, { skill_id: 'fixture/research', root: f.projectRoot, targets: ['codex'], enabled: true, expected_revision: f.project.revision }, 'PATCH')).status, 200);
    const state = await fetch(f.base + '/api/state').then(r => r.json());
    const edited = await f.request('/api/skills/metadata', { skill_id: 'fixture/research', expected_catalog_revision: state.catalog_revision, personal_notes: 'Still enabled' }, 'PATCH');
    assert.equal(edited.status, 200);
    await access(path.join(f.projectRoot, '.agents/skills/research/SKILL.md'));
  } finally { await f.close(); }
});

test('a fresh source catalog starts an empty owner app with working MCP discovery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'empty-source-library-'));
  let listener;
  const client = new Client({ name: 'empty-library', version: '1' });
  try {
    const { readFile } = await import('node:fs/promises');
    await writeFile(path.join(root, 'catalog.json'), await readFile(new URL('../library/catalog.json', import.meta.url)));
    const library = await SkillLibrary.load(root);
    assert.equal(library.stats().skills, 0);
    listener = await startHttp(library, 0);
    const base = `http://127.0.0.1:${listener.address().port}`;
    const state = await fetch(base + '/api/state').then(r => r.json());
    assert.deepEqual(state.skills, []);
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
    assert.equal((await client.listTools()).tools.length, 4);
    assert.deepEqual((await client.callTool({ name: 'list_skills', arguments: {} })).structuredContent.skills, []);
  } finally { await client.close(); if (listener) await new Promise(resolve => listener.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

test('local demo is isolated from real skills, projects and writes', async () => {
 const f = await fixture();
 try {
  const before = await fetch(f.base+'/api/state').then(r=>r.json());
  assert.ok(before.skills.every(s=>s.skill_id.startsWith('fixture/')));
  const sample = await fetch(f.base+'/demo/api/state').then(r=>r.json());
  assert.equal(sample.mode,'demo');assert.ok(sample.skills.every(s=>s.skill_id.startsWith('demo/')));
  assert.equal((await fetch(f.base+'/demo/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(f.base+'/demo/api/skill?id=fixture/research')).status,503);
  const after = await fetch(f.base+'/api/state').then(r=>r.json());
  assert.deepEqual(after.projects,before.projects);assert.deepEqual(after.skills,before.skills);
 } finally {await f.close();}
});
