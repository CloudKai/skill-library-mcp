import { parseArgs } from 'node:util';
import { LocalSkillScanner, scanSchema } from './local-skills.js';
import { SkillLibrary } from './library.js';
import { ProjectStore } from './projects.js';
try {
  const { values } = parseArgs({ options: { 'import-all': { type: 'boolean' }, scope: { type: 'string' }, 'project-directory': { type: 'string', multiple: true }, 'skill-directory': { type: 'string', multiple: true }, 'include-cached': { type: 'boolean' } } });
  const library = await SkillLibrary.load(process.env.SKILL_LIBRARY_DIR);
  const scanner = new LocalSkillScanner();
  const report = await scanner.scan(scanSchema.parse({ scope: values.scope ?? 'all', project_directories: values['project-directory'] ?? [], skill_directories: values['skill-directory'] ?? [], include_cached: values['include-cached'] ?? false }), library, await new ProjectStore(library).list());
  const ids = report.items.filter(x => x.status === 'ready').map(x => x.id);
  const result = values['import-all'] && ids.length ? await scanner.import(report.scan_id, ids, library) : undefined;
  console.log(JSON.stringify({ ...report, ...(result ? { result } : {}) }, null, 2));
  if (result?.failed) process.exitCode = 2;
} catch(error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
