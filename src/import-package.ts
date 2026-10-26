import { projectLock } from './native.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { entrySchema, hash, LibraryError, readCatalog, readPackage, SkillLibrary, type Entry } from './library.js';

/** Publish a complete validated package before atomically updating the catalog. */
export async function importPackage(directory: string, from: string, metadata: Omit<Entry, 'package'>, options: { private?: boolean } = { private: true }) {
  const { files, frontmatter } = await readPackage(from);
  const digest = hash(JSON.stringify([...files].map(([p, bytes]) => [p, hash(bytes)])));
  const base = options.private === false ? directory : path.join(directory, '.local');
  const relative = `${options.private === false ? '' : '.local/'}packages/${digest}/${frontmatter.name}`;
  const entry = entrySchema.parse({ ...metadata, package: relative });
  const release = await projectLock(directory, 'catalog.lock');
  const temporary = path.join(base, `catalog.${randomUUID()}.tmp`);
  const staging = path.join(base, `packages/.import-${randomUUID()}`, frontmatter.name);
  try {
    await SkillLibrary.load(directory);
    const combined = await readCatalog(directory);
    let catalog: { version: 1; skills: Entry[] } = { version: 1, skills: [] };
    try { catalog = JSON.parse(await readFile(path.join(base, 'catalog.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (combined.skills.length >= 1000) throw new LibraryError('CATALOG_FULL', 'The library supports up to 1000 skills.');
    const duplicate = combined.skills.find(s => s.skill_id === entry.skill_id || (s.source.url.replace(/\.git$/, '').toLowerCase() === entry.source.url.toLowerCase() && s.source.path === entry.source.path));
    if (duplicate) throw new LibraryError('ALREADY_INSTALLED', `This skill is already saved as ${duplicate.skill_id}.`);
    await mkdir(staging, { recursive: true });
    for (const [p, bytes] of files) { const target = path.join(staging, p); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
    await readPackage(staging);
    const destination = path.join(directory, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    try { await rename(staging, destination); } catch (error) { if (!['ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
    catalog.skills.push(entry);
    await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n');
    await rename(temporary, path.join(base, 'catalog.json'));
    return entry;
  } finally { await rm(path.dirname(staging), { recursive: true, force: true }); await rm(temporary, { force: true }); await release(); }
}
