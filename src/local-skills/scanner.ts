import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, realpath, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';
import { parseSkill, readPackage, SkillLibrary, type Entry } from '../library/skill-library.js';
import { hash } from '../shared/hash.js';
import { LibraryError } from '../shared/library-error.js';
import { LocalInventory } from './inventory.js';
import { importPackage } from '../library/import-package.js';

export const platforms = ['shared', 'codex', 'claude-code', 'cursor', 'opencode'] as const;
const directory = z.string().trim().min(1).max(2048).refine(path.isAbsolute, 'Use an absolute directory path.');
export const scanSchema = z.object({
  scope: z.enum(['all', 'global', 'projects']).default('all'),
  platforms: z.array(z.enum(platforms)).min(1).max(platforms.length).default([...platforms]),
  project_ids: z.array(z.string().min(1).max(80)).max(200).optional(),
  project_directories: z.array(directory).max(20).default([]),
  skill_directories: z.array(directory).max(20).default([]),
  include_cached: z.boolean().default(false),
}).strict();
export type ScanInput = z.infer<typeof scanSchema>;
type Project = { id: string; name: string; path?: string; native_bindings?: { root: string }[] };
type Origin = { platform: string; scope: string; path: string; project?: string; project_path?: string; plugin?: string; registered: boolean };
type Root = Origin & { boundary: string; folder: string; repository?: string; version?: string; license?: string };
type Prepared = { root: Root; directory: string; revision: string; metadata: Omit<Entry, 'package'> };
type Item = { id: string; name: string; description: string; status: 'ready' | 'installed' | 'unsupported' | 'cached'; origins: Origin[]; skill_id?: string; folder: string; files?: number; bytes?: number; issue?: string };
export type Report = { scan_id: string; scanned_at: string; expires_at: string; items: Item[]; locations: { platform: string; scope: string; path: string; status: string; message?: string }[]; warnings: string[]; complete: boolean; coverage: string };
const skip = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.venv', 'venv', '.cache', '.trash', 'vendor']);
const attribution = /^(license|notice|copying)(\.(md|txt|rst))?$/i;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'local';
const within = (value: string, root: string) => value === root || value.startsWith(root + path.sep);
const origin = (root: Root, directory: string): Origin => ({ platform: root.platform, scope: root.scope, path: directory, ...(root.project ? { project: root.project } : {}), ...(root.project_path ? { project_path: root.project_path } : {}), ...(root.plugin ? { plugin: root.plugin } : {}), registered: root.registered });
const code = (e: unknown) => (e as NodeJS.ErrnoException).code;
const message = (e: unknown) => e instanceof Error ? e.message : 'Could not read this location.';
async function small(file: string) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > 256 * 1024) throw new LibraryError('INVALID_SCAN_SOURCE', 'Configuration or SKILL.md is not a regular file within the 256 KiB limit.');
  return readFile(file);
}
async function json(file: string) { return JSON.parse((await small(file)).toString('utf8')); }
async function exists(file: string) { try { await lstat(file); return true; } catch(e) { if (code(e) === 'ENOENT') return false; throw e; } }
const revision = (files: Map<string, Buffer>) => hash(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, hash(bytes)])));

/** Local owner-side inventory only. Never asks a model, downloads, or executes a package. */
export class LocalSkillScanner {
  private snapshots = new Map<string, { expires: number; plans: Map<string, Prepared> }>();
  private busy = false;
  constructor(private home = os.homedir(), private env: Record<string, string | undefined> = process.env, private now = Date.now) {}
  private async packageFiles(directory: string, root: Root) {
    const result = await readPackage(directory);
    const files = new Map(result.files);
    // Preserve attribution from category/plugin ancestors without reading unrelated files.
    let parent = path.dirname(directory);
    while (within(parent, root.boundary)) {
      for (const file of await readdir(parent)) {
        if (!attribution.test(file)) continue;
        const location = path.join(parent, file); const stat = await lstat(location);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new LibraryError('INVALID_SCAN_SOURCE', 'An attribution file is linked or exceeds the package limit.');
        const bytes = await readFile(location);
        const existingName = [...files.keys()].find(name => name.toLowerCase() === file.toLowerCase());
        if (!existingName) files.set(file, bytes);
        else if (!files.get(existingName)!.equals(bytes)) {
          const name = `SOURCE-${hash(parent).slice(0, 8)}-${file}`;
          if (files.has(name) && !files.get(name)!.equals(bytes)) throw new LibraryError('INVALID_SCAN_SOURCE', 'Attribution filenames conflict.');
          files.set(name, bytes);
        }
      }
      if (parent === root.boundary) break;
      parent = path.dirname(parent);
    }
    if (files.size > 128 || [...files.values()].reduce((n, b) => n + b.length, 0) > 8 * 1024 * 1024) throw new LibraryError('PACKAGE_TOO_LARGE', 'The complete package with attribution exceeds the library limits.');
    return { ...result, files, revision: revision(files), contentRevision: revision(result.files) };
  }
  async scan(input: ScanInput, library: SkillLibrary, projects: Project[]): Promise<Report> {
    if (this.busy) throw new LibraryError('SCAN_BUSY', 'Another local scan/import is running. Retry when it finishes.');
    this.busy = true;
    try { const report = await this.performScan(scanSchema.parse(input), library, projects); await new LocalInventory(library.directory).record(report); return report; } finally { this.busy = false; }
  }
  private async performScan(input: ScanInput, library: SkillLibrary, projects: Project[]): Promise<Report> {
    const scanId = randomUUID(), start = this.now();
    const report: Report = { scan_id: scanId, scanned_at: new Date(start).toISOString(), expires_at: new Date(start + 15 * 60_000).toISOString(), items: [], locations: [], warnings: [], complete: true,
      coverage: 'Local files only: selected global locations, registered projects and added folders. Host activation and remote/cloud skills are not verified. Commands, rules and built-in system skills are not converted.' };
    const plans = new Map<string, Prepared>(), seenPackages = new Map<string, Item>(), visited = new Set<string>();
    const existing = library.catalog();
    const savedInstructions = new Map(existing.map(item => [`${item.name}:${hash(library.get(item.skill_id).instructions)}`, item]));
    let directories = 0, skillDirectories = 0, bytesRead = 0;
    const warn = (text: string) => { report.complete = false; if (report.warnings.length < 100) report.warnings.push(text); };
    const roots: Root[] = [];
    const selectedProjects = input.project_ids ? input.project_ids.map(id => { const p = projects.find(p => p.id === id); if (!p) throw new LibraryError('PROJECT_NOT_FOUND', `Unknown project: ${id}`); return p; }) : projects;
    const codexHome = this.env.CODEX_HOME || path.join(this.home, '.codex');
    const claudeHome = this.env.CLAUDE_CONFIG_DIR || path.join(this.home, '.claude');
    const definitions = [
      { platform: 'shared', global: path.join(this.home, '.agents/skills'), local: '.agents/skills' },
      { platform: 'codex', global: path.join(codexHome, 'skills'), local: '.codex/skills' },
      { platform: 'claude-code', global: path.join(claudeHome, 'skills'), local: '.claude/skills' },
      { platform: 'cursor', global: path.join(this.home, '.cursor/skills'), local: '.cursor/skills' },
      { platform: 'opencode', global: path.join(this.env.XDG_CONFIG_HOME || path.join(this.home, '.config'), 'opencode/skills'), local: '.opencode/skills' },
    ].filter(d => input.platforms.includes(d.platform as typeof platforms[number]));
    const addRoot = (root: Omit<Root, 'boundary'> & { boundary?: string }) => { if (roots.length >= 1000) { warn('Location limit reached. Scan fewer platforms or projects.'); return; } roots.push({ ...root, boundary: root.boundary ?? root.path }); };
    if (input.scope !== 'projects') for (const d of definitions) addRoot({ platform: d.platform, scope: 'global', path: d.global, folder: 'Local skills', registered: true });
    async function configJson(file: string) { try { return await json(file); } catch(e) { if (code(e) !== 'ENOENT') warn(`${file}: ${message(e)}`); return null; } }
    const plugin = async (directory: string, platform: string, scope: string, registered: boolean, project?: string, project_path?: string) => {
      try {
        const root = await realpath(directory);
        let manifest: any;
        for (const filename of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json']) {
          if (await exists(path.join(root, filename))) { manifest = await json(path.join(root, filename)); break; }
        }
        if (!manifest) { warn(`${directory}: plugin manifest not found; not treated as an installed skill collection.`); return; }
        const name = String(manifest.name ?? path.basename(path.dirname(root)));
        const repository = typeof manifest.repository === 'string' && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(manifest.repository) ? manifest.repository.replace(/\.git$/, '') : undefined;
        const paths = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills ?? './skills'];
        for (const relative of paths) {
          if (typeof relative !== 'string') { warn(`${directory}: unsupported skills manifest entry.`); continue; }
          const target = path.resolve(root, relative);
          if (!within(target, root)) { warn(`${directory}: plugin skills entry escapes its package.`); continue; }
          addRoot({ platform, scope, path: target, boundary: root, folder: repository && existing.find(x => x.source.url === repository)?.folder || String(manifest.interface?.displayName ?? name).slice(0, 100), plugin: name, repository, version: typeof manifest.version === 'string' ? manifest.version : undefined, license: typeof manifest.license === 'string' ? manifest.license : undefined, registered, project, project_path });
        }
      } catch(e) { warn(`${directory}: ${message(e)}`); }
    };
    if (input.scope !== 'projects' && input.platforms.includes('codex')) {
      let settings: any = {};
      try { settings = parseToml((await small(path.join(codexHome, 'config.toml'))).toString('utf8')); } catch(e) { if (code(e) !== 'ENOENT') warn('Codex configuration could not be parsed/read; enabled plugin configuration is unavailable.'); }
      for (const configured of Array.isArray(settings.skills?.config) ? settings.skills.config : []) {
        if (typeof configured.path === 'string' && path.isAbsolute(configured.path)) {
          const target = configured.path.endsWith('SKILL.md') ? path.dirname(configured.path) : configured.path;
          addRoot({ platform: 'codex', scope: 'configured skills', path: target, folder: 'Configured Codex skills', registered: true });
        }
      }
      const cache = path.join(codexHome, 'plugins/cache');
      try {
        for (const market of await readdir(cache, { withFileTypes: true })) {
          if (!market.isDirectory() || market.name.startsWith('.')) continue;
          for (const entry of await readdir(path.join(cache, market.name), { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('plugin-install-')) continue;
            const enabled = settings.plugins?.[`${entry.name}@${market.name}`]?.enabled;
            const base = path.join(cache, market.name, entry.name);
            const remote = await exists(path.join(base, '.codex-remote-plugin-install.json'));
            const registered = enabled === true || (remote && enabled !== false);
            if (!registered && !input.include_cached) continue;
            const versions = (await readdir(base, { withFileTypes: true })).filter(d => d.isDirectory() && !d.name.startsWith('.'));
            const dated = await Promise.all(versions.map(async d => ({ directory: path.join(base, d.name), time: (await lstat(path.join(base, d.name))).mtimeMs })));
            dated.sort((a,b) => b.time - a.time || b.directory.localeCompare(a.directory));
            if (dated[0]) {
              if (dated.length > 1) report.warnings.push(`${entry.name}: inspecting the newest cached package for this registered plugin; runtime version is not verified.`);
              await plugin(dated[0].directory, 'codex', 'plugin', registered);
            }
          }
        }
      } catch(e) { if (code(e) !== 'ENOENT') warn(`Codex plugin cache: ${message(e)}`); }
    }
    // Claude's install registry is evidence; an arbitrary cache directory alone is not.
    if (input.platforms.includes('claude-code')) {
      const installed = await configJson(path.join(claudeHome, 'plugins/installed_plugins.json'));
      for (const entries of Object.values(installed?.plugins ?? {}) as any[]) for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry.installPath !== 'string' || !path.isAbsolute(entry.installPath)) continue;
        const project = selectedProjects.find(p => p.path === entry.projectPath);
        const global = entry.scope === 'user' || entry.scope === 'local' && !entry.projectPath;
        if ((global && input.scope !== 'projects') || (project && input.scope !== 'global')) await plugin(entry.installPath, 'claude-code', global ? 'plugin' : 'project plugin', true, project?.name, project?.path);
      }
    }
    if (input.scope !== 'projects' && input.platforms.includes('cursor')) {
      const local = path.join(this.home, '.cursor/plugins/local');
      try { for (const d of await readdir(local, { withFileTypes: true })) if (d.isDirectory()) await plugin(path.join(local, d.name), 'cursor', 'local plugin', true); } catch(e) { if (code(e) !== 'ENOENT') warn(`${local}: ${message(e)}`); }
      const cache = path.join(this.home, '.cursor/plugins/cache');
      if (await exists(cache)) {
        if (!input.include_cached) report.warnings.push('Cursor plugin cache is excluded by default: installed/enabled state cannot be verified from cache files. Use Include cached packages to inspect them separately.');
        else {
          try { for (const market of await readdir(cache, { withFileTypes: true })) if (market.isDirectory()) for (const name of await readdir(path.join(cache, market.name), { withFileTypes: true })) if (name.isDirectory()) for (const version of await readdir(path.join(cache, market.name, name.name), { withFileTypes: true })) if (version.isDirectory()) await plugin(path.join(cache, market.name, name.name, version.name), 'cursor', 'cached plugin', false); } catch(e) { warn(`Cursor cached packages: ${message(e)}`); }
        }
      }
    }
    const visitProject = async (directory: string, label: string, depth = 0, base = directory): Promise<void> => {
      if (++directories > 10_000 || depth > 12) { warn(`${directory}: project discovery limit reached; add a narrower project folder.`); return; }
      try {
        const canonical = await realpath(directory);
        const visitKey = `project:${canonical}`; if (visited.has(visitKey)) return; visited.add(visitKey);
        for (const d of definitions) {
          const target = path.join(directory, d.local);
          if (await exists(target)) addRoot({ platform: d.platform, scope: 'project', path: target, folder: `${label}${depth ? ` / ${path.relative(base, directory)}` : ''} skills`.slice(0,100), registered: true, project: depth ? `${label} / ${path.relative(base, directory)}` : label, project_path: canonical });
        }
        for (const d of await readdir(directory, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith('.') && !skip.has(d.name) && path.join(canonical, d.name) !== path.join(library.directory, 'library')) await visitProject(path.join(directory, d.name), label, depth + 1, base);
      } catch(e) { warn(`${directory}: ${message(e)}`); }
    };
    if (input.scope !== 'global') {
      const projectLocation = async (folder: string, label: string) => {
        let boundary = folder;
        // A profile can point at a monorepo subdirectory. Include inherited
        // skill folders up to its nearest Git worktree root, not arbitrary parents.
        try {
          let parent = await realpath(folder);
          for (let i = 0; i < 32; i++) {
            if (await exists(path.join(parent, '.git'))) { boundary = parent; break; }
            const next = path.dirname(parent); if (next === parent) break; parent = next;
          }
        } catch(e) { /* The discovery walk reports unavailable directories below. */ }
        const location = { platform: 'all', scope: 'project discovery', path: boundary, status: 'scanned', ...(boundary !== folder ? { message: `Includes inherited skills for ${folder} up to its Git worktree root.` } : {}) }; report.locations.push(location);
        const warnings = report.warnings.length; await visitProject(boundary, label); if (report.warnings.length > warnings) location.status = 'partial';
      };
      for (const project of selectedProjects) {
        const directories = [...new Set([project.path, ...(project.native_bindings ?? []).map(b => b.root)].filter((p): p is string => !!p))];
        if (!directories.length) warn(`${project.name}: no project directory is configured.`);
        for (const directory of directories) await projectLocation(directory, project.name);
      }
      for (const folder of input.project_directories) await projectLocation(folder, path.basename(folder));
    }
    for (const folder of input.skill_directories) addRoot({ platform: 'custom', scope: 'custom skills', path: folder, folder: 'Custom skills', registered: true });
    const inspect = async (directory: string, root: Root) => {
      if (report.items.length >= 500 || bytesRead >= 128 * 1024 * 1024) { warn('Skill scan limit reached (500 packages / 128 MiB eligible content). Scan fewer locations.'); return; }
      let canonical: string; try { canonical = await realpath(directory); } catch(e) { warn(`${directory}: ${message(e)}`); return; }
      const foundOrigin = origin(root, directory);
      const identity = `package:${canonical}`;
      if (seenPackages.has(identity)) { const old = seenPackages.get(identity)!; if (!old.origins.some(o => o.path === directory && o.platform === root.platform)) old.origins.push(foundOrigin); if (root.registered && old.status === 'cached') old.status = 'ready'; return; }
      const item: Item = { id: hash(canonical).slice(0,32), name: path.basename(directory), description: '', status: 'unsupported', origins: [foundOrigin], folder: root.folder };
      report.items.push(item); seenPackages.set(identity, item);
      try {
        const main = await small(path.join(canonical, 'SKILL.md'));
        const fm = parseSkill(main); item.name = fm.name; item.description = fm.description;
        const already = existing.find(e => e.source.url === `local:${canonical}` || (root.repository && e.source.url === root.repository && e.source.path === path.relative(root.boundary, directory).split(path.sep).join('/'))) ?? savedInstructions.get(`${fm.name}:${hash(main)}`);
        if (already) {
          const duplicate = seenPackages.get(`saved:${already.skill_id}`);
          if (duplicate) { duplicate.origins.push(foundOrigin); report.items.splice(report.items.indexOf(item),1); seenPackages.set(identity, duplicate); return; }
          item.status = 'installed'; item.skill_id = already.skill_id; item.issue = 'A saved copy or identical instructions already exist. Supporting-file updates are not applied automatically.';
          seenPackages.set(`saved:${already.skill_id}`, item); return;
        }
        const data = await this.packageFiles(canonical, { ...root, boundary: await realpath(root.boundary) });
        item.files = data.files.size; item.bytes = [...data.files.values()].reduce((n,b) => n + b.length, 0); if (bytesRead + item.bytes > 128 * 1024 * 1024) { warn('Scan byte limit reached. Scan fewer locations.'); item.issue = 'Scan byte limit reached; retry a smaller scope.'; return; } bytesRead += item.bytes;
        const duplicate = seenPackages.get(`content:${data.revision}`);
        if (duplicate) { duplicate.origins.push(foundOrigin); if (root.registered && duplicate.status === 'cached') duplicate.status = 'ready'; report.items.splice(report.items.indexOf(item),1); seenPackages.set(identity, duplicate); return; }
        seenPackages.set(`content:${data.revision}`, item);
        const namespace = root.repository ? root.repository.split('/')[3]! : root.plugin ? `${root.platform}-${root.plugin}` : 'local';
        let id = `${slug(namespace)}/${fm.name}`;
        if (namespace === 'local' || existing.some(x => x.skill_id === id) || [...plans.values()].some(x => x.metadata.skill_id === id)) id = `${slug(namespace)}/${fm.name}-${hash(canonical).slice(0,8)}`;
        item.skill_id = id; item.status = root.registered ? 'ready' : 'cached';
        const metadata: Omit<Entry, 'package'> = { skill_id: id, folder: root.folder, standalone: false, tags: ['local-import'], preferred: false, status: 'active', requirements: [],
          personal_notes: 'Imported from a local scan. Host-specific tools, plugins and external dependencies are not installed or verified. Original installation remains unchanged.',
          source: { url: root.repository ?? `local:${canonical}`, path: root.repository ? path.relative(root.boundary, directory).split(path.sep).join('/') : fm.name, ...(root.version ? { bundle_version: root.version } : {}), note: `Local ${root.platform} ${root.scope} snapshot from ${canonical}. ${root.license ? `Manifest-declared license: ${root.license}. ` : ''}Available ancestor attribution retained. Upstream commit and host activation unverified.` } };
        plans.set(item.id, { root: { ...root, boundary: await realpath(root.boundary) }, directory: canonical, revision: data.revision, metadata });
      } catch(e) { item.issue = message(e); }
    };
    const walkSkills = async (directory: string, root: Root, depth = 0): Promise<void> => {
      if (++skillDirectories > 10_000 || depth > 16 || report.items.length >= 500) { warn(`${directory}: scan depth or directory limit reached.`); return; }
      try {
        const canonical = await realpath(directory); const key = `skills:${root.platform}:${canonical}`;
        if (root.plugin && !within(canonical, await realpath(root.boundary))) { warn(`${directory}: linked plugin skills escape the plugin package.`); return; }
        if (await exists(path.join(directory,'SKILL.md'))) { await inspect(directory, root); return; }
        if (visited.has(key)) return; visited.add(key);
        for (const d of await readdir(directory, { withFileTypes: true })) {
          if (skip.has(d.name) || d.name.startsWith('.')) continue;
          if (d.isDirectory() || d.isSymbolicLink()) {
            if (d.isSymbolicLink()) {
              try { if ((await lstat(await realpath(path.join(directory,d.name)))).isDirectory()) await walkSkills(path.join(directory,d.name),root,depth+1); } catch(e) { warn(`${path.join(directory,d.name)}: ${message(e)}`); }
            } else await walkSkills(path.join(directory,d.name),root,depth+1);
          }
        }
      } catch(e) { warn(`${directory}: ${message(e)}`); }
    };
    for (const root of roots) {
      try {
        if (!await exists(root.path)) { report.locations.push({ platform: root.platform, scope: root.scope, path: root.path, status: 'not found' }); continue; }
        const location = { platform: root.platform, scope: root.scope, path: root.path, status: 'scanned' }; report.locations.push(location);
        const warnings = report.warnings.length; await walkSkills(root.path, root); if (report.warnings.length > warnings) location.status = 'partial';
      } catch(e) { report.locations.push({ platform: root.platform, scope: root.scope, path: root.path, status: 'unavailable', message: message(e) }); warn(`${root.path}: ${message(e)}`); }
    }
    this.snapshots.set(scanId, { expires: start + 15 * 60_000, plans });
    for (const [id, snapshot] of this.snapshots) if (snapshot.expires <= this.now()) this.snapshots.delete(id);
    if (this.snapshots.size > 8) this.snapshots.delete(this.snapshots.keys().next().value!);
    return report;
  }
  async import(scanId: string, ids: string[], library: SkillLibrary) {
    if (this.busy) throw new LibraryError('SCAN_BUSY', 'Another local scan/import is running. Retry when it finishes.');
    const snapshot = this.snapshots.get(scanId);
    if (!snapshot || snapshot.expires <= this.now()) throw new LibraryError('SCAN_EXPIRED', 'The scan expired. Scan again before importing.');
    for (const id of ids) if (!snapshot.plans.has(id)) throw new LibraryError('INVALID_SCAN_ITEM', 'Select importable entries from this scan.');
    this.busy = true;
    const outcomes: { id: string; skill_id?: string; status: string; code?: string; message?: string }[] = [];
    try {
      for (const id of [...new Set(ids)]) {
        const plan = snapshot.plans.get(id)!;
        let staging: string | undefined;
        try {
          const data = await this.packageFiles(plan.directory, plan.root);
          if (data.revision !== plan.revision) throw new LibraryError('SOURCE_CHANGED', 'This package changed since scanning. Scan again before importing.');
          staging = await mkdtemp(path.join(os.tmpdir(), 'skill-library-scan-'));
          const packageRoot = path.join(staging, data.frontmatter.name); await mkdir(packageRoot);
          for (const [name, bytes] of data.files) { const target = path.join(packageRoot, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
          const saved = await importPackage(library.directory, packageRoot, plan.metadata);
          outcomes.push({ id, skill_id: saved.skill_id, status: 'imported' });
        } catch(e) { outcomes.push({ id, skill_id: plan.metadata.skill_id, status: code(e) === 'ALREADY_INSTALLED' ? 'already installed' : 'failed', code: code(e) ?? 'IMPORT_FAILED', message: message(e) }); }
        finally { if (staging) await rm(staging, { recursive: true, force: true }); }
      }
      await new LocalInventory(library.directory).imported(outcomes);
    } finally { this.busy = false; }
    return { outcomes, imported: outcomes.filter(o => o.status === 'imported').length, failed: outcomes.filter(o => o.status === 'failed').length, note: 'Imported packages remain disabled for all projects. Reconnect existing stdio library clients to load new packages. Original platform installations and native copies were not changed.' };
  }
}
