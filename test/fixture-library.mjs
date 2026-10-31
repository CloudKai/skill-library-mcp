import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Original synthetic data, created only in temporary test directories.
export async function createFixtureLibrary(destination) {
  const skills = [];
  for (const name of ['research', 'diagnosing-bugs', 'code-review', 'design-tool']) {
    const root = path.join(destination, 'packages', name);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'SKILL.md'), `---\nname: ${name}\ndescription: Synthetic ${name} workflow for integration tests.\n---\nResearch evidence and test the feedback loop.\n`);
    await writeFile(path.join(root, 'LICENSE'), 'Original synthetic test fixture.\n');
    if (name === 'diagnosing-bugs') {
      await mkdir(path.join(root, 'scripts'));
      await writeFile(path.join(root, 'scripts/hitl-loop.template.sh'), '#!/usr/bin/env bash\n# Synthetic content; tests retrieve this without execution.\n');
    }
    if (name === 'design-tool') {
      await mkdir(path.join(root, 'reference'));
      await writeFile(path.join(root, 'reference/init.md'), 'Synthetic supporting reference.\n');
    }
    skills.push({ skill_id: `fixture/${name}`, package: `packages/${name}`, folder: 'Test collection', standalone: name === 'design-tool', tags: [name], preferred: true, status: 'active', personal_notes: 'Synthetic test data', requirements: [], source: { url: 'local:fixture', path: name } });
  }
  await writeFile(path.join(destination, 'catalog.json'), JSON.stringify({ version: 1, skills }));
  await writeFile(path.join(destination, 'projects.json'), JSON.stringify({ version: 1, projects: [] }));
}
