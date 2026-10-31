export class LibraryError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
