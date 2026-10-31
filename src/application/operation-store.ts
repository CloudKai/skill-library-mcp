import { randomUUID } from 'node:crypto';
import { mkdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { atomicWrite } from '../shared/atomic-write.js';
import { projectLock } from '../shared/file-lock.js';
import { LibraryError } from '../shared/library-error.js';

const operationSchema = z.object({ id: z.string().uuid(), at: z.string(), action: z.string(), status: z.enum(['succeeded', 'partial', 'failed']), duration_ms: z.number(), code: z.string().optional() }).strict();
type Operation = z.infer<typeof operationSchema>;

/** Bounded local diagnostics contain outcomes, never payloads, paths or credentials. */
export class OperationStore {
  private filename: string;
  constructor(private directory: string) { this.filename = path.join(directory, '.local/operations.json'); }
  async list(): Promise<Operation[]> {
    try {
      const stat = await lstat(this.filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new LibraryError('INVALID_OPERATIONS', 'The local operation history is invalid. Preserve it and inspect it locally.');
      return z.array(operationSchema).max(100).parse(JSON.parse(await readFile(this.filename, 'utf8')));
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  }
  private async append(operation: Operation) {
    const release = await projectLock(this.directory, 'operations.lock');
    try {
      await mkdir(path.dirname(this.filename), { recursive: true });
      if ((await lstat(path.dirname(this.filename))).isSymbolicLink()) throw new LibraryError('INVALID_PATH', 'Private storage cannot be linked.');
      await atomicWrite(this.filename, JSON.stringify([...(await this.list()), operation].slice(-100)));
    } finally { await release(); }
  }
  async run<T extends object>(action: string, work: () => Promise<T>) {
    const started = Date.now(), id = randomUUID();
    try {
      const result = await work();
      const partial = (result as { partial?: boolean; native_error?: unknown }).partial || 'native_error' in result;
      const operation: Operation = { id, at: new Date().toISOString(), action, status: partial ? 'partial' : 'succeeded', duration_ms: Date.now() - started };
      const warning = await this.append(operation).then(() => undefined, () => 'The change completed, but its local diagnostic record could not be saved.');
      return { ...result, operation_id: id, ...(warning ? { operation_warning: warning } : {}) };
    } catch (error) {
      await this.append({ id, at: new Date().toISOString(), action, status: 'failed', duration_ms: Date.now() - started, code: error instanceof LibraryError ? error.code : 'INTERNAL_ERROR' }).catch(() => {});
      throw error;
    }
  }
}
