const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function resolveAgainstApp(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path) || /^(?:data|blob):/i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return configuredBase ? `${configuredBase}${normalizedPath}` : normalizedPath;
}

export function apiUrl(path: string): string {
  return resolveAgainstApp(path);
}

export function resourceUrl(path: string): string {
  return resolveAgainstApp(path);
}

export function webSocketUrl(path: string): string {
  const target = resolveAgainstApp(path);
  if (/^wss?:\/\//i.test(target)) return target;
  if (/^https?:\/\//i.test(target)) return target.replace(/^http/i, 'ws');
  if (typeof window === 'undefined') return target;
  const url = new URL(target, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
