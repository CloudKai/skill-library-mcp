import { defaultLibrary } from '../shared/paths.js';
import { hash } from '../shared/hash.js';
import { LibraryError } from '../shared/library-error.js';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { z } from 'zod';

const sourceSchema = z.object({ url: z.string(), path: z.string(), commit: z.string().optional(), bundle_version: z.string().optional(), note: z.string().optional() }).strict();
const previousSchema = z.object({ package: z.string(), source: sourceSchema, requirements: z.array(z.string()), requirements_assessment: z.enum(['unknown', 'curator_listed']).optional() }).strict();
export const entrySchema = z.object({
  skill_id: z.string().regex(/^[a-z0-9][a-z0-9/_-]{0,127}$/),
  package: z.string(), tags: z.array(z.string().min(1).max(64)).max(30),
  folder: z.string().trim().min(1).max(100).default('General skills'),
  standalone: z.boolean().default(false),
  preferred: z.boolean(), status: z.enum(['active', 'archived']),
  personal_notes: z.string().max(4000), requirements: z.array(z.string().min(1).max(64)).max(30),
  requirements_assessment: z.enum(['unknown', 'curator_listed']).optional(),
  overrides_starter: z.boolean().optional(),
  history: z.array(previousSchema).max(20).optional(),
  source: sourceSchema,
}).strict();
const catalogSchema = z.object({ version: z.literal(1), skills: z.array(entrySchema).max(1000) }).strict();
export type Entry = z.infer<typeof entrySchema>;
type Frontmatter = Record<string, unknown> & { name: string; description: string };
export type ManifestFile = { path: string; uri: string; sha256: string; size_bytes: number; mime_type: string };
export type Snapshot = { entry: Entry; revision: string; frontmatter: Frontmatter; manifest: ManifestFile[]; files: Map<string, Buffer> };
const fail = (code: string, message: string): never => { throw new LibraryError(code, message); };
export function safeRelative(value: string) {
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..')) {
    fail('INVALID_PATH', 'Use a relative path from the skill manifest without parent segments.');
  }
  return value;
}
const mime = (p: string) => ({ '.md': 'text/markdown', '.json': 'application/json', '.yaml': 'text/yaml', '.yml': 'text/yaml', '.sh': 'text/x-shellscript', '.py': 'text/x-python', '.js': 'text/javascript', '.ts': 'text/typescript', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' }[path.extname(p)] ?? (path.basename(p) === 'LICENSE' ? 'text/plain' : 'application/octet-stream'));

export function parseSkill(bytes: Buffer): Frontmatter {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail('INVALID_SKILL', 'SKILL.md must contain UTF-8 text.'); }
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return fail('INVALID_SKILL', 'SKILL.md needs YAML frontmatter.');
  const document = parseDocument(match[1]!);
  if (document.errors.length) return fail('INVALID_SKILL', 'SKILL.md contains invalid YAML.');
  const parsed: unknown = document.toJS({ maxAliasCount: 50 });
  const result = z.object({ name: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().min(1).max(1024) }).passthrough().safeParse(parsed);
  if (!result.success) return fail('INVALID_SKILL', 'Skill name or description does not follow the Agent Skills format.');
  return result.data;
}

export async function readPackage(directory: string) {
  const files = new Map<string, Buffer>();
  let total = 0;
  let directories = 0;
  async function walk(relative = ''): Promise<void> {
    directories++;
    if (directories > 256 || relative.split('/').length > 16) fail('PACKAGE_TOO_LARGE', 'Package has too many directories or is nested too deeply.');
    const folder = path.join(directory, relative);
    if ((await lstat(folder)).isSymbolicLink()) fail('INVALID_PATH', 'Skill packages cannot contain symbolic links.');
    for (const name of (await readdir(folder)).sort()) {
      const rel = relative ? `${relative}/${name}` : name;
      safeRelative(rel);
      const stat = await lstat(path.join(directory, rel));
      if (stat.isSymbolicLink()) fail('INVALID_PATH', `Symbolic links are not imported: ${rel}`);
      if (stat.isDirectory()) { await walk(rel); continue; }
      if (!stat.isFile()) fail('INVALID_PATH', `Unsupported file type: ${rel}`);
      if (stat.size > 2 * 1024 * 1024 || (rel === 'SKILL.md' && stat.size > 256 * 1024)) fail('FILE_TOO_LARGE', `File exceeds the documented limit: ${rel}`);
      const bytes = await readFile(path.join(directory, rel));
      total += bytes.length;
      if (bytes.length > 2 * 1024 * 1024 || total > 8 * 1024 * 1024 || files.size >= 128) fail('PACKAGE_TOO_LARGE', 'Package exceeds 128 files or 8 MiB.');
      files.set(rel, bytes);
    }
  }
  await walk();
  const main = files.get('SKILL.md');
  if (!main) return fail('INVALID_SKILL', 'No SKILL.md found at the package root.');
  const frontmatter = parseSkill(main);
  if (frontmatter.name !== path.basename(directory)) fail('INVALID_SKILL', 'Skill name must match its directory name.');
  return { files, frontmatter };
}

/** Merge the shareable starter catalog with owner-only imports. */
export async function readCatalog(directory: string) {
  const starter = catalogSchema.parse(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')));
  let local: z.infer<typeof catalogSchema> = { version: 1, skills: [] };
  try { local = catalogSchema.parse(JSON.parse(await readFile(path.join(directory, '.local/catalog.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const skills = new Map(starter.skills.map(entry => [entry.skill_id, entry]));
  for (const entry of local.skills) {
    if (skills.has(entry.skill_id) && !entry.overrides_starter) fail('INVALID_CATALOG', 'Duplicate skill_id without an explicit private starter override.');
    if (local.skills.filter(s => s.skill_id === entry.skill_id).length > 1) fail('INVALID_CATALOG', 'Duplicate local skill_id.');
    skills.set(entry.skill_id, entry);
  }
  return catalogSchema.parse({ version: 1, skills: [...skills.values()] });
}

export class SkillLibrary {
  private constructor(private snapshots: Map<string, Snapshot>, public catalogRevision: string, public directory: string) {}
  static async load(directory = defaultLibrary) {
    const root = await realpath(directory);
    const catalog = await readCatalog(root);
    const snapshots = new Map<string, Snapshot>();
    const byteLimit = Number(process.env.SKILL_LIBRARY_MAX_BYTES ?? 128 * 1024 * 1024);
    if (!Number.isSafeInteger(byteLimit) || byteLimit < 1024 * 1024 || byteLimit > 1024 * 1024 * 1024) fail('INVALID_INPUT', 'SKILL_LIBRARY_MAX_BYTES must be an integer between 1 MiB and 1 GiB.');
    let loadedBytes = 0;
    for (const entry of catalog.skills) {
      if (snapshots.has(entry.skill_id)) fail('INVALID_CATALOG', 'Duplicate skill_id in catalog.');
      const relative = safeRelative(entry.package);
      let ancestor = root;
      for (const segment of relative.split('/')) {
        ancestor = path.join(ancestor, segment);
        if ((await lstat(ancestor)).isSymbolicLink()) fail('INVALID_PATH', 'Catalog packages cannot traverse symbolic links.');
      }
      const packageRoot = await realpath(path.join(root, relative));
      if (!packageRoot.startsWith(root + path.sep)) fail('INVALID_PATH', 'Package must be inside the library directory.');
      const { files, frontmatter } = await readPackage(packageRoot);
      loadedBytes += [...files.values()].reduce((n, bytes) => n + bytes.length, 0);
      if (loadedBytes > byteLimit) fail('LIBRARY_TOO_LARGE', 'The package snapshot exceeds its aggregate memory budget. Remove unused saved bytes or raise SKILL_LIBRARY_MAX_BYTES deliberately.');
      const digests = [...files].map(([p, b]) => [p, hash(b)]);
      const revision = `sha256:${hash(JSON.stringify(digests))}`;
      const manifest = [...files].map(([p, b]) => ({ path: p, uri: `skill://library/${encodeURIComponent(entry.skill_id)}/${revision}/${frontmatter.name}/${p.split('/').map(encodeURIComponent).join('/')}`, sha256: hash(b), size_bytes: b.length, mime_type: mime(p) }));
      snapshots.set(entry.skill_id, { entry, revision, frontmatter, manifest, files });
    }
    return new SkillLibrary(snapshots, hash(JSON.stringify([...snapshots.values()].map(s => [s.entry, s.revision]))), root);
  }
  /** A project scope restricts every access path, including direct file reads. */
  forSkills(ids: string[], projectId: string) {
    const allowed = new Set(ids);
    const snapshots = new Map([...this.snapshots].filter(([id]) => allowed.has(id)));
    return new SkillLibrary(snapshots, hash(JSON.stringify([this.catalogRevision, projectId, [...allowed].sort()])), this.directory);
  }
  catalog(includeArchived = false) {
    return [...this.snapshots.values()].filter(s => includeArchived || s.entry.status === 'active').map(s => ({
      ...this.summary(s), personal_notes: s.entry.personal_notes, source: s.entry.source,
      file_count: s.files.size,
    }));
  }
  exportPackages() {
    return [...this.snapshots.keys()].map(id => this.exportPackage(id)!);
  }
  exportPackage(id: string) {
    const s = this.snapshots.get(id);
    return s ? { entry: structuredClone(s.entry), revision: s.revision, files: [...s.files].map(([filePath, bytes]) => ({ path: filePath, content: bytes.toString('base64'), size_bytes: bytes.length, sha256: hash(bytes) })) } : undefined;
  }
  private lookup(id: string, revision?: string) {
    const s = this.snapshots.get(id);
    if (!s) return fail('SKILL_NOT_FOUND', 'No skill with that ID exists in this library.');
    if (s.entry.status !== 'active') return fail('ARCHIVED_SKILL', 'This skill is archived. Restore it in catalog.json and restart.');
    if (revision && s.revision !== revision) return fail('REVISION_NOT_FOUND', 'This server snapshot does not contain that revision. Retrieve the current skill again.');
    return s;
  }
  private summary(s: Snapshot) {
    const requirementsAssessment = s.entry.requirements_assessment ?? (s.entry.requirements.length ? 'curator_listed' : 'unknown');
    return { skill_id: s.entry.skill_id, revision: s.revision, name: s.frontmatter.name, description: s.frontmatter.description, folder: s.entry.folder, standalone: s.entry.standalone, tags: s.entry.tags, preferred: s.entry.preferred, status: s.entry.status, requirements: s.entry.requirements, requirements_assessment: requirementsAssessment, author_compatibility: typeof s.frontmatter.compatibility === 'string' ? s.frontmatter.compatibility : null };
  }
  list(args: { tags?: string[]; preferred_only?: boolean; limit?: number; cursor?: string }) {
    const filters = hash(JSON.stringify({ tags: [...(args.tags ?? [])].sort(), preferred_only: args.preferred_only ?? false }));
    let offset = 0;
    if (args.cursor) {
      try {
        const value = JSON.parse(Buffer.from(args.cursor, 'base64url').toString());
        if (value.catalog !== this.catalogRevision || value.filters !== filters || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error();
        offset = value.offset;
      } catch { return fail('CURSOR_EXPIRED', 'Invalid or outdated cursor. Restart the listing with the same filters.'); }
    }
    const all = [...this.snapshots.values()].filter(s => s.entry.status === 'active' && (!args.preferred_only || s.entry.preferred) && (args.tags ?? []).every(t => s.entry.tags.includes(t))).sort((a, b) => a.entry.skill_id.localeCompare(b.entry.skill_id));
    if (offset > all.length) return fail('CURSOR_EXPIRED', 'Cursor is outside this catalog. Restart the listing.');
    const end = offset + (args.limit ?? 20);
    return { skills: all.slice(offset, end).map(s => this.summary(s)), next_cursor: end < all.length ? Buffer.from(JSON.stringify({ catalog: this.catalogRevision, filters, offset: end })).toString('base64url') : null, catalog_revision: this.catalogRevision };
  }
  search(args: { query: string; tags?: string[]; capabilities?: string[]; limit?: number }) {
    const stop = new Set(['a', 'an', 'and', 'are', 'for', 'how', 'i', 'in', 'is', 'it', 'my', 'of', 'on', 'the', 'this', 'to', 'with']);
    const tokens = [...new Set(args.query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(t => !stop.has(t));
    const matches = [...this.snapshots.values()].filter(s => s.entry.status === 'active' && (args.tags ?? []).every(t => s.entry.tags.includes(t))).map(s => {
      const fields = [s.frontmatter.name, s.frontmatter.description, s.entry.tags.join(' '), s.entry.personal_notes].map(f => f.normalize('NFKC').toLowerCase());
      const exact = s.frontmatter.name === args.query.toLowerCase().trim();
      const matched = tokens.filter(t => fields.some(f => f.includes(t)));
      const score = (exact ? 100 : 0) + tokens.reduce((n, t) => n + fields.reduce((sum, f, i) => sum + (f.includes(t) ? [8, 3, 5, 2][i]! : 0), 0), 0);
      const missing = args.capabilities ? s.entry.requirements.filter(r => !args.capabilities!.includes(r)) : [];
      const summary = this.summary(s);
      return { ...summary, score, match_reasons: exact ? ['Exact skill name'] : matched.map(t => `Matched: ${t}`), compatibility: !args.capabilities || summary.requirements_assessment === 'unknown' ? 'unknown' : missing.length ? 'missing_requirements' : 'compatible', missing_requirements: missing };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score || Number(b.preferred) - Number(a.preferred) || a.skill_id.localeCompare(b.skill_id));
    return { matches: matches.slice(0, args.limit ?? 5).map(({ score, ...s }) => s), total_matches: matches.length, compatibility_note: 'Compatible means only that curator-listed capabilities match. Unassessed requirements remain unknown. Author compatibility is preserved as free text; credentials, runtime, and complete dependencies are not verified.' };
  }
  get(id: string, revision?: string) {
    const s = this.lookup(id, revision);
    return { ...this.summary(s), previous_revisions: (s.entry.history ?? []).map(h => ({ commit: h.source.commit ?? null })), skill_uri: s.manifest.find(f => f.path === 'SKILL.md')!.uri, frontmatter: s.frontmatter, instructions: s.files.get('SKILL.md')!.toString('utf8'), manifest: s.manifest, source: s.entry.source, personal_notes: s.entry.personal_notes, activation_note: 'Retrieved instructions only. The host chooses whether to follow them. No scripts are run or permissions granted.' };
  }
  read(id: string, revision: string, filePath: string) {
    safeRelative(filePath);
    const s = this.lookup(id, revision);
    const file = s.manifest.find(f => f.path === filePath);
    if (!file) return fail('FILE_NOT_FOUND', 'That file is not in this skill revision manifest.');
    const bytes = s.files.get(filePath)!;
    if (hash(bytes) !== file.sha256) return fail('CONTENT_INTEGRITY_ERROR', 'The content does not match its manifest.');
    let content: string;
    let encoding: 'utf-8' | 'base64' = 'utf-8';
    try {
      if (bytes.includes(0)) throw new Error();
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { encoding = 'base64'; content = bytes.toString('base64'); }
    return { skill_id: id, revision, ...file, encoding, content };
  }
  stats() { return { skills: this.snapshots.size, files: [...this.snapshots.values()].reduce((n, s) => n + s.files.size, 0), bytes: [...this.snapshots.values()].reduce((n, s) => n + [...s.files.values()].reduce((sum, bytes) => sum + bytes.length, 0), 0), catalog_revision: this.catalogRevision }; }
}
