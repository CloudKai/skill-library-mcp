import { fileURLToPath } from 'node:url';

// Resolve from the module location so launch commands also work outside the repo.
export const defaultLibrary = fileURLToPath(new URL('../../library/', import.meta.url));
export const demoLibrary = fileURLToPath(new URL('../../demo-library/', import.meta.url));
export const publicDirectory = fileURLToPath(new URL('../../public/', import.meta.url));
export const stdioEntrypoint = fileURLToPath(new URL('../stdio.js', import.meta.url));
