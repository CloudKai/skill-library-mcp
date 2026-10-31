import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { SkillLibrary } from '../library/skill-library.js';
import { hash } from '../shared/hash.js';
import { LibraryError } from '../shared/library-error.js';

export const nativeTargets = ['codex', 'claude-code', 'cursor'] as const;
export const bindingSchema = z.object({ skill_id: z.string().min(1).max(128), root: z.string().min(1).max(1024), targets: z.array(z.enum(nativeTargets)).min(1).max(3) }).strict();
export type Binding = z.infer<typeof bindingSchema>;
export type NativeProject = { id: string; enabled_skills: string[]; native_bindings: Binding[] };
const folders = { codex: '.agents', 'claude-code': '.claude', cursor: '.cursor' };
const marker = '.skill-library-owner.json';
const exists = async (p: string) => { try { return await lstat(p); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } };
const error = (code: string, message: string): never => { throw new LibraryError(code, message); };
export async function validateRoot(root: string) {
  if (!path.isAbsolute(root)) error('INVALID_PROJECT_DIRECTORY', 'Choose an absolute, existing project directory.');
  const resolved = await realpath(root).catch(() => error('INVALID_PROJECT_DIRECTORY', 'This project directory does not exist.'));
  if (resolved === path.parse(resolved).root || resolved === os.homedir() || !(await lstat(resolved)).isDirectory()) error('INVALID_PROJECT_DIRECTORY', 'Choose a project directory, not your home or filesystem root.');
  return resolved;
}
async function parents(root: string, segments: string[], create = true) {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const st = await exists(current);
    if (st?.isSymbolicLink() || (st && !st.isDirectory())) error('NATIVE_CONFLICT', `The native destination ${segment} is not an ordinary directory.`);
    if (!st && create) await mkdir(current);
  }
  return current;
}
async function fileHashes(directory: string, relative = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of await readdir(path.join(directory, relative))) {
    const rel = relative ? `${relative}/${name}` : name;
    const st = await lstat(path.join(directory, rel));
    if (st.isSymbolicLink()) error('NATIVE_CONFLICT', 'A managed skill contains a symbolic link. Its files were preserved.');
    if (st.isDirectory()) Object.assign(result, await fileHashes(directory, rel));
    else if (st.isFile() && rel !== marker) result[rel] = hash(await readFile(path.join(directory, rel)));
    else if (!st.isFile()) error('NATIVE_CONFLICT', 'A native skill contains an unsupported file.');
  }
  return result;
}
function canonical(value: Record<string, string>) { return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))); }
async function assertOwned(directory: string, owner: { library: string; project: string; skill: string }) {
  const st = await exists(directory);
  if (!st || st.isSymbolicLink() || !st.isDirectory()) error('NATIVE_CONFLICT', 'The native skill directory was moved or replaced. Its files were preserved.');
  let saved: any;
  try { saved = JSON.parse(await readFile(path.join(directory, marker), 'utf8')); } catch { error('NATIVE_CONFLICT', 'A skill with this name already exists and is not managed by this library.'); }
  if (saved.library !== owner.library || saved.project !== owner.project || saved.skill !== owner.skill || canonical(await fileHashes(directory)) !== canonical(saved.hashes ?? {})) error('NATIVE_CONFLICT', 'The native skill belongs to another installation or was edited. Its files were preserved. Resolve the conflict before changing activation.');
}
type Change = { kind: 'add' | 'remove'; final: string; stage: string; staging_root: string; owner: { library: string; project: string; skill: string } };
type Journal = { version: 1; before_hash: string; after_hash: string; changes: Change[] };
const journalSchema = z.object({ version: z.literal(1), before_hash: z.string().regex(/^[a-f0-9]{64}$/), after_hash: z.string().regex(/^[a-f0-9]{64}$/), changes: z.array(z.object({ kind: z.enum(['add', 'remove']), final: z.string(), stage: z.string(), staging_root: z.string(), owner: z.object({ library: z.string(), project: z.string(), skill: z.string() }).strict() }).strict()).max(3000) }).strict();

/** Native writes are staged outside agent skill discovery and recoverable across a crash. */
export class NativeTransaction {
  private journalFile: string;
  private journal?: Journal;
  constructor(private directory: string) { this.journalFile = path.join(directory, 'native-transaction.json'); }
  async preview(before: NativeProject[], after: NativeProject[], library: SkillLibrary) {
    const destinations = (projects: NativeProject[]) => projects.flatMap(p => p.native_bindings.filter(b => p.enabled_skills.includes(b.skill_id)).flatMap(b => b.targets.map(target => ({
      path: path.join(b.root, folders[target], 'skills', library.get(b.skill_id).name), root: b.root, target,
      owner: { library: this.directory, project: p.id, skill: b.skill_id },
    }))));
    const old = destinations(before), next = destinations(after);
    const changes: { path: string; action: 'add' | 'remove' | 'unchanged'; conflict?: string }[] = [];
    for (const item of [...old.filter(x => !next.some(n => n.path === x.path)), ...next]) {
      const previous = old.find(x => x.path === item.path);
      const desired = next.find(x => x.path === item.path);
      const action = !desired ? 'remove' : previous ? 'unchanged' : 'add';
      let conflict: string | undefined;
      try {
        if (await validateRoot(item.root) !== item.root) error('NATIVE_CONFLICT', 'The configured directory resolves elsewhere.');
        await parents(item.root, [folders[item.target], 'skills'], false);
        if (next.filter(x => x.path === item.path).length > 1) error('NATIVE_CONFLICT', 'Two selected skills would use this destination.');
        if (previous && desired && JSON.stringify(previous.owner) !== JSON.stringify(desired.owner)) error('NATIVE_CONFLICT', 'Another project owns this destination.');
        if (previous) await assertOwned(item.path, previous.owner);
        else if (await exists(item.path)) error('NATIVE_CONFLICT', 'This destination already exists. Nothing will be overwritten.');
      } catch (e) { conflict = e instanceof Error ? e.message : 'Destination could not be checked.'; }
      changes.push({ path: item.path, action, ...(conflict ? { conflict } : {}) });
    }
    return { can_apply: changes.every(c => !c.conflict), changes };
  }
  async recover() {
    if (!await exists(this.journalFile)) return;
    let saved: Journal;
    try {
      const stat = await lstat(this.journalFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('Invalid recovery file');
      saved = journalSchema.parse(JSON.parse(await readFile(this.journalFile, 'utf8')));
    } catch { return error('RECOVERY_REQUIRED', 'Native recovery data is invalid. Preserve it and its staging folders for local inspection.'); }
    // A journal is generated by this app; still bound recovery to its exact managed paths.
    for (const c of saved.changes) {
      if (!['add', 'remove'].includes(c.kind) || c.owner.library !== this.directory || !path.isAbsolute(c.final) || !path.isAbsolute(c.stage) || !path.basename(c.staging_root).startsWith('.skill-library-tx-') || path.dirname(c.stage) !== c.staging_root || path.dirname(path.dirname(c.final)) !== path.dirname(c.staging_root) || path.basename(path.dirname(c.final)) !== 'skills' || !Object.values(folders).includes(path.basename(path.dirname(c.staging_root)))) error('RECOVERY_REQUIRED', 'Native recovery paths are invalid. Files were preserved.');
      const root = path.dirname(path.dirname(c.staging_root));
      if (await validateRoot(root) !== root) error('RECOVERY_REQUIRED', 'A recovery root resolves elsewhere. Files were preserved.');
      await parents(root, [path.basename(path.dirname(c.staging_root)), 'skills'], false);
      const staging = await exists(c.staging_root);
      if (staging?.isSymbolicLink() || (staging && !staging.isDirectory())) error('RECOVERY_REQUIRED', 'A recovery staging folder was replaced. Files were preserved.');
    }
    const current = await readFile(path.join(this.directory, 'projects.json'), 'utf8').catch(() => '{"version":1,"projects":[]}');
    this.journal = saved;
    if (hash(current) === saved.after_hash) await this.finish();
    else if (hash(current) === saved.before_hash) await this.rollback();
    else error('RECOVERY_REQUIRED', 'Project settings changed during an interrupted native operation. Recovery data and native files were preserved.');
  }
  async prepare(before: NativeProject[], after: NativeProject[], beforeText: string, afterText: string, library: SkillLibrary) {
    const changes: Change[] = [];
    const staged: string[] = [];
    const owned = (projects: NativeProject[]) => {
      const result = new Map<string, { binding: Binding; target: typeof nativeTargets[number]; owner: Change['owner'] }>();
      for (const p of projects) for (const b of p.native_bindings) if (p.enabled_skills.includes(b.skill_id)) for (const target of b.targets) {
        const skill = library.get(b.skill_id);
        const final = path.join(b.root, folders[target], 'skills', skill.name);
        if (result.has(final)) error('NATIVE_CONFLICT', 'Two enabled skills would use the same native directory.');
        result.set(final, { binding: b, target, owner: { library: this.directory, project: p.id, skill: b.skill_id } });
      }
      return result;
    };
    const old = owned(before), next = owned(after);
    try {
      for (const [final, entry] of old) if (!next.has(final)) {
        if (await validateRoot(entry.binding.root) !== entry.binding.root) error('NATIVE_CONFLICT', 'The configured project directory now resolves elsewhere. Its files were preserved. Choose the directory again.');
        await parents(entry.binding.root, [folders[entry.target], 'skills']);
        await assertOwned(final, entry.owner);
        const stagingRoot = path.join(entry.binding.root, folders[entry.target], `.skill-library-tx-${randomUUID()}`);
        await mkdir(stagingRoot); staged.push(stagingRoot);
        changes.push({ kind: 'remove', final, stage: path.join(stagingRoot, path.basename(final)), staging_root: stagingRoot, owner: entry.owner });
      }
      for (const [final, entry] of next) {
        if (old.has(final)) {
          if (old.get(final)!.owner.skill !== entry.owner.skill || old.get(final)!.owner.project !== entry.owner.project) error('NATIVE_CONFLICT', 'Another project already manages this native directory.');
          continue;
        }
        if (await validateRoot(entry.binding.root) !== entry.binding.root) error('NATIVE_CONFLICT', 'The configured project directory now resolves elsewhere. Its files were preserved. Choose the directory again.');
        await parents(entry.binding.root, [folders[entry.target], 'skills']);
        if (await exists(final)) error('NATIVE_CONFLICT', `A skill named ${path.basename(final)} already exists in ${entry.target}. Nothing was overwritten.`);
        const stagingRoot = path.join(entry.binding.root, folders[entry.target], `.skill-library-tx-${randomUUID()}`);
        await mkdir(stagingRoot); staged.push(stagingRoot);
        const stage = path.join(stagingRoot, path.basename(final)); await mkdir(stage);
        const skill = library.get(entry.owner.skill);
        const hashes: Record<string, string> = {};
        for (const f of skill.manifest) {
          if (f.path === marker) error('INVALID_PACKAGE', 'The package uses the installer’s reserved ownership filename.');
          const data = library.read(skill.skill_id, skill.revision, f.path);
          const bytes = Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8');
          const dest = path.join(stage, f.path); await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, bytes); hashes[f.path] = hash(bytes);
        }
        await writeFile(path.join(stage, marker), JSON.stringify({ ...entry.owner, hashes }));
        changes.push({ kind: 'add', final, stage, staging_root: stagingRoot, owner: entry.owner });
      }
      if (!changes.length) return;
      this.journal = { version: 1, before_hash: hash(beforeText), after_hash: hash(afterText), changes };
      await writeFile(this.journalFile, JSON.stringify(this.journal), { flag: 'wx', flush: true, mode: 0o600 });
    } catch (e) { for (const p of staged) await rm(p, { recursive: true, force: true }); throw e; }
  }
  async apply() {
    for (const c of this.journal?.changes ?? []) {
      if (c.kind === 'add') { if (await exists(c.final)) error('NATIVE_CONFLICT', 'The destination appeared during installation. Nothing was overwritten.'); await rename(c.stage, c.final); }
      else { await assertOwned(c.final, c.owner); await rename(c.final, c.stage); }
    }
  }
  async rollback() {
    for (const c of [...(this.journal?.changes ?? [])].reverse()) {
      if (c.kind === 'add' && !await exists(c.stage) && await exists(c.final)) { await assertOwned(c.final, c.owner); await rename(c.final, c.stage); }
      if (c.kind === 'remove' && await exists(c.stage)) { if (await exists(c.final)) error('RECOVERY_REQUIRED', 'The rollback destination is occupied. Recovery files were preserved.'); await assertOwned(c.stage, c.owner); await rename(c.stage, c.final); }
    }
    await this.finish();
  }
  async finish() {
    for (const c of this.journal?.changes ?? []) await rm(c.staging_root, { recursive: true, force: true });
    await rm(this.journalFile, { force: true }); this.journal = undefined;
  }
}
