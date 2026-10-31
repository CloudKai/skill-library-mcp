import { randomUUID } from 'node:crypto';
import { link, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LibraryError } from './library-error.js';

const fail = (code: string, message: string): never => { throw new LibraryError(code, message); };

export async function projectLock(directory: string, filename = 'projects.lock') {
  const file = path.join(directory, filename);
  const candidate = path.join(directory, `${filename}.${randomUUID()}.tmp`);
  // Publish complete PID data atomically, so a crash cannot leave an empty lock.
  await writeFile(candidate, String(process.pid), { flag: 'wx' });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await link(candidate, file);
        return async () => { await rm(file, { force: true }); };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const pid = Number(await readFile(file, 'utf8').catch(() => ''));
        if (pid > 0) {
          try { process.kill(pid, 0); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') { await rm(file, { force: true }); continue; }
          }
        }
        fail('PROJECTS_BUSY', 'Another project change is in progress. Try again.');
      }
    }
    return fail('PROJECTS_BUSY', 'The project lock could not be acquired.');
  } finally { await rm(candidate, { force: true }); }
}
