import { randomUUID } from 'node:crypto';
import { writeFile, rename, rm } from 'node:fs/promises';

/** Flush the replacement file before publishing it. This is not a multi-file durability guarantee. */
export async function atomicWrite(filename: string, content: string) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: 'wx', flush: true });
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
}
