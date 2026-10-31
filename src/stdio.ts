import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SkillLibrary } from './library/skill-library.js';
import { createServer } from './mcp/server.js';
import { ProjectStore } from './projects/project-store.js';

try {
  const library = await SkillLibrary.load(process.env.SKILL_LIBRARY_DIR);
  const projectId = process.env.SKILL_LIBRARY_PROJECT;
  const projects = new ProjectStore(library);
  await projects.initialize();
  if (projectId) await projects.get(projectId); // Fail closed for a mistyped profile.
  const server = createServer(projectId ? () => projects.scope(projectId) : library);
  await server.connect(new StdioServerTransport());
  console.error(`Skill Library MCP ready (${library.stats().skills} skills, stdio).`);
} catch (error) {
  console.error('Skill Library MCP startup failed:', error);
  process.exitCode = 1;
}
