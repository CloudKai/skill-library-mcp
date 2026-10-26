import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hash, LibraryError, type SkillLibrary } from './library.js';
import { projectLock } from './native.js';
import type { Report } from './local-skills.js';

const originSchema = z.object({ platform: z.string(), scope: z.string(), path: z.string(), project: z.string().optional(), project_path: z.string().optional(), plugin: z.string().optional(), registered: z.boolean() });
const observationSchema = z.object({ key: z.string(), id: z.string(), skill_id: z.string().optional(), name: z.string(), description: z.string(), status: z.enum(['ready','installed','unsupported','cached']), folder: z.string(), issue: z.string().optional(), origin: originSchema, last_seen: z.string() });
const lastScanSchema = z.object({ at: z.string(), complete: z.boolean(), warnings: z.array(z.string()), coverage: z.string() });
const storeSchema = z.object({ version: z.literal(1), observations: z.array(observationSchema).max(10000), last_scan: lastScanSchema.nullable() });
type Store = z.infer<typeof storeSchema>;
const within = (value: string, root: string) => value === root || value.startsWith(root + path.sep);

/** Private owner inventory. Its origins never enter the agent-facing skill catalog. */
export class LocalInventory {
  private filename: string;
  constructor(private directory: string) { this.filename = path.join(directory, '.local/inventory.json'); }
  private async read(): Promise<Store> {
    try {
      const stat = await lstat(this.filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new LibraryError('INVALID_INVENTORY', 'The local inventory is invalid or too large. Preserve it and check the server logs.');
      return storeSchema.parse(JSON.parse(await readFile(this.filename, 'utf8')));
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, observations: [], last_scan: null }; throw error; }
  }
  private async mutate(change: (store: Store) => void) {
    const release = await projectLock(this.directory, 'inventory.lock');
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      const store = await this.read(); change(store); storeSchema.parse(store);
      const bytes = JSON.stringify(store, null, 2) + '\n';
      if (Buffer.byteLength(bytes) > 16 * 1024 * 1024) throw new LibraryError('INVENTORY_FULL', 'The saved inventory is full. Existing inventory was preserved.');
      await mkdir(path.dirname(this.filename), { recursive: true });
      await writeFile(temporary, bytes, { mode: 0o600 }); await rename(temporary, this.filename);
    } finally { await rm(temporary, { force: true }); await release(); }
  }
  async record(report: Report) {
    await this.mutate(store => {
      // Narrow/partial scans retain observations outside their proven coverage.
      const covered = report.complete ? report.locations.filter(l => ['scanned', 'not found'].includes(l.status) && l.platform !== 'all') : [];
      const observations = new Map(store.observations.filter(o => !covered.some(l => l.platform === o.origin.platform && l.scope === o.origin.scope && within(o.origin.path, l.path))).map(o => [o.key, o]));
      for (const item of report.items) for (const origin of item.origins) {
        const key = hash(JSON.stringify([origin.platform, origin.path, origin.project_path ?? '', origin.scope]));
        observations.set(key, { key, id: item.id, ...(item.skill_id ? { skill_id: item.skill_id } : {}), name: item.name, description: item.description, status: item.status, folder: item.folder, ...(item.issue ? { issue: item.issue } : {}), origin, last_seen: report.scanned_at });
      }
      store.observations = [...observations.values()];
      store.last_scan = { at: report.scanned_at, complete: report.complete, warnings: report.warnings, coverage: report.coverage };
    });
  }
  async imported(outcomes: { id: string; skill_id?: string; status: string }[]) {
    await this.mutate(store => {
      for (const result of outcomes) if (['imported','already installed'].includes(result.status) && result.skill_id) {
        for (const observation of store.observations) if (observation.id === result.id) { observation.skill_id = result.skill_id; observation.status = 'installed'; delete observation.issue; }
      }
    });
  }
  async view(library: SkillLibrary) {
    const store = await this.read(), saved = new Set(library.catalog().map(s => s.skill_id));
    const groups = new Map<string, { id: string; kind: string; name: string; path?: string; count: number }>([['global', { id: 'global', kind: 'global', name: 'Global installations', count: 0 }]]);
    type ViewItem = { id: string; name: string; description: string; folder: string; skill_id?: string; status: string; issue?: string; origins: (z.infer<typeof originSchema> & { group_id: string; last_seen: string })[] };
    const items = new Map<string, ViewItem>();
    for (const observation of store.observations) {
      const o = observation.origin;
      const kind = o.project_path || o.project ? 'project' : o.platform === 'custom' ? 'custom' : 'global';
      const id = kind === 'global' ? 'global' : `${kind}:${hash(o.project_path ?? o.project ?? 'custom').slice(0,16)}`;
      if (!groups.has(id)) groups.set(id, { id, kind, name: kind === 'custom' ? 'Custom locations' : path.basename(o.project_path ?? '') || o.project || 'Project location', ...(o.project_path ? { path: o.project_path } : {}), count: 0 });
      const savedId = observation.skill_id && saved.has(observation.skill_id) ? observation.skill_id : undefined;
      const key = savedId ? `saved:${savedId}` : `scan:${observation.id}`;
      let item = items.get(key);
      if (!item) {
        item = { id: key, name: observation.name, description: observation.description, folder: observation.folder, ...(savedId ? { skill_id: savedId } : {}), status: savedId ? 'installed' : observation.status === 'installed' ? 'ready' : observation.status, ...(observation.status === 'installed' && !savedId ? { issue: 'The saved copy is no longer active in this library. Scan again before importing.' } : observation.issue ? { issue: observation.issue } : {}), origins: [] };
        items.set(key, item);
      }
      item.origins.push({ ...o, group_id: id, last_seen: observation.last_seen });
    }
    for (const group of groups.values()) group.count = [...items.values()].filter(item => item.origins.some(o => o.group_id === group.id)).length;
    return { last_scan: store.last_scan, groups: [...groups.values()].sort((a,b) => (a.id === b.id ? 0 : a.kind === 'global' ? -1 : b.kind === 'global' ? 1 : a.name.localeCompare(b.name) || (a.path ?? '').localeCompare(b.path ?? ''))), items: [...items.values()] };
  }
}
