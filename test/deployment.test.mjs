import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('deployment filtering excludes owner data without removing library source or demo assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deployment-filter-'));
  try {
    await writeFile(path.join(root, '.gitignore'), await readFile(new URL('../.vercelignore', import.meta.url)));
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr);
    const files = ['library/catalog.json', 'library/.local/catalog.json', 'src/library/skill-library.ts', 'src/library/maintenance.ts', 'src/library/import-package.ts', 'demo-library/catalog.json', 'demo-library/packages/debug-an-issue/SKILL.md', 'public/index.html'];
    const filtered = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: root, input: files.join('\n') + '\n', encoding: 'utf8' });
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.deepEqual(filtered.stdout.trim().split('\n'), files.slice(0, 2));
  } finally { await rm(root, { recursive: true, force: true }); }
});
