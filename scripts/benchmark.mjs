import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { SkillLibrary } from '../dist/library/skill-library.js';
const results = [];
for (const count of [100, 500, 1000]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'skill-benchmark-'));
  try {
    const skills = [];
    for (let i = 0; i < count; i++) {
      const name = `skill-${String(i).padStart(4, '0')}`;
      await mkdir(path.join(directory, name));
      await writeFile(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${i % 10 === 0 ? 'Investigate debugging failures' : 'Plan a maintainable change'}.\n---\nFollow this synthetic workflow.\n`);
      skills.push({ skill_id: `benchmark/${name}`, package: name, tags: [], preferred: false, status: 'active', personal_notes: '', requirements: [], source: { url: 'local:benchmark', path: name } });
    }
    await writeFile(path.join(directory, 'catalog.json'), JSON.stringify({ version: 1, skills }));
    const started = performance.now();
    const library = await SkillLibrary.load(directory);
    const startup = performance.now() - started;
    const samples = [];
    for (let i = 0; i < 50; i++) { const before = performance.now(); library.search({ query: 'debugging', limit: 5 }); samples.push(performance.now() - before); }
    samples.sort((a, b) => a - b);
    results.push({ skills: count, loaded_bytes: library.stats().bytes, startup_ms: Math.round(startup), warm_search_p95_ms: Number(samples[47].toFixed(2)), rss_mib: Math.round(process.memoryUsage().rss / 1048576) });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, fixture: 'One tiny SKILL.md per package; synthetic local measurements, not production guarantees.', results }, null, 2));
