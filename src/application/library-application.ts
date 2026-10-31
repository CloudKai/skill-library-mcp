import { SkillLibrary } from '../library/skill-library.js';
import { ProjectStore } from '../projects/project-store.js';
import { LocalSkillScanner, type ScanInput } from '../local-skills/scanner.js';
import { MarketplaceClient, type installSchema, saveMarketplacePackage } from '../marketplace/client.js';
import { LibraryError } from '../shared/library-error.js';
import type { z } from 'zod';
import { LibraryMaintenance } from '../library/maintenance.js';
import { OperationStore } from './operation-store.js';

/** Owns the current library snapshot and coordinates operations spanning features. */
export class LibraryApplication {
  private currentProjects: ProjectStore;
  private refreshSequence = 0;
  readonly maintenance = new LibraryMaintenance();
  readonly operations: OperationStore;

  constructor(
    private currentLibrary: SkillLibrary,
    readonly marketplace = new MarketplaceClient(),
    readonly scanner = new LocalSkillScanner(),
  ) {
    this.currentProjects = new ProjectStore(currentLibrary);
    this.operations = new OperationStore(currentLibrary.directory);
  }

  get library() { return this.currentLibrary; }
  get projects() { return this.currentProjects; }

  async initialize() {
    await this.currentProjects.initialize();
  }

  async reload() {
    const sequence = ++this.refreshSequence;
    const library = await SkillLibrary.load(this.currentLibrary.directory);
    if (sequence !== this.refreshSequence) return;
    this.currentLibrary = library;
    this.currentProjects = new ProjectStore(library);
  }
  async restore(planId: string) {
    const result = await this.maintenance.restore(this.currentLibrary, this.currentProjects, planId);
    await this.reload();
    return result;
  }
  async applyUpdate(planId: string) {
    const result = await this.maintenance.applyUpdate(this.currentLibrary, this.currentProjects, planId);
    await this.reload(); return result;
  }
  async rollback(skillId: string, expectedRevision: string) {
    const result = await this.maintenance.rollback(this.currentLibrary, this.currentProjects, skillId, expectedRevision);
    await this.reload(); return result;
  }

  async scan(input: ScanInput) {
    return this.scanner.scan(input, this.currentLibrary, await this.currentProjects.list());
  }

  async importSkills(scanId: string, ids: string[]) {
    const result = await this.scanner.import(scanId, ids, this.currentLibrary);
    await this.reload();
    return result;
  }

  async install(input: z.infer<typeof installSchema>) {
    if ((input.targets.length || input.enabled) && !input.project_id) {
      throw new LibraryError('INVALID_INPUT', 'Choose a project before enabling or configuring coding apps.');
    }
    if (input.project_id) await this.currentProjects.get(input.project_id);
    const remote = await this.marketplace.call('get_marketplace_skill', {
      source: input.source,
      skill: input.skill,
      ...(input.path === undefined ? {} : { path: input.path }),
      commit: input.commit,
      include_files: true,
    });
    const saved = await saveMarketplacePackage(this.currentLibrary, input, remote);
    await this.reload();
    try {
      let project;
      if (input.project_id) {
        const current = await this.currentProjects.get(input.project_id);
        if (input.targets.length) {
          project = await this.currentProjects.bindNative(current.id, {
            skill_id: saved.skill_id,
            root: input.root,
            targets: input.targets,
            enabled: input.enabled || (saved.already_installed && current.enabled_skills.includes(saved.skill_id)),
            expected_revision: current.revision,
          });
        } else if (input.enabled) {
          project = await this.currentProjects.toggle(current.id, {
            skill_id: saved.skill_id, enabled: true, expected_revision: current.revision,
          });
        }
      }
      return {
        ...saved, saved: true, project, stages: { library: 'saved', activation: project ? 'applied' : 'not_requested' }, reload_required: input.targets.length > 0,
        note: 'Reconnect existing stdio library clients to load newly imported packages. Native agents may need a reload.',
      };
    } catch (error) {
      return {
        ...saved, saved: true, stages: { library: 'saved', activation: 'failed' },
        native_error: error instanceof LibraryError ? { code: error.code, message: error.message } : { code: 'INSTALLATION_FAILED', message: 'Saved to the library, but native activation failed. Refresh and retry.' },
        reload_required: false,
      };
    }
  }
}
