import { createFixtureLibrary } from './fixture-library.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SkillLibrary } from '../dist/library/skill-library.js';
import { ProjectStore } from '../dist/projects/project-store.js';
import { startHttp } from '../dist/http.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-project-test-'));
  await createFixtureLibrary(root);
  const library = await SkillLibrary.load(root);
  return { root, library, projects: new ProjectStore(library) };
}

test('projects persist independently and reject stale selection writes', async () => {
  const { root, library, projects } = await fixture();
  try {
    const a = await projects.create({ name: 'Project A', path: '/example/a' });
    const b = await projects.create({ name: 'Project B', path: '' });
    assert.deepEqual(a.enabled_skills, []);
    const updated = await projects.toggle(a.id, { skill_id: 'fixture/research', enabled: true, expected_revision: a.revision });
    assert.deepEqual((await new ProjectStore(library).get(a.id)).enabled_skills, ['fixture/research']);
    assert.deepEqual((await projects.get(b.id)).enabled_skills, []);
    await assert.rejects(projects.toggle(a.id, { skill_id: 'fixture/code-review', enabled: true, expected_revision: a.revision }), { code: 'REVISION_CONFLICT' });
    assert.notEqual(a.revision, updated.revision);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('disabled skills are absent from search/list and cannot be retrieved by ID or file', async () => {
  const { root, projects } = await fixture();
  try {
    const project = await projects.create({ name: 'Scoped', path: '' });
    const selected = await projects.toggle(project.id, { skill_id: 'fixture/research', enabled: true, expected_revision: project.revision });
    const scoped = await projects.scope(project.id);
    assert.deepEqual(scoped.list({}).skills.map(s => s.skill_id), ['fixture/research']);
    assert.equal(scoped.search({ query: 'debugging' }).matches.length, 0);
    assert.throws(() => scoped.get('fixture/diagnosing-bugs'), { code: 'SKILL_NOT_FOUND' });
    assert.throws(() => scoped.read('fixture/diagnosing-bugs', 'anything', 'SKILL.md'), { code: 'SKILL_NOT_FOUND' });
    await projects.toggle(project.id, { skill_id: 'fixture/research', enabled: false, expected_revision: selected.revision });
    assert.equal((await projects.scope(project.id)).list({}).skills.length, 0);
    await assert.rejects(projects.scope('missing-project'), { code: 'PROJECT_NOT_FOUND' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('folder activation changes all members atomically and preserves other folders', async () => {
  const { root } = await fixture();
  try {
    const catalogPath = path.join(root, 'catalog.json');
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    catalog.skills.find(s => s.skill_id === 'fixture/code-review').folder = 'Project skills';
    await writeFile(catalogPath, JSON.stringify(catalog));
    const library = await SkillLibrary.load(root);
    const projects = new ProjectStore(library);
    const project = await projects.create({ name: 'Folder test', path: '' });
    let updated = await projects.toggle(project.id, { skill_id: 'fixture/code-review', enabled: true, expected_revision: project.revision });
    updated = await projects.toggleFolder(project.id, { folder: 'Test collection', enabled: true, expected_revision: updated.revision });
    assert.equal(updated.enabled_skills.length, 3);
    const beforeDisable = updated.revision;
    updated = await projects.toggleFolder(project.id, { folder: 'Test collection', enabled: false, expected_revision: updated.revision });
    assert.deepEqual(updated.enabled_skills, ['fixture/code-review']);
    assert.deepEqual((await projects.scope(project.id)).list({}).skills.map(s => s.skill_id), ['fixture/code-review']);
    await assert.rejects(projects.toggleFolder(project.id, { folder: 'Test collection', enabled: true, expected_revision: beforeDisable }), { code: 'REVISION_CONFLICT' });
    await assert.rejects(projects.toggleFolder(project.id, { folder: 'Missing', enabled: true, expected_revision: updated.revision }), { code: 'FOLDER_NOT_FOUND' });
    assert.deepEqual((await projects.get(project.id)).enabled_skills, ['fixture/code-review']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('running stdio connection picks up project toggles without falling back to the full library', async () => {
  const { root, projects } = await fixture();
  const client = new Client({ name: 'scoped-stdio-test', version: '1.0.0' });
  try {
    const project = await projects.create({ name: 'Live connection', path: '' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/stdio.js', import.meta.url))], env: { ...process.env, SKILL_LIBRARY_DIR: root, SKILL_LIBRARY_PROJECT: project.id }, stderr: 'pipe' }));
    assert.equal((await client.callTool({ name: 'list_skills', arguments: {} })).structuredContent.skills.length, 0);
    const updated = await projects.toggle(project.id, { skill_id: 'fixture/research', enabled: true, expected_revision: project.revision });
    assert.equal((await client.callTool({ name: 'get_skill', arguments: { skill_id: 'fixture/research' } })).isError, undefined);
    await projects.toggle(project.id, { skill_id: 'fixture/research', enabled: false, expected_revision: updated.revision });
    const disabled = await client.callTool({ name: 'get_skill', arguments: { skill_id: 'fixture/research' } });
    assert.equal(disabled.isError, true);
    assert.equal(disabled.structuredContent.error.code, 'SKILL_NOT_FOUND');
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test('UI project API requires a write token, serves connection settings, and scopes real HTTP calls', async () => {
  const { root, library } = await fixture();
  const listener = await startHttp(library, 0);
  const base = `http://127.0.0.1:${listener.address().port}`;
  const client = new Client({ name: 'scoped-http-test', version: '1.0.0' });
  try {
    const html = await fetch(base).then(r => r.text());
    assert.match(html, /Choose project|Choose a project|project-select/);
    const guide = await fetch(`${base}/guide.html`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /MCP setup &amp; usage/);
    assert.ok(guide.headers.get('content-security-policy').includes("script-src 'self'"));
    const state = await fetch(`${base}/api/state`).then(r => r.json());
    assert.equal(state.skills.length, 4);
    assert.equal((await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Blocked' }) })).status, 403);
    const headers = { 'Content-Type': 'application/json', 'X-Skill-Library-Token': state.csrf_token };
    const created = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'HTTP scoped', path: '' }) });
    assert.equal(created.status, 201);
    const project = await created.json();
    const connection = await fetch(`${base}/api/projects/${project.id}/connection`).then(r => r.json());
    assert.equal(JSON.parse(connection.json).mcpServers.skill_library.env.SKILL_LIBRARY_PROJECT, project.id);
    assert.deepEqual(JSON.parse(connection.json).mcpServers.skill_library.args, [fileURLToPath(new URL('../dist/stdio.js', import.meta.url))]);
    assert.match(connection.toml, /SKILL_LIBRARY_PROJECT/);
    assert.equal(JSON.parse(connection.example.json).mcpServers.skill_library.env.SKILL_LIBRARY_PROJECT, 'your-project-id');
    assert.equal(connection.example.http_path, '/mcp?project=your-project-id');
    assert.ok(!JSON.stringify(connection.example).includes(library.directory));
    assert.match(connection.example.toml, /absolute\/path\/to/);
    await client.connect(new StreamableHTTPClientTransport(new URL(base + connection.http_path)));
    assert.equal((await client.callTool({ name: 'list_skills', arguments: {} })).structuredContent.skills.length, 0);
    const updated = await fetch(`${base}/api/projects/${project.id}/skills`, { method: 'PATCH', headers, body: JSON.stringify({ skill_id: 'fixture/code-review', enabled: true, expected_revision: project.revision }) });
    assert.equal(updated.status, 200);
    const result = await client.callTool({ name: 'list_skills', arguments: {} });
    assert.deepEqual(result.structuredContent.skills.map(s => s.skill_id), ['fixture/code-review']);
    const hidden = await client.callTool({ name: 'get_skill', arguments: { skill_id: 'fixture/research' } });
    assert.equal(hidden.isError, true);
    assert.equal((await fetch(`${base}/api/skill?id=fixture%2Fresearch`)).status, 200); // Owner still sees the whole library.
    const conflict = await fetch(`${base}/api/projects/${project.id}/skills`, { method: 'PATCH', headers, body: JSON.stringify({ skill_id: 'fixture/research', enabled: true, expected_revision: project.revision }) });
    assert.equal(conflict.status, 409);
    const current = await updated.json();
    const bulk = await fetch(`${base}/api/projects/${project.id}/folder`, { method: 'PATCH', headers, body: JSON.stringify({ folder: 'Test collection', enabled: true, expected_revision: current.revision }) });
    assert.equal(bulk.status, 200);
    const all = await bulk.json();
    assert.equal(all.enabled_skills.length, 3);
    assert.equal((await client.callTool({ name: 'list_skills', arguments: {} })).structuredContent.skills.length, 3);
    const cleared = await fetch(`${base}/api/projects/${project.id}/folder`, { method: 'PATCH', headers, body: JSON.stringify({ folder: 'Test collection', enabled: false, expected_revision: all.revision }) });
    assert.equal(cleared.status, 200);
    assert.equal((await client.callTool({ name: 'list_skills', arguments: {} })).structuredContent.skills.length, 0);
    assert.equal((await fetch(`${base}/mcp?project=missing-project`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  } finally { await client.close(); await new Promise(resolve => listener.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

test('standalone skills have their own activation and are excluded from collection bulk changes', async () => {
  const { root } = await fixture();
  try {
    const file = path.join(root, 'catalog.json');
    const catalog = JSON.parse(await readFile(file, 'utf8'));
    const designTool = catalog.skills.find(s => s.skill_id === 'fixture/design-tool');
    assert.equal(designTool.standalone, true);
    designTool.folder = 'Test collection'; // Sharing a label does not turn a standalone skill into a member.
    await writeFile(file, JSON.stringify(catalog));
    const library = await SkillLibrary.load(root);
    const projects = new ProjectStore(library);
    const project = await projects.create({ name: 'Independent standalone', path: '' });
    let updated = await projects.toggleFolder(project.id, { folder: 'Test collection', enabled: true, expected_revision: project.revision });
    assert.equal(updated.enabled_skills.length, 3);
    assert.equal(updated.enabled_skills.includes('fixture/design-tool'), false);
    updated = await projects.toggle(project.id, { skill_id: 'fixture/design-tool', enabled: true, expected_revision: updated.revision });
    updated = await projects.toggleFolder(project.id, { folder: 'Test collection', enabled: false, expected_revision: updated.revision });
    assert.deepEqual(updated.enabled_skills, ['fixture/design-tool']);
    const skill = (await projects.scope(project.id)).get('fixture/design-tool');
    assert.equal(skill.standalone, true);
    assert.ok(skill.manifest.some(f => f.path === 'reference/init.md'));
    assert.ok(skill.manifest.some(f => f.path === 'LICENSE'));
    assert.ok(!skill.manifest.some(f => f.path.startsWith('scripts/bin/')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local setup check runs a real scoped stdio client without changing projects or exposing configuration', async () => {
  const { root, library } = await fixture();
  const listener = await startHttp(library, 0);
  const base = `http://127.0.0.1:${listener.address().port}`;
  try {
    const state = await fetch(`${base}/api/state`).then(r => r.json());
    const headers = { 'Content-Type': 'application/json', 'X-Skill-Library-Token': state.csrf_token };
    const create = await fetch(`${base}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'Setup check' }) });
    const project = await create.json();
    const check = (revision, useHeaders = headers) => fetch(`${base}/api/projects/${project.id}/check`, { method: 'POST', headers: useHeaders, body: JSON.stringify({ expected_revision: revision }) });
    assert.equal((await check(project.revision, { 'Content-Type': 'application/json' })).status, 403);
    const emptyResponse = await check(project.revision);
    assert.equal(emptyResponse.status, 200);
    const empty = await emptyResponse.json();
    assert.equal(empty.available_skills, 0);
    assert.equal(empty.retrieval_checked, false);
    assert.equal(empty.disabled_skill_checked, true);
    assert.equal(empty.external_client_verified, false);
    const update = await fetch(`${base}/api/projects/${project.id}/skills`, { method: 'PATCH', headers, body: JSON.stringify({ skill_id: 'fixture/research', enabled: true, expected_revision: project.revision }) });
    const selected = await update.json();
    assert.equal((await check(project.revision)).status, 409);
    const before = await readFile(path.join(root, 'projects.json'), 'utf8');
    const response = await check(selected.revision);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'passed');
    assert.equal(result.transport, 'stdio');
    assert.equal(result.available_skills, 1);
    assert.equal(result.retrieval_checked, true);
    assert.equal(result.disabled_skill_checked, true);
    assert.equal(result.external_client_verified, false);
    assert.equal(result.project_revision, selected.revision);
    assert.ok(!JSON.stringify(result).includes(root));
    assert.ok(!JSON.stringify(result).includes('instructions'));
    assert.equal(await readFile(path.join(root, 'projects.json'), 'utf8'), before);
    const unknown = await fetch(`${base}/api/projects/missing/check`, { method: 'POST', headers, body: JSON.stringify({ expected_revision: selected.revision }) });
    assert.equal(unknown.status, 404);
  } finally { await new Promise(resolve => listener.close(resolve)); await rm(root, { recursive: true, force: true }); }
});
