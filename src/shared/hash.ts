import { createHash } from 'node:crypto';

export const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
