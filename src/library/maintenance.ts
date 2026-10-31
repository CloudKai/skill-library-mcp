import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { SkillLibrary, entrySchema, readPackage, parseSkill, safeRelative, type Entry } from './skill-library.js';
import { MarketplaceClient, sourceSchema } from '../marketplace/client.js';
import { projectSchema, ProjectStore } from '../projects/project-store.js';
import { LibraryError } from '../shared/library-error.js';
import { hash } from '../shared/hash.js';
import { projectLock } from '../shared/file-lock.js';
import { atomicWrite } from '../shared/atomic-write.js';
import { safeDirectory } from '../shared/safe-directory.js';

const fileSchema = z.object({ path: z.string().min(1).max(1024), content: z.string().max(3 * 1024 * 1024), size_bytes: z.number().int().min(0).max(2 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const packageSchema = z.object({ entry: entrySchema, revision: z.string().regex(/^sha256:[a-f0-9]{64}$/), files: z.array(fileSchema).min(1).max(128) }).strict();
const backupSchema = z.object({ version: z.literal(1), created_at: z.string().datetime(), packages: z.array(packageSchema).max(1000), projects: z.array(projectSchema).max(100) }).strict();
type SavedPackage = z.infer<typeof packageSchema>;
type Plan = { expires: number; catalog: string; backup: z.infer<typeof backupSchema>; additions: SavedPackage[]; overrides: Entry[] };
type UpdatePlan = { expires: number; catalog: string; item: SavedPackage };

/** Reviewed portable backups. Restore merges immutable packages and creates path-free profiles. */
export class LibraryMaintenance {
  private plans = new Map<string, Plan>();
  private updates = new Map<string, UpdatePlan>();

  async backup(library: SkillLibrary, projects: ProjectStore) {
    const backup = { version: 1 as const, created_at: new Date().toISOString(), packages: library.exportPackages().map(p => ({ ...p, entry: { ...p.entry, history: undefined } })), projects: (await projects.list()).map(({ revision: _revision, ...project }) => project) };
    if (Buffer.byteLength(JSON.stringify(backup)) > 64 * 1024 * 1024) throw new LibraryError('BACKUP_TOO_LARGE', 'This portable backup exceeds 64 MiB. Use a filesystem backup while the server is stopped.');
    return backup;
  }

  private async stage(item: SavedPackage, verifyRevision = true) {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'skill-restore-'));
    let total = 0;
    const seen = new Set<string>();
    try {
      const mainFile = item.files.find(f => f.path === 'SKILL.md');
      if (!mainFile) throw new LibraryError('INVALID_PACKAGE', 'A backup package has no SKILL.md.');
      // Read the canonical name only after validating the original frontmatter below.
      const name = parseSkill(Buffer.from(mainFile.content, 'base64')).name;
      const root = path.join(parent, name);
      await mkdir(root);
      for (const file of item.files) {
        if (file.path.startsWith('/') || file.path.includes('\\') || /[\x00-\x1f]/.test(file.path) || file.path.split('/').some(p => !p || p === '.' || p === '..') || file.path === '.skill-library-owner.json' || seen.has(file.path.toLowerCase())) throw new LibraryError('INVALID_PACKAGE', 'A backup contains unsafe, reserved or duplicate paths.');
        seen.add(file.path.toLowerCase());
        const bytes = Buffer.from(file.content, 'base64'); total += bytes.length;
        if (bytes.length !== file.size_bytes || hash(bytes) !== file.sha256 || total > 8 * 1024 * 1024) throw new LibraryError('CONTENT_INTEGRITY_ERROR', 'A backup package failed checksum or size validation.');
        const destination = path.join(root, file.path);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { flag: 'wx' });
      }
      const parsed = await readPackage(root);
      const revision = `sha256:${hash(JSON.stringify([...parsed.files].map(([p, b]) => [p, hash(b)])))}`;
      if (verifyRevision && revision !== item.revision) throw new LibraryError('CONTENT_INTEGRITY_ERROR', 'The backup revision does not match its package bytes.');
      return { root, parent, name, revision };
    } catch (error) { await rm(parent, { recursive: true, force: true }); throw error; }
  }

  private async publishEntry(library: SkillLibrary, entry: Entry, catalogRevision: string, projects: ProjectStore) {
    const releaseProject = await projectLock(library.directory);
    try {
      const releaseCatalog = await projectLock(library.directory, 'catalog.lock');
      try {
        const current = await SkillLibrary.load(library.directory);
        if (current.catalogRevision !== catalogRevision) throw new LibraryError('REVISION_CONFLICT', 'The library changed. Review this change again.');
        let packageRoot = library.directory;
        for (const segment of safeRelative(entry.package).split('/')) {
          packageRoot = path.join(packageRoot, segment);
          if ((await lstat(packageRoot)).isSymbolicLink()) throw new LibraryError('INVALID_PATH', 'Package replacements cannot traverse symbolic links.');
        }
        const replacementPackage = await readPackage(packageRoot);
        const oldBytes = current.exportPackage(entry.skill_id)?.files.reduce((n, f) => n + f.size_bytes, 0) ?? 0;
        const newBytes = [...replacementPackage.files.values()].reduce((n, bytes) => n + bytes.length, 0);
        if (current.stats().bytes - oldBytes + newBytes > Number(process.env.SKILL_LIBRARY_MAX_BYTES ?? 128 * 1048576)) throw new LibraryError('LIBRARY_TOO_LARGE', 'This update would exceed the aggregate snapshot budget.');
        const packageChanged = entry.package !== current.exportPackage(entry.skill_id)?.entry.package;
        const affected = (await projects.list()).some(p => p.enabled_skills.includes(entry.skill_id) && (entry.status === 'archived' || (packageChanged && p.native_bindings.some(b => b.skill_id === entry.skill_id))));
        if (affected) throw new LibraryError('NATIVE_REVIEW_REQUIRED', 'Disable this skill in projects with native copies before updating or rolling back. To archive, disable it in every project first. Edited native copies must be resolved manually.');
        const local = await safeDirectory(library.directory, ['.local']);
        const filename = path.join(local, 'catalog.json');
        const catalog: { version: 1; skills: Entry[] } = await readFile(filename, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return { version: 1, skills: [] }; throw error; });
        const starter = JSON.parse(await readFile(path.join(library.directory, 'catalog.json'), 'utf8')) as { skills: Entry[] };
        const replacement = { ...entry, ...(starter.skills.some(s => s.skill_id === entry.skill_id) ? { overrides_starter: true } : {}) };
        catalog.skills = [...catalog.skills.filter(s => s.skill_id !== entry.skill_id), replacement];
        await atomicWrite(filename, JSON.stringify(catalog, null, 2) + '\n');
      } finally { await releaseCatalog(); }
    } finally { await releaseProject(); }
  }

  async previewUpdate(library: SkillLibrary, market: MarketplaceClient, input: { skill_id: string; commit: string; expected_revision: string }) {
    const current = library.exportPackage(input.skill_id);
    if (!current || current.revision !== input.expected_revision) throw new LibraryError('REVISION_CONFLICT', 'The saved skill changed. Refresh and review again.');
    const url = new URL(current.entry.source.url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') throw new LibraryError('INVALID_INPUT', 'Only public GitHub packages support upstream update review.');
    const source = sourceSchema.parse(url.pathname.replace(/^\//, '').replace(/\.git$/, ''));
    const slug = parseSkill(Buffer.from(current.files.find(f => f.path === 'SKILL.md')!.content, 'base64')).name;
    const remote = z.object({ source: sourceSchema, slug: z.string(), path: z.string(), commit: z.string(), files: z.array(fileSchema.passthrough()).min(1).max(128) }).passthrough().parse(await market.call('get_marketplace_skill', { source, skill: slug, path: current.entry.source.path, commit: input.commit, include_files: true }));
    if (remote.source !== source || remote.slug !== slug || remote.path !== current.entry.source.path || remote.commit !== input.commit) throw new LibraryError('SOURCE_CHANGED', 'The fetched package differs from the reviewed source.');
    const item: SavedPackage = { entry: { ...current.entry, requirements: [], requirements_assessment: 'unknown', source: { ...current.entry.source, commit: remote.commit } }, files: remote.files.map(({ path: filePath, content, size_bytes, sha256 }) => ({ path: filePath, content, size_bytes, sha256 })), revision: current.revision };
    const staged = await this.stage(item, false);
    item.revision = staged.revision;
    await rm(staged.parent, { recursive: true, force: true });
    const oldFiles = new Map(current.files.map(f => [f.path, f.sha256]));
    const newFiles = new Map(item.files.map(f => [f.path, f.sha256]));
    let previewBudget = 128 * 1024;
    const text = (file?: SavedPackage['files'][number]) => {
      if (!file) return '';
      const bytes = Buffer.from(file.content, 'base64');
      try { return bytes.includes(0) ? null : new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
    };
    const files = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort().map(filePath => {
      const change = !oldFiles.has(filePath) ? 'added' : !newFiles.has(filePath) ? 'removed' : oldFiles.get(filePath) === newFiles.get(filePath) ? 'unchanged' : 'modified';
      const before = text(current.files.find(f => f.path === filePath)), after = text(item.files.find(f => f.path === filePath));
      if (change === 'unchanged' || before === null || after === null || previewBudget <= 0) return { path: filePath, change };
      const limit = Math.min(8192, Math.floor(previewBudget / 2));
      previewBudget -= Math.min(before.length, limit) + Math.min(after.length, limit);
      return { path: filePath, change, preview: { before: before.slice(0, limit), after: after.slice(0, limit), truncated: before.length > limit || after.length > limit } };
    });
    for (const [id, plan] of this.updates) if (plan.expires <= Date.now()) this.updates.delete(id);
    if (this.updates.size >= 3) this.updates.delete(this.updates.keys().next().value!);
    const planId = randomUUID();
    this.updates.set(planId, { expires: Date.now() + 15 * 60_000, catalog: library.catalogRevision, item });
    return { plan_id: planId, skill_id: input.skill_id, saved_commit: current.entry.source.commit ?? null, reviewed_commit: remote.commit, files, instructions: Buffer.from(item.files.find(f => f.path === 'SKILL.md')!.content, 'base64').toString('utf8'), note: 'Review instructions, requirements and license changes. No setup runs. Disable managed native copies first; they are never silently replaced.' };
  }

  async applyUpdate(library: SkillLibrary, projects: ProjectStore, planId: string) {
    const plan = this.updates.get(planId);
    if (!plan || plan.expires <= Date.now()) throw new LibraryError('PLAN_EXPIRED', 'The update review expired. Inspect the source again.');
    const previous = library.exportPackage(plan.item.entry.skill_id);
    if (!previous) throw new LibraryError('SKILL_NOT_FOUND', 'This skill is no longer saved.');
    const staged = await this.stage(plan.item);
    try {
      const relative = `.local/packages/${plan.item.revision.slice(7)}/${staged.name}`;
      const destination = path.join(library.directory, relative);
      await safeDirectory(library.directory, ['.local', 'packages', plan.item.revision.slice(7)]);
      try { await rename(staged.root, destination); } catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
      const history = [{ package: previous.entry.package, source: previous.entry.source, requirements: previous.entry.requirements, requirements_assessment: previous.entry.requirements_assessment }, ...(previous.entry.history ?? [])].slice(0, 20);
      await this.publishEntry(library, { ...plan.item.entry, package: relative, history }, plan.catalog, projects);
      this.updates.delete(planId);
      return { saved: true, skill_id: plan.item.entry.skill_id, revision: plan.item.revision, note: 'Update saved. Reconnect stdio clients; re-enable native copies after reviewing the new package.' };
    } finally { await rm(staged.parent, { recursive: true, force: true }); }
  }

  async rollback(library: SkillLibrary, projects: ProjectStore, skillId: string, expectedRevision: string) {
    const current = library.exportPackage(skillId);
    if (!current || current.revision !== expectedRevision) throw new LibraryError('REVISION_CONFLICT', 'The saved skill changed. Refresh and review again.');
    const [previous, ...history] = current.entry.history ?? [];
    if (!previous) throw new LibraryError('NO_PREVIOUS_REVISION', 'No previous local revision is retained for this package.');
    await this.publishEntry(library, { ...current.entry, ...previous, history }, library.catalogRevision, projects);
    return { saved: true, skill_id: skillId, note: 'Previous package restored. Reconnect stdio clients; native copies require explicit re-enabling.' };
  }

  async editMetadata(library: SkillLibrary, projects: ProjectStore, input: { skill_id: string; expected_catalog_revision: string; tags?: string[]; personal_notes?: string; preferred?: boolean; status?: 'active' | 'archived' }) {
    const current = library.exportPackage(input.skill_id);
    if (!current) throw new LibraryError('SKILL_NOT_FOUND', 'This package is not saved.');
    const { skill_id: _skillId, expected_catalog_revision: _revision, ...fields } = input;
    await this.publishEntry(library, entrySchema.parse({ ...current.entry, ...fields }), input.expected_catalog_revision, projects);
    return { saved: true, skill_id: input.skill_id };
  }

  async previewRestore(library: SkillLibrary, input: unknown) {
    if (Buffer.byteLength(JSON.stringify(input)) > 64 * 1024 * 1024) throw new LibraryError('BACKUP_TOO_LARGE', 'The backup exceeds 64 MiB.');
    const backup = backupSchema.parse(input);
    const existing = new Map(library.catalog(true).map(p => [p.skill_id, p]));
    const ids = new Set<string>();
    const additions: SavedPackage[] = [];
    const overrides: Entry[] = [];
    for (const item of backup.packages) {
      if (ids.has(item.entry.skill_id)) throw new LibraryError('INVALID_PACKAGE', 'Duplicate skill IDs in backup.');
      ids.add(item.entry.skill_id);
      const staged = await this.stage(item);
      await rm(staged.parent, { recursive: true, force: true });
      const saved = existing.get(item.entry.skill_id);
      if (saved && saved.revision !== item.revision) throw new LibraryError('RESTORE_CONFLICT', `Saved skill ${item.entry.skill_id} differs. Use a clean library or review an update instead of overwriting it.`);
      if (saved && item.entry.overrides_starter) {
        const currentEntry = library.exportPackage(item.entry.skill_id)!.entry;
        const restoredEntry = { ...item.entry, package: currentEntry.package, history: currentEntry.history };
        if (!currentEntry.overrides_starter) overrides.push(restoredEntry);
        else if (JSON.stringify({ ...currentEntry, history: undefined }) !== JSON.stringify({ ...restoredEntry, history: undefined })) throw new LibraryError('RESTORE_CONFLICT', 'Saved curator metadata differs. Existing metadata was preserved.');
      }
      if (!saved) additions.push({ ...item, entry: { ...item.entry, history: undefined, overrides_starter: undefined } });
    }
    if (existing.size + additions.length > 1000) throw new LibraryError('CATALOG_FULL', 'Restoring would exceed 1000 skills.');
    if (library.stats().bytes + additions.reduce((n, item) => n + item.files.reduce((sum, f) => sum + f.size_bytes, 0), 0) > Number(process.env.SKILL_LIBRARY_MAX_BYTES ?? 128 * 1048576)) throw new LibraryError('LIBRARY_TOO_LARGE', 'Restoring would exceed the aggregate snapshot budget.');
    const available = new Set([...existing.keys(), ...ids]);
    if (backup.projects.some(p => p.enabled_skills.some(id => !available.has(id)))) throw new LibraryError('INVALID_PACKAGE', 'A restored profile references a package absent from the backup and library.');
    for (const [id, plan] of this.plans) if (plan.expires <= Date.now()) this.plans.delete(id);
    if (this.plans.size >= 3) this.plans.delete(this.plans.keys().next().value!);
    const planId = randomUUID();
    this.plans.set(planId, { expires: Date.now() + 15 * 60_000, catalog: library.catalogRevision, backup, additions, overrides });
    return { plan_id: planId, packages_to_add: additions.length, metadata_to_restore: overrides.length, profiles: backup.projects.length, paths_cleared: true, note: 'Existing packages and profiles are preserved. Private starter metadata is restored only where no private override exists. Restored profiles have no native destinations; choose directories again.' };
  }

  async restore(library: SkillLibrary, projects: ProjectStore, planId: string) {
    const plan = this.plans.get(planId);
    if (!plan || plan.expires < Date.now()) throw new LibraryError('PLAN_EXPIRED', 'This preview expired. Review the backup again.');
    const releaseProject = await projectLock(library.directory);
    let release: (() => Promise<void>) | undefined;
    try {
      release = await projectLock(library.directory, 'catalog.lock');
      const current = await SkillLibrary.load(library.directory);
      if (current.catalogRevision !== plan.catalog) throw new LibraryError('REVISION_CONFLICT', 'The library changed. Preview the backup again.');
      const local = await safeDirectory(library.directory, ['.local']);
      const filename = path.join(local, 'catalog.json');
      const catalog: { version: 1; skills: Entry[] } = await readFile(filename, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return { version: 1, skills: [] }; throw error; });
      const selected = new Set((await projects.list()).flatMap(p => p.enabled_skills));
      if (plan.overrides.some(entry => entry.status === 'archived' && selected.has(entry.skill_id))) throw new LibraryError('RESTORE_CONFLICT', 'Disable selected skills before restoring archived starter metadata.');
      for (const entry of plan.overrides) catalog.skills.push(entry);
      for (const item of plan.additions) {
        const staged = await this.stage(item);
        try {
          const relative = `.local/packages/${item.revision.slice(7)}/${staged.name}`;
          const destination = path.join(library.directory, relative);
          await safeDirectory(library.directory, ['.local', 'packages', item.revision.slice(7)]);
          try { await rename(staged.root, destination); } catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
          catalog.skills.push({ ...item.entry, package: relative });
        } finally { await rm(staged.parent, { recursive: true, force: true }); }
      }
      await atomicWrite(filename, JSON.stringify(catalog, null, 2) + '\n');
      this.plans.delete(planId);
    } finally { try { await release?.(); } finally { await releaseProject(); } }
    try {
      const profiles = await projects.restoreProfiles(plan.backup.projects, hash(JSON.stringify(plan.backup.packages.map(p => [p.entry.skill_id, p.revision]))));
      return { saved: true, profiles, packages_added: plan.additions.length, partial: false };
    } catch (error) {
      return { saved: true, packages_added: plan.additions.length, partial: true, profile_error: error instanceof LibraryError ? error.message : 'Packages were saved, but profiles could not be restored. Review and retry the backup.' };
    }
  }
}
