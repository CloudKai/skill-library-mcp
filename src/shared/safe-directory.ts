import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { LibraryError } from './library-error.js';

/** Create only ordinary directories beneath an already canonical library root. */
export async function safeDirectory(root: string, segments: string[]) {
  let current = root;
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9._-]+$/.test(segment) || segment === '.' || segment === '..') throw new LibraryError('INVALID_PATH', 'Invalid storage directory.');
    current = path.join(current, segment);
    try { await mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new LibraryError('INVALID_PATH', 'Library storage cannot traverse linked or non-directory paths.');
  }
  return current;
}
