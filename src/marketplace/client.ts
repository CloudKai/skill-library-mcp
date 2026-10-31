import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { SkillLibrary } from '../library/skill-library.js';
import { hash } from '../shared/hash.js';
import { LibraryError } from '../shared/library-error.js';
import { importPackage } from '../library/import-package.js';

export const sourceSchema = z.string().regex(/^[\w.-]+\/[\w.-]+$/).max(201);
export const detailSchema = z.object({ source: sourceSchema, skill: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64), path: z.string().max(1024).optional(), commit: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict();
export const installSchema = detailSchema.extend({ commit: z.string().regex(/^[a-f0-9]{40}$/), project_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).optional(), enabled: z.boolean().default(false), targets: z.array(z.enum(['codex', 'claude-code', 'cursor'])).max(3).default([]), root: z.string().max(1024).default('') }).strict();
export class MarketplaceClient {
  private activeRequests = 0;
  private retryAt = 0;
  constructor(private endpoint = process.env.SKILL_MARKETPLACE_URL ?? 'http://127.0.0.1:3334/mcp', private options: { hosted?: boolean; serviceToken?: string } = {}) {}
  async health() {
    try {
      const url = new URL(this.endpoint);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password) return { reachable: false, provider_auth: 'not_checked', message: 'Configure a loopback discovery endpoint.' };
      url.pathname = '/health'; url.search = '';
      const result = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
      return { reachable: result.ok, provider_auth: 'not_checked', message: result.ok ? 'Discovery service is reachable. Provider authentication, quotas and live results are not checked by this probe.' : 'Discovery health check failed. Start or inspect the companion service.' };
    } catch { return { reachable: false, provider_auth: 'not_checked', message: 'Discovery is stopped or unreachable. Saved library retrieval still works. Start both services with npm run local -- --marketplace.' }; }
  }
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    if (Date.now() < this.retryAt) throw Object.assign(new LibraryError('RATE_LIMITED', 'The provider cooldown is still active. Wait before retrying.'), { retry_after: Math.ceil((this.retryAt - Date.now()) / 1000) });
    if (this.activeRequests >= 4) throw new LibraryError('MARKETPLACE_UNAVAILABLE', 'Discovery is busy. Wait for the current requests to finish.');
    const url = new URL(this.endpoint);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.protocol === 'http:';
    const hosted = this.options.hosted && url.protocol === 'https:' && url.hostname.endsWith('.vercel.app') && !!this.options.serviceToken;
    if ((!local && !hosted) || url.username || url.password) throw new LibraryError('MARKETPLACE_UNAVAILABLE', 'Use a local discovery endpoint or an authenticated hosted Vercel discovery endpoint.');
    const client = new Client({ name: 'skill-library-marketplace', version: '0.5.0' });
    this.activeRequests++;
    try {
      await client.connect(new StreamableHTTPClientTransport(url, this.options.serviceToken ? { requestInit: { headers: { Authorization: `Bearer ${this.options.serviceToken}` } } } : undefined), { timeout: 10000 });
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
      const data = result.structuredContent;
      if (!data || typeof data !== 'object') throw new LibraryError('MARKETPLACE_UNAVAILABLE', 'The discovery MCP returned an unsupported response.');
      if (result.isError || 'error' in data) {
        const e = (data as Record<string, unknown>).error as { code?: string; message?: string; retry_after?: number };
        const error = new LibraryError(e.code ?? 'MARKETPLACE_UNAVAILABLE', e.message ?? 'Discovery failed.');
        if (e.retry_after) Object.assign(error, { retry_after: e.retry_after });
        if (e.code === 'RATE_LIMITED') this.retryAt = Date.now() + Math.min(3600, Math.max(1, e.retry_after ?? 60)) * 1000;
        throw error;
      }
      return data;
    } catch (e) {
      if (e instanceof LibraryError) throw e;
      throw new LibraryError('MARKETPLACE_UNAVAILABLE', this.options.hosted ? 'Marketplace discovery is temporarily unavailable. Please retry shortly.' : 'Start the Skill Marketplace MCP on port 3334, then retry. See MCP setup & usage.');
    } finally { this.activeRequests--; await client.close().catch(() => {}); }
  }
}
const packageSchema = z.object({ source: sourceSchema, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64), path: z.string().max(1024), commit: z.string().regex(/^[a-f0-9]{40}$/), standalone: z.boolean(), files: z.array(z.object({ path: z.string().min(1).max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/), size_bytes: z.number().int().min(0).max(2 * 1024 * 1024), encoding: z.literal('base64'), content: z.string().max(3 * 1024 * 1024) })).min(1).max(128) }).passthrough();
export async function saveMarketplacePackage(library: SkillLibrary, input: z.infer<typeof installSchema>, remote: unknown) {
  const data = packageSchema.parse(remote);
  if (data.source !== input.source || data.slug !== input.skill || data.commit !== input.commit || (input.path !== undefined && input.path !== data.path)) throw new LibraryError('SOURCE_CHANGED', 'The resolved source differs from the reviewed commit. Refresh its details before installing.');
  const existing = library.catalog().find(s => s.source.url.replace(/\.git$/, '').toLowerCase() === `https://github.com/${data.source}`.toLowerCase() && s.source.path === data.path);
  if (existing) {
    if (existing.source.commit !== data.commit) {
      throw new LibraryError('UPDATE_REVIEW_REQUIRED', `This skill is saved at ${existing.source.commit?.slice(0, 12) ?? 'an unrecorded upstream commit'}, but you reviewed ${data.commit.slice(0, 12)}. Updating saved packages is not supported yet. The saved package and its project selection were not changed.`);
    }
    return { skill_id: existing.skill_id, already_installed: true, saved_commit: existing.source.commit };
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'skill-download-'));
  const packageRoot = path.join(temporary, data.slug);
  let total = 0; const seen = new Set<string>();
  try {
    await mkdir(packageRoot);
    for (const file of data.files) {
      if (file.path.startsWith('/') || file.path.includes('\\') || /[\x00-\x1f]/.test(file.path) || file.path.split('/').some(s => !s || s === '.' || s === '..') || file.path === '.skill-library-owner.json' || seen.has(file.path)) throw new LibraryError('INVALID_PACKAGE', 'The package contains unsafe or duplicate paths.');
      seen.add(file.path);
      const bytes = Buffer.from(file.content, 'base64'); total += bytes.length;
      if (total > 8 * 1024 * 1024 || bytes.length !== file.size_bytes || hash(bytes) !== file.sha256) throw new LibraryError('CONTENT_INTEGRITY_ERROR', 'The package exceeds its bounds or failed checksum verification.');
      const dest = path.join(packageRoot, file.path); await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, bytes, { flag: 'wx' });
    }
    const owner = data.source.split('/')[0]!.toLowerCase().slice(0, 39);
    const id = `${owner}/${data.slug}-${hash(data.source + '/' + data.path).slice(0, 8)}`;
    const entry = await importPackage(library.directory, packageRoot, { skill_id: id, folder: data.source, standalone: data.standalone, tags: [], requirements: [], requirements_assessment: 'unknown', preferred: false, status: 'active', personal_notes: 'Installed from Marketplace at a pinned Git commit. Read the repository setup instructions and check required capabilities before use.', source: { url: `https://github.com/${data.source}`, path: data.path, commit: data.commit, note: 'Complete validated skill package with available repository-level attribution. No setup scripts were executed.' } });
    return { skill_id: entry.skill_id, already_installed: false, saved_commit: entry.source.commit };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
