import { fileURLToPath } from 'node:url';
import { SkillLibrary } from './library/skill-library.js';
import { MarketplaceClient } from './marketplace/client.js';
import { LocalSkillScanner } from './local-skills/scanner.js';
import { LibraryApplication } from './application/library-application.js';
import { LocalHttpApp } from './http/local-http-app.js';

export async function startHttp(library: SkillLibrary, port = 3333, market = new MarketplaceClient(), scanner = new LocalSkillScanner()) {
  return new LocalHttpApp(new LibraryApplication(library, market, scanner)).listen(port);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.PORT ?? 3333);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
    const listener = await startHttp(await SkillLibrary.load(process.env.SKILL_LIBRARY_DIR), port);
    console.error(`Skill Library MCP: http://127.0.0.1:${port}/mcp (local only)`);
    console.error(`Browse your skills: http://127.0.0.1:${port}`);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { listener.close(); });
  } catch (error) { console.error(error); process.exitCode = 1; }
}
