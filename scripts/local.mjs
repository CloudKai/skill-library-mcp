import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const discovery = fileURLToPath(new URL('../../skill-marketplace-mcp/', import.meta.url));
const children = new Set();
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); }
function start(directory, entrypoint, overrides = {}) {
  const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', entrypoint], { cwd: directory, stdio: 'inherit', env: { ...process.env, ...overrides } });
  children.add(child);
  child.on('error', () => { console.error('A local service could not start. Build both repositories and check your Node installation.'); process.exitCode = 1; stop(); });
  child.on('exit', code => { children.delete(child); if (!stopping) { process.exitCode = code || 0; stop(); } });
}
try {
  if (process.argv.includes('--marketplace')) {
    await access(new URL('../../skill-marketplace-mcp/dist/http.js', import.meta.url));
    start(discovery, 'dist/http.js', { PORT: process.env.MARKETPLACE_PORT ?? '3334' });
  }
  start(root, 'dist/http.js', process.argv.includes('--marketplace') ? { SKILL_MARKETPLACE_URL: process.env.SKILL_MARKETPLACE_URL ?? `http://127.0.0.1:${process.env.MARKETPLACE_PORT ?? '3334'}/mcp` } : {});
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
} catch { console.error('Build the sibling skill-marketplace-mcp repository first, or omit --marketplace to use saved skills only.'); process.exitCode = 1; stop(); }
