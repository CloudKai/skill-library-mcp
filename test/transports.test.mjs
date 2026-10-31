import { createFixtureLibrary } from './fixture-library.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SkillLibrary } from '../dist/library/skill-library.js';
import { startHttp } from '../dist/http.js';

async function verifyTools(client) {
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ['get_skill', 'list_skills', 'read_skill_file', 'search_skills']);
  const search = await client.callTool({ name: 'search_skills', arguments: { query: 'research' } });
  assert.equal(search.isError, undefined);
  assert.equal(search.structuredContent.matches[0].skill_id, 'fixture/research');
  const listing = await client.callTool({ name: 'list_skills', arguments: { limit: 1 } });
  assert.equal(listing.structuredContent.skills.length, 1);
  assert.ok(listing.structuredContent.next_cursor);
  const skill = await client.callTool({ name: 'get_skill', arguments: { skill_id: 'fixture/diagnosing-bugs' } });
  assert.match(skill.structuredContent.instructions, /feedback loop/i);
  const file = await client.callTool({ name: 'read_skill_file', arguments: { skill_id: 'fixture/diagnosing-bugs', revision: skill.structuredContent.revision, path: 'scripts/hitl-loop.template.sh' } });
  assert.match(file.structuredContent.content, /bash/);
  const badRevision = await client.callTool({ name: 'get_skill', arguments: { skill_id: 'fixture/research', revision: 'not-current' } });
  assert.equal(badRevision.isError, true);
  assert.equal(badRevision.structuredContent.error.code, 'REVISION_NOT_FOUND');
  const invalid = await client.callTool({ name: 'list_skills', arguments: { limit: 1, extra: true } });
  assert.equal(invalid.isError, true);
}

test('real SDK client discovers and calls all four tools over stdio from another cwd', async (t) => {
  const root=await mkdtemp(path.join(os.tmpdir(),'transport-fixture-'));t.after(()=>rm(root,{recursive:true,force:true}));await createFixtureLibrary(root);
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/stdio.js', import.meta.url))], cwd: '/tmp', env: { PATH: process.env.PATH, SKILL_LIBRARY_DIR: root }, stderr: 'pipe' }));
    await verifyTools(client);
  } finally { await client.close(); }
});

test('Streamable HTTP works across stateless requests and rejects foreign origins and hosts', async (t) => {
  const root=await mkdtemp(path.join(os.tmpdir(),'transport-fixture-'));t.after(()=>rm(root,{recursive:true,force:true}));await createFixtureLibrary(root);
  const listener = await startHttp(await SkillLibrary.load(root), 0);
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: 'http-integration-test', version: '1.0.0' });
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    await verifyTools(client);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    // Node fetch may replace a custom Host header; use an actual HTTP request
    // to verify the header received by the server.
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const req = request(`${base}/mcp`, { method: 'POST', headers: { Host: 'foreign.example', 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
  } finally {
    await client.close();
    await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
});
