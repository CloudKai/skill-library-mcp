import { SkillLibrary } from './library.js';
import { callTool } from './server.js';
import { ProjectStore } from './projects.js';

try {
  const baseLibrary = await SkillLibrary.load(process.env.SKILL_LIBRARY_DIR);
  const library = process.env.SKILL_LIBRARY_PROJECT ? await new ProjectStore(baseLibrary).scope(process.env.SKILL_LIBRARY_PROJECT) : baseLibrary;
  const [command = 'list', ...args] = process.argv.slice(2);
  if (command === 'validate') {
    console.log(JSON.stringify({ valid: true, ...library.stats() }, null, 2));
  } else {
    const result = command === 'list' ? callTool(library, 'list_skills', {})
      : command === 'search' ? callTool(library, 'search_skills', { query: args.join(' ') })
      : command === 'get' ? callTool(library, 'get_skill', { skill_id: args[0] })
      : command === 'read' ? callTool(library, 'read_skill_file', { skill_id: args[0], revision: args[1], path: args[2] })
      : undefined;
    if (!result) throw new Error('Usage: npm run browse -- [list | search <task> | get <skill_id> | read <skill_id> <revision> <path>]');
    console.log(JSON.stringify(result.structuredContent, null, 2));
    if ('isError' in result && result.isError) process.exitCode = 1;
  }
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
