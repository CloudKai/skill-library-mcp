/** Demo is an explicit URL scope; real app URLs remain the default. */
export function appPath(path, pathname = globalThis.location?.pathname ?? '') {
  return /^\/demo(?:\/|$)/.test(pathname) && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/demo/') ? `/demo${path}` : path;
}
