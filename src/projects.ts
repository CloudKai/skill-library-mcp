import { randomUUID } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { hash, LibraryError, SkillLibrary } from './library.js';
import { bindingSchema, NativeTransaction, projectLock, validateRoot } from './native.js';

export const projectIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const projectSchema = z.object({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(100),
  path: z.string().trim().max(500).default(''),
  enabled_skills: z.array(z.string().min(1).max(128)).max(1000),
  native_bindings: z.array(bindingSchema).max(1000).default([]),
}).strict();
const fileSchema = z.object({ version: z.literal(1), projects: z.array(projectSchema).max(100) }).strict();
type Project = z.infer<typeof projectSchema>;
type ProjectFile = z.infer<typeof fileSchema>;
export const createProjectSchema = z.object({ name: z.string().trim().min(1).max(100), path: z.string().trim().max(500).default('') }).strict();
export const toggleSkillSchema = z.object({ skill_id: z.string().min(1).max(128), enabled: z.boolean(), expected_revision: z.string().length(64) }).strict();
export const toggleFolderSchema = z.object({ folder: z.string().trim().min(1).max(100), enabled: z.boolean(), expected_revision: z.string().length(64) }).strict();
const revision = (project: Project) => hash(JSON.stringify(project));

export class ProjectStore {
  private filename: string;
  constructor(private library: SkillLibrary) {
    this.filename = path.join(library.directory, 'projects.json');
  }
  async initialize() {
    const release = await projectLock(this.library.directory);
    try { await new NativeTransaction(this.library.directory).recover(); } finally { await release(); }
  }
  private async read(locked = false): Promise<ProjectFile> {
    if (!locked) {
      const pending = await access(path.join(this.library.directory, 'native-transaction.json')).then(() => true, () => false);
      if (pending) throw new LibraryError('RECOVERY_REQUIRED', 'A native activation is pending. Retry shortly or restart the local server to recover.');
    }
    let text: string;
    try { text = await readFile(this.filename, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, projects: [] };
      throw error;
    }
    const parsed = fileSchema.parse(JSON.parse(text));
    if (new Set(parsed.projects.map(p => p.id)).size !== parsed.projects.length) throw new LibraryError('INVALID_PROJECTS', 'Duplicate project IDs in projects.json.');
    return parsed;
  }
  async list() {
    return (await this.read()).projects.map(p => ({ ...p, revision: revision(p) }));
  }
  async get(id: string) {
    projectIdSchema.parse(id);
    const project = (await this.list()).find(p => p.id === id);
    if (!project) throw new LibraryError('PROJECT_NOT_FOUND', 'This project no longer exists. Choose another project.');
    return project;
  }
  async scope(id: string) {
    const project = await this.get(id);
    return this.library.forSkills(project.enabled_skills, project.id);
  }
  private async mutate<T>(update: (data: ProjectFile) => T | Promise<T>) {
    const release = await projectLock(this.library.directory);
    const transaction = new NativeTransaction(this.library.directory);
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    let committed = false;
    try {
      await transaction.recover();
      const beforeText = await readFile(this.filename, 'utf8').catch((e) => { if (e.code === 'ENOENT') return '{"version":1,"projects":[]}'; throw e; });
      const data = await this.read(true);
      const before = structuredClone(data.projects);
      const result = await update(data);
      const afterText = JSON.stringify(data, null, 2) + '\n';
      await transaction.prepare(before, data.projects, beforeText, afterText, this.library);
      await writeFile(temporary, afterText);
      await transaction.apply();
      await rename(temporary, this.filename);
      committed = true;
      await transaction.finish();
      return result;
    } catch (e) { if (!committed) await transaction.rollback(); throw e; }
    finally { await rm(temporary, { force: true }); await release(); }
  }
  async bindNative(id: string, input: { skill_id: string; root: string; targets: ('codex' | 'claude-code' | 'cursor')[]; enabled: boolean; expected_revision: string }) {
    this.library.get(input.skill_id);
    const root = input.targets.length ? await validateRoot(input.root) : input.root;
    return this.mutate(data => {
      const project = data.projects.find(p => p.id === id);
      if (!project) throw new LibraryError('PROJECT_NOT_FOUND', 'Choose an existing project.');
      if (revision(project) !== input.expected_revision) throw new LibraryError('REVISION_CONFLICT', 'The project changed. Refresh and try again.');
      project.native_bindings = project.native_bindings.filter(b => b.skill_id !== input.skill_id);
      if (input.targets.length) project.native_bindings.push(bindingSchema.parse({ skill_id: input.skill_id, root, targets: [...new Set(input.targets)] }));
      const selected = new Set(project.enabled_skills);
      if (input.enabled) selected.add(input.skill_id); else selected.delete(input.skill_id);
      project.enabled_skills = [...selected].sort();
      return { ...project, revision: revision(project), reload_required: true };
    });
  }
  async create(input: z.infer<typeof createProjectSchema>) {
    return this.mutate(data => {
      if (data.projects.length >= 100) throw new LibraryError('PROJECT_LIMIT', 'The local library supports up to 100 projects.');
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
      const project: Project = { id: `${slug}-${randomUUID().slice(0, 8)}`, name: input.name, path: input.path, enabled_skills: [], native_bindings: [] };
      data.projects.push(project);
      return { ...project, revision: revision(project) };
    });
  }
  async toggle(id: string, input: z.infer<typeof toggleSkillSchema>) {
    projectIdSchema.parse(id);
    // Validate against the owner catalog; projects never install code themselves.
    this.library.get(input.skill_id);
    return this.mutate(data => {
      const project = data.projects.find(p => p.id === id);
      if (!project) throw new LibraryError('PROJECT_NOT_FOUND', 'This project no longer exists.');
      if (revision(project) !== input.expected_revision) throw new LibraryError('REVISION_CONFLICT', 'The project changed in another tab. Refresh and try again.');
      const selected = new Set(project.enabled_skills);
      if (input.enabled) selected.add(input.skill_id);
      else selected.delete(input.skill_id);
      project.enabled_skills = [...selected].sort();
      return { ...project, revision: revision(project) };
    });
  }
  async toggleFolder(id: string, input: z.infer<typeof toggleFolderSchema>) {
    projectIdSchema.parse(id);
    const members = this.library.catalog().filter(skill => !skill.standalone && skill.folder === input.folder).map(skill => skill.skill_id);
    if (!members.length) throw new LibraryError('FOLDER_NOT_FOUND', 'This skill folder no longer exists. Refresh the library.');
    return this.mutate(data => {
      const project = data.projects.find(p => p.id === id);
      if (!project) throw new LibraryError('PROJECT_NOT_FOUND', 'This project no longer exists.');
      if (revision(project) !== input.expected_revision) throw new LibraryError('REVISION_CONFLICT', 'The project changed in another tab. Refresh and try again.');
      const selected = new Set(project.enabled_skills);
      for (const skillId of members) {
        if (input.enabled) selected.add(skillId);
        else selected.delete(skillId);
      }
      project.enabled_skills = [...selected].sort();
      return { ...project, revision: revision(project) };
    });
  }
}
