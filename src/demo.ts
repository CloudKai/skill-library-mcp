import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { demoLibrary } from './shared/paths.js';

const client = new Client({ name: 'skill-library-demo', version: '0.1.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./stdio.js', import.meta.url))], stderr: 'pipe', env: { PATH: process.env.PATH ?? '', SKILL_LIBRARY_DIR: demoLibrary } });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log('\nConnected to a real MCP server over stdio.\n');
  console.log('Available tools:', tools.tools.map(t => t.name).join(', '));
  const search = await client.callTool({ name: 'search_skills', arguments: { query: 'issue', capabilities: ['shell', 'filesystem'] } });
  const found = search.structuredContent as { matches: { skill_id: string; name: string; revision: string; compatibility: string }[] };
  console.log('\n1. Search the synthetic demo for "issue":');
  console.log(JSON.stringify(found.matches.map(s => ({ skill_id: s.skill_id, compatibility: s.compatibility })), null, 2));
  const selected = found.matches[0];
  if (!selected) throw new Error('The synthetic demo package could not be found.');
  const result = await client.callTool({ name: 'get_skill', arguments: { skill_id: selected.skill_id, revision: selected.revision } });
  const skill = result.structuredContent as { instructions: string; manifest: { path: string }[] };
  console.log(`\n2. Retrieved ${selected.name}: ${skill.instructions.length} characters.`);
  console.log('Package files:', skill.manifest.map(f => f.path).join(', '));
  const file = await client.callTool({ name: 'read_skill_file', arguments: { skill_id: selected.skill_id, revision: selected.revision, path: 'SKILL.md' } });
  console.log('\n3. Read manifested SKILL.md bytes from the same revision:');
  console.log((file.structuredContent as { content: string }).content.split('\n').slice(0, 3).join('\n'));
  console.log('\nDemo complete. Instructions were retrieved; no skill script was executed.\n');
} finally { await client.close(); }
