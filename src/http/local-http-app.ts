import { createDemoApp } from '../demo/http-app.js';
import { LocalInventory } from '../local-skills/inventory.js';
import { scanSchema } from '../local-skills/scanner.js';
import { nativeTargets } from '../projects/native-transaction.js';
import { detailSchema, installSchema } from '../marketplace/client.js';
import { version } from '../shared/version.js';
import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { LibraryError } from '../shared/library-error.js';
import { createServer } from '../mcp/server.js';
import { checkProject } from '../mcp/check-project.js';
import { createProjectSchema, projectIdSchema, toggleSkillSchema, toggleFolderSchema, nativeInputSchema, editProjectSchema } from '../projects/project-store.js';
import { LibraryApplication } from '../application/library-application.js';
import { publicDirectory, stdioEntrypoint } from '../shared/paths.js';

/** Local HTTP transport; application state and workflows live in LibraryApplication. */
export class LocalHttpApp {
  readonly app = express();
  private readonly csrf = randomBytes(32).toString('hex');
  private checkingProject = false;
  private readonly httpToken = process.env.SKILL_LIBRARY_HTTP_TOKEN;

  constructor(private readonly application: LibraryApplication) {
    if (this.httpToken && !/^[a-f0-9]{64}$/.test(this.httpToken)) throw new LibraryError('INVALID_INPUT', 'SKILL_LIBRARY_HTTP_TOKEN must be a 64-character lowercase hex token.');
    this.registerSecurity();
    this.app.use('/demo', createDemoApp(this.application.marketplace));
    this.registerWriteProtection();
    this.app.use('/api/restore/preview', express.json({ limit: '64mb' }));
    this.app.use(express.json({ limit: '128kb' }));
    this.registerLibraryRoutes();
    this.registerMarketplaceRoutes();
    this.registerWriteRoutes();
    this.registerMcpRoutes();
    this.registerStaticFilesAndErrors();
  }

  async listen(port = 3333) {
    await this.application.initialize();
    return await new Promise<ReturnType<typeof this.app.listen>>((resolve, reject) => {
      const listener = this.app.listen(port, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve(listener));
      listener.on('error', reject);
    });
  }

  private registerSecurity() {
    const app = this.app;
    app.disable('x-powered-by');
    app.use(localhostHostValidation());
    app.use((req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Request-ID', randomUUID());
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const origin = req.headers.origin;
      if (origin) {
        const allowed = [`http://${req.headers.host}`];
        if (!allowed.includes(origin)) { res.status(403).json({ error: 'Origin not allowed.' }); return; }
      }
      next();
    });
  }

  private registerLibraryRoutes() {
    const app = this.app;
    app.get('/api/capabilities', (_req, res) => res.json({ mode: 'local', scan: true, native_install: true }));
    app.get('/health', (_req, res) => { res.json({ status: 'ok', ...this.application.library.stats() }); });
    app.get('/api/status', async (_req, res) => {
      await this.application.projects.list();
      res.json({ status: 'ready', ...this.application.library.stats(), operations: await this.application.operations.list(), retrieval: 'local_snapshot', http_authentication: this.httpToken ? 'bearer_token' : 'trusted_local_processes', external_client_verified: false });
    });
    app.get('/api/state', async (_req, res) => {
      res.json({ version, catalog_revision: this.application.library.catalogRevision, skills: this.application.library.catalog(), archived_skills: this.application.library.catalog(true).filter(s => s.status === 'archived'), projects: await this.application.projects.list(), csrf_token: this.csrf });
    });
    app.get('/api/local-skills/inventory', async (_req, res) => { res.json(await new LocalInventory(this.application.library.directory).view(this.application.library)); });
    app.get('/api/skill', (req, res) => {
      const id = z.string().min(1).max(128).parse(req.query.id);
      res.json(this.application.library.get(id));
    });
    app.get('/api/file', (req, res) => {
      const args = z.object({ id: z.string().min(1).max(128), revision: z.string().min(1).max(128), path: z.string().min(1).max(1024) }).strict().parse(req.query);
      res.json(this.application.library.read(args.id, args.revision, args.path));
    });
    app.get('/api/projects/:id/connection', async (req, res) => {
      if (this.httpToken && req.get('X-Skill-Library-Token') !== this.csrf) { res.status(403).json({ error: { code: 'WRITE_NOT_ALLOWED', message: 'Open the owner UI to view private connection credentials.' } }); return; }
      const project = await this.application.projects.get(projectIdSchema.parse(req.params.id));
      const serverPath = stdioEntrypoint;
      const node = process.execPath;
      const configurationFor = (command: string, server: string, projectId: string, directory: string) => {
        const env = { SKILL_LIBRARY_PROJECT: projectId, SKILL_LIBRARY_DIR: directory };
        return {
          json: JSON.stringify({ mcpServers: { skill_library: { command, args: [server], env } } }, null, 2),
          toml: `[mcp_servers.skill_library]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(server)}]\n\n[mcp_servers.skill_library.env]\nSKILL_LIBRARY_PROJECT = ${JSON.stringify(projectId)}\nSKILL_LIBRARY_DIR = ${JSON.stringify(directory)}\n`,
          http_path: `/mcp?project=${encodeURIComponent(projectId)}`,
        };
      };
      res.json({ project_id: project.id, ...configurationFor(node, serverPath, project.id, this.application.library.directory), ...(this.httpToken ? { http_headers: { Authorization: `Bearer ${this.httpToken}` } } : {}), example: configurationFor('/absolute/path/to/node', '/absolute/path/to/skill-library-mcp/dist/stdio.js', 'your-project-id', '/absolute/path/to/skill-library-mcp/library') });
    });
  }

  private registerMarketplaceRoutes() {
    const app = this.app;
    app.get('/api/marketplace/status', async (_req, res) => res.json(await this.application.marketplace.health()));
    app.get('/api/marketplace/rankings', async (req, res) => {
      const args = z.object({ view: z.enum(['most-installed', 'trending', 'hot', 'github-stars']), page: z.coerce.number().int().min(0).max(99999).default(0) }).strict().parse(req.query);
      res.json(await this.application.marketplace.call('list_rankings', { ...args, limit: 20, group_by: 'repository' }));
    });
    app.get('/api/marketplace/search', async (req, res) => {
      const args = z.object({ q: z.string().trim().min(2).max(200), page: z.coerce.number().int().min(0).max(99999).default(0) }).strict().parse(req.query);
      res.json(await this.application.marketplace.call('search_marketplace', { query: args.q, page: args.page, group_by: 'repository', limit: 20 }));
    });
    app.get('/api/marketplace/repository', async (req, res) => {
      const args = detailSchema.pick({ source: true, commit: true }).parse(req.query);
      res.json(await this.application.marketplace.call('list_repository_skills', args));
    });
    app.get('/api/marketplace/skill', async (req, res) => {
      res.json(await this.application.marketplace.call('get_marketplace_skill', detailSchema.parse(req.query)));
    });
  }

  private registerWriteProtection() {
    const app = this.app;
    app.use('/api', (req, res, next) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { next(); return; }
      const token = req.get('X-Skill-Library-Token') ?? '';
      if (!req.is('application/json') || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(this.csrf))) {
        res.status(403).json({ error: { code: 'WRITE_NOT_ALLOWED', message: 'Refresh the library page before saving changes.' } });
        return;
      }
      next();
    });
  }

  private registerWriteRoutes() {
    const app = this.app;
    app.post('/api/skills/update/preview', async (req, res) => {
      const input = z.object({ skill_id: z.string().min(1).max(128), commit: z.string().regex(/^[a-f0-9]{40}$/), expected_revision: z.string().min(1).max(128) }).strict().parse(req.body);
      res.json(await this.application.maintenance.previewUpdate(this.application.library, this.application.marketplace, input));
    });
    app.post('/api/projects/:id/selection', async (req, res) => {
      const input = z.object({ enabled_skills: z.array(z.string().min(1).max(128)).max(1000), expected_revision: z.string().length(64) }).strict().parse(req.body);
      res.json(await this.application.projects.setSelection(projectIdSchema.parse(req.params.id), input));
    });
    app.post('/api/skills/update', async (req, res) => {
      res.json(await this.application.operations.run('skill.update', () => this.application.applyUpdate(z.object({ plan_id: z.string().uuid() }).strict().parse(req.body).plan_id)));
    });
    app.post('/api/skills/rollback', async (req, res) => {
      const input = z.object({ skill_id: z.string().max(128), expected_revision: z.string().max(128) }).strict().parse(req.body);
      res.json(await this.application.operations.run('skill.rollback', () => this.application.rollback(input.skill_id, input.expected_revision)));
    });
    app.patch('/api/skills/metadata', async (req, res) => {
      const input = z.object({ skill_id: z.string().min(1).max(128), expected_catalog_revision: z.string().length(64), tags: z.array(z.string().trim().min(1).max(64)).max(30).optional(), personal_notes: z.string().max(4000).optional(), preferred: z.boolean().optional(), status: z.enum(['active', 'archived']).optional() }).strict().parse(req.body);
      const result = await this.application.maintenance.editMetadata(this.application.library, this.application.projects, input);
      await this.application.reload(); res.json(result);
    });
    app.post('/api/backup', async (_req, res) => {
      res.json(await this.application.maintenance.backup(this.application.library, this.application.projects));
    });
    app.post('/api/restore/preview', async (req, res) => {
      res.json(await this.application.maintenance.previewRestore(this.application.library, z.object({ backup: z.unknown() }).strict().parse(req.body).backup));
    });
    app.post('/api/restore', async (req, res) => {
      const result = await this.application.operations.run('library.restore', () => this.application.restore(z.object({ plan_id: z.string().uuid() }).strict().parse(req.body).plan_id));
      res.status(result.partial ? 207 : 200).json(result);
    });
    app.post('/api/refresh', async (_req, res) => {
      await this.application.reload();
      res.json({ catalog_revision: this.application.library.catalogRevision, note: 'HTTP snapshot refreshed. Reconnect existing stdio clients for package changes; existing conversation content is unchanged.' });
    });
    app.patch('/api/projects/:id', async (req, res) => {
      res.json(await this.application.operations.run('project.edit', () => this.application.projects.edit(projectIdSchema.parse(req.params.id), editProjectSchema.parse(req.body))));
    });
    app.post('/api/projects/:id/native/preview', async (req, res) => {
      res.json(await this.application.projects.previewNative(projectIdSchema.parse(req.params.id), nativeInputSchema.parse(req.body)));
    });
    app.post('/api/projects/:id/check', async (req, res) => {
      const { expected_revision } = z.object({ expected_revision: z.string().length(64) }).strict().parse(req.body);
      const project = await this.application.projects.get(projectIdSchema.parse(req.params.id));
      if (project.revision !== expected_revision) throw new LibraryError('REVISION_CONFLICT', 'The project changed. Refresh before checking.');
      if (this.checkingProject) throw new LibraryError('PROJECTS_BUSY', 'A local server check is already running. Retry when it finishes.');
      this.checkingProject = true;
      try {
        const selected = this.application.library.catalog().filter(skill => project.enabled_skills.includes(skill.skill_id)).map(skill => skill.skill_id);
        const disabled = this.application.library.catalog().find(skill => !selected.includes(skill.skill_id));
        const result = await checkProject(this.application.library.directory, project.id, selected, disabled?.skill_id);
        if ((await this.application.projects.get(project.id)).revision !== expected_revision) throw new LibraryError('REVISION_CONFLICT', 'The project changed during the check. Refresh and retry.');
        res.json({ ...result, project_revision: expected_revision });
      } finally { this.checkingProject = false; }
    });
    app.post('/api/local-skills/scan', async (req, res) => {
      res.json(await this.application.scan(scanSchema.parse(req.body)));
    });
    app.post('/api/local-skills/import', async (req, res) => {
      const input = z.object({ scan_id: z.string().uuid(), ids: z.array(z.string().regex(/^[a-f0-9]{32}$/)).min(1).max(500) }).strict().parse(req.body);
      const result = await this.application.operations.run('skill.import', () => this.application.importSkills(input.scan_id, input.ids));
      res.status(result.failed ? 207 : 201).json(result);
    });
    app.post('/api/marketplace/install', async (req, res) => {
      const input = installSchema.parse(req.body);
      const result = await this.application.operations.run('skill.install', () => this.application.install(input));
      res.status('native_error' in result ? 207 : 201).json(result);
    });
    app.patch('/api/projects/:id/native', async (req, res) => {
      const input = nativeInputSchema.parse(req.body);
      res.json(await this.application.operations.run('native.apply', () => this.application.projects.bindNative(projectIdSchema.parse(req.params.id), input)));
    });
    app.post('/api/projects', async (req, res) => {
      res.status(201).json(await this.application.projects.create(createProjectSchema.parse(req.body)));
    });
    app.patch('/api/projects/:id/skills', async (req, res) => {
      res.json(await this.application.projects.toggle(projectIdSchema.parse(req.params.id), toggleSkillSchema.parse(req.body)));
    });
    app.patch('/api/projects/:id/folder', async (req, res) => {
      res.json(await this.application.projects.toggleFolder(projectIdSchema.parse(req.params.id), toggleFolderSchema.parse(req.body)));
    });
  }

  private registerMcpRoutes() {
    const app = this.app;
    app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This library endpoint does not exist.' } }); });
    app.post('/mcp', async (req, res) => {
      if (this.httpToken) {
        const token = req.get('Authorization')?.replace(/^Bearer /, '') ?? '';
        if (!/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(this.httpToken))) { res.setHeader('WWW-Authenticate', 'Bearer realm="skill-library"'); res.status(401).json({ error: 'A valid local MCP access token is required.' }); return; }
      }
      const project = req.query.project === undefined ? undefined : projectIdSchema.parse(req.query.project);
      if (project) await this.application.projects.get(project);
      const server = createServer(project ? () => this.application.projects.scope(project) : this.application.library);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(JSON.stringify({ event: 'mcp_http_error', request_id: res.getHeader('X-Request-ID') }));
        if (!res.headersSent) res.status(500).json({ error: 'Internal MCP server error.' });
      }
    });
    app.all('/mcp', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Use POST for this stateless Streamable HTTP endpoint.' }); });
  }

  private registerStaticFilesAndErrors() {
    const app = this.app;
    app.use(express.static(publicDirectory));
    const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
      const code = error?.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : error?.type === 'entity.parse.failed' || error instanceof z.ZodError ? 'INVALID_INPUT' : error instanceof LibraryError ? error.code : 'INTERNAL_ERROR';
      const status = ['PAYLOAD_TOO_LARGE', 'BACKUP_TOO_LARGE'].includes(code) ? 413 : ['PROJECT_NOT_FOUND', 'PROJECT_ARCHIVED', 'SKILL_NOT_FOUND', 'FILE_NOT_FOUND'].includes(code) ? 404 : ['REVISION_CONFLICT', 'PROJECTS_BUSY', 'UPDATE_REVIEW_REQUIRED', 'RESTORE_CONFLICT', 'PLAN_EXPIRED', 'NATIVE_REVIEW_REQUIRED'].includes(code) ? 409 : code === 'INTERNAL_ERROR' ? 500 : ['MARKETPLACE_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'CHECK_FAILED', 'RECOVERY_REQUIRED'].includes(code) ? 503 : code === 'AUTH_REQUIRED' ? 424 : code === 'RATE_LIMITED' ? 429 : 400;
      const message = code === 'PAYLOAD_TOO_LARGE' ? 'The request exceeds the size limit. Portable backups are limited to 64 MiB.' : code === 'INVALID_INPUT' ? 'Check the entered values and JSON, then try again.' : error instanceof LibraryError ? error.message : 'The library could not complete this request. Check the server terminal.';
      if (status === 500) console.error(JSON.stringify({ event: 'owner_api_error', code, request_id: res.getHeader('X-Request-ID') }));
      res.status(status).json({ error: { code, message, ...((error as { retry_after?: number }).retry_after ? { retry_after: (error as { retry_after: number }).retry_after } : {}) } });
    };
    app.use(handleError);
  }
}
