import { LocalInventory } from './local-inventory.js';
import { LocalSkillScanner, scanSchema } from './local-skills.js';
import { nativeTargets } from './native.js';
import { detailSchema, installSchema, MarketplaceClient, saveMarketplacePackage } from './marketplace.js';
import { version } from './version.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { LibraryError, SkillLibrary } from './library.js';
import { createServer } from './server.js';
import { createProjectSchema, ProjectStore, projectIdSchema, toggleSkillSchema, toggleFolderSchema } from './projects.js';

export async function startHttp(library: SkillLibrary, port = 3333, market = new MarketplaceClient(), scanner = new LocalSkillScanner()) {
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  let projects = new ProjectStore(library);
  await projects.initialize();
  const csrf = randomBytes(32).toString('hex');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin) {
      const allowed = [`http://${req.headers.host}`];
      if (!allowed.includes(origin)) { res.status(403).json({ error: 'Origin not allowed.' }); return; }
    }
    next();
  });
  app.get('/api/capabilities', (_req, res) => res.json({ mode: 'local', scan: true, native_install: true }));
  app.get('/health', (_req, res) => { res.json({ status: 'ok', ...library.stats() }); });
  app.get('/api/state', async (_req, res) => {
    res.json({ version, skills: library.catalog(), projects: await projects.list(), csrf_token: csrf });
  });
  app.get('/api/local-skills/inventory', async (_req, res) => { res.json(await new LocalInventory(library.directory).view(library)); });
  app.get('/api/skill', (req, res) => {
    const id = z.string().min(1).max(128).parse(req.query.id);
    res.json(library.get(id));
  });
  app.get('/api/file', (req, res) => {
    const args = z.object({ id: z.string().min(1).max(128), revision: z.string().min(1).max(128), path: z.string().min(1).max(1024) }).strict().parse(req.query);
    res.json(library.read(args.id, args.revision, args.path));
  });
  app.get('/api/projects/:id/connection', async (req, res) => {
    const project = await projects.get(projectIdSchema.parse(req.params.id));
    const serverPath = fileURLToPath(new URL('./stdio.js', import.meta.url));
    const node = process.execPath;
    const configurationFor = (command: string, server: string, projectId: string, directory: string) => {
      const env = { SKILL_LIBRARY_PROJECT: projectId, SKILL_LIBRARY_DIR: directory };
      return {
        json: JSON.stringify({ mcpServers: { skill_library: { command, args: [server], env } } }, null, 2),
        toml: `[mcp_servers.skill_library]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(server)}]\n\n[mcp_servers.skill_library.env]\nSKILL_LIBRARY_PROJECT = ${JSON.stringify(projectId)}\nSKILL_LIBRARY_DIR = ${JSON.stringify(directory)}\n`,
        http_path: `/mcp?project=${encodeURIComponent(projectId)}`,
      };
    };
    res.json({ project_id: project.id, ...configurationFor(node, serverPath, project.id, library.directory), example: configurationFor('/absolute/path/to/node', '/absolute/path/to/skill-library-mcp/dist/stdio.js', 'your-project-id', '/absolute/path/to/skill-library-mcp/library') });
  });
  app.get('/api/marketplace/rankings', async (req, res) => {
    const args = z.object({ view: z.enum(['most-installed', 'trending', 'hot', 'github-stars']), page: z.coerce.number().int().min(0).max(99999).default(0) }).strict().parse(req.query);
    res.json(await market.call('list_rankings', { ...args, limit: 20, group_by: 'repository' }));
  });
  app.get('/api/marketplace/search', async (req, res) => {
    const args = z.object({ q: z.string().trim().min(2).max(200), page: z.coerce.number().int().min(0).max(99999).default(0) }).strict().parse(req.query);
    res.json(await market.call('search_marketplace', { query: args.q, page: args.page, group_by: 'repository', limit: 20 }));
  });
  app.get('/api/marketplace/repository', async (req, res) => {
    const args = detailSchema.pick({ source: true, commit: true }).parse(req.query);
    res.json(await market.call('list_repository_skills', args));
  });
  app.get('/api/marketplace/skill', async (req, res) => {
    res.json(await market.call('get_marketplace_skill', detailSchema.parse(req.query)));
  });
  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { next(); return; }
    const token = req.get('X-Skill-Library-Token') ?? '';
    if (!req.is('application/json') || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(csrf))) {
      res.status(403).json({ error: { code: 'WRITE_NOT_ALLOWED', message: 'Refresh the library page before saving changes.' } });
      return;
    }
    next();
  });
  app.post('/api/local-skills/scan', async (req, res) => {
    res.json(await scanner.scan(scanSchema.parse(req.body), library, await projects.list()));
  });
  app.post('/api/local-skills/import', async (req, res) => {
    const input = z.object({ scan_id: z.string().uuid(), ids: z.array(z.string().regex(/^[a-f0-9]{32}$/)).min(1).max(500) }).strict().parse(req.body);
    const result = await scanner.import(input.scan_id, input.ids, library);
    library = await SkillLibrary.load(library.directory);
    projects = new ProjectStore(library);
    res.status(result.failed ? 207 : 201).json(result);
  });
  app.post('/api/marketplace/install', async (req, res) => {
    const input = installSchema.parse(req.body);
    if ((input.targets.length || input.enabled) && !input.project_id) throw new LibraryError('INVALID_INPUT', 'Choose a project before enabling or configuring coding apps.');
    if (input.project_id) await projects.get(input.project_id);
    const remote = await market.call('get_marketplace_skill', { source: input.source, skill: input.skill, ...(input.path === undefined ? {} : { path: input.path }), commit: input.commit, include_files: true });
    const saved = await saveMarketplacePackage(library, input, remote);
    library = await SkillLibrary.load(library.directory);
    projects = new ProjectStore(library);
    try {
      let project;
      if (input.project_id) {
        const current = await projects.get(input.project_id);
        if (input.targets.length) project = await projects.bindNative(current.id, { skill_id: saved.skill_id, root: input.root, targets: input.targets, enabled: input.enabled || (saved.already_installed && current.enabled_skills.includes(saved.skill_id)), expected_revision: current.revision });
        else if (input.enabled) project = await projects.toggle(current.id, { skill_id: saved.skill_id, enabled: true, expected_revision: current.revision });
      }
      res.status(201).json({ ...saved, saved: true, project, reload_required: input.targets.length > 0, note: 'Reconnect existing stdio library clients to load newly imported packages. Native agents may need a reload.' });
    } catch (error) {
      res.status(207).json({ ...saved, saved: true, native_error: error instanceof LibraryError ? { code: error.code, message: error.message } : { code: 'INSTALLATION_FAILED', message: 'Saved to the library, but native activation failed. Refresh and retry.' }, reload_required: false });
    }
  });
  app.patch('/api/projects/:id/native', async (req, res) => {
    const input = z.object({ skill_id: z.string().min(1).max(128), root: z.string().min(1).max(1024), targets: z.array(z.enum(nativeTargets)).max(3), enabled: z.boolean(), expected_revision: z.string().length(64) }).strict().parse(req.body);
    res.json(await projects.bindNative(projectIdSchema.parse(req.params.id), input));
  });
  app.post('/api/projects', async (req, res) => {
    res.status(201).json(await projects.create(createProjectSchema.parse(req.body)));
  });
  app.patch('/api/projects/:id/skills', async (req, res) => {
    res.json(await projects.toggle(projectIdSchema.parse(req.params.id), toggleSkillSchema.parse(req.body)));
  });
  app.patch('/api/projects/:id/folder', async (req, res) => {
    res.json(await projects.toggleFolder(projectIdSchema.parse(req.params.id), toggleFolderSchema.parse(req.body)));
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This library endpoint does not exist.' } }); });
  app.post('/mcp', async (req, res) => {
    const project = req.query.project === undefined ? undefined : projectIdSchema.parse(req.query.project);
    if (project) await projects.get(project);
    const server = createServer(project ? () => projects.scope(project) : library);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP HTTP request failed:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Internal MCP server error.' });
    }
  });
  app.all('/mcp', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Use POST for this stateless Streamable HTTP endpoint.' }); });
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const code = error instanceof z.ZodError ? 'INVALID_INPUT' : error instanceof LibraryError ? error.code : 'INTERNAL_ERROR';
    const status = ['PROJECT_NOT_FOUND', 'SKILL_NOT_FOUND', 'FILE_NOT_FOUND'].includes(code) ? 404 : ['REVISION_CONFLICT', 'PROJECTS_BUSY'].includes(code) ? 409 : code === 'INTERNAL_ERROR' ? 500 : ['MARKETPLACE_UNAVAILABLE', 'PROVIDER_UNAVAILABLE'].includes(code) ? 503 : code === 'AUTH_REQUIRED' ? 424 : code === 'RATE_LIMITED' ? 429 : 400;
    const message = error instanceof z.ZodError ? 'Check the entered values and try again.' : error instanceof LibraryError ? error.message : 'The library could not complete this request. Check the server terminal.';
    if (status === 500) console.error(error);
    res.status(status).json({ error: { code, message, ...((error as { retry_after?: number }).retry_after ? { retry_after: (error as { retry_after: number }).retry_after } : {}) } });
  };
  app.use(handleError);
  return await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(port, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve(listener));
    listener.on('error', reject);
  });
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
