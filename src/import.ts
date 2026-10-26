import path from 'node:path';
import { parseArgs } from 'node:util';
import { defaultLibrary, readPackage } from './library.js';
import { importPackage } from './import-package.js';
try {
  const { values } = parseArgs({ options: { from: { type: 'string' }, id: { type: 'string' }, folder: { type: 'string' }, standalone: { type: 'boolean' }, tags: { type: 'string' }, requirements: { type: 'string' }, notes: { type: 'string' }, 'source-url': { type: 'string' }, commit: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('Usage: npm run import-skill -- --from /absolute/path/skill-name --id author/skill-name [--folder "Collection name"] [--standalone] [--tags research,docs] [--requirements shell,web] [--notes "Why I like it"] [--source-url URL] [--commit SHA]');
  else {
    if (!values.from || !values.id) throw new Error('Both --from and --id are required. Use --help for an example.');
    const from = path.resolve(values.from); const { frontmatter } = await readPackage(from);
    const entry = await importPackage(process.env.SKILL_LIBRARY_DIR ?? defaultLibrary, from, { skill_id: values.id, folder: values.folder ?? 'General skills', standalone: values.standalone ?? false, tags: values.tags?.split(',').filter(Boolean) ?? [], requirements: values.requirements?.split(',').filter(Boolean) ?? [], personal_notes: values.notes ?? 'Imported locally. Inspect requirements and supporting files before use.', preferred: false, status: 'active', source: { url: values['source-url'] ?? 'local:import', path: frontmatter.name, ...(values.commit ? { commit: values.commit } : {}) } });
    console.log(`Imported ${entry.skill_id}. Restart running MCP servers to load the new catalog. Review and commit the changes in Git.`);
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
