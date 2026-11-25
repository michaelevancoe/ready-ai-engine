export interface LocalApi {
  readonly apiUrl: string;
  readonly anonKey: string;
}

export function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function readLocalApi(): LocalApi | null {
  const apiUrl = envValue('READY_LOCAL_API_URL');
  const anonKey = envValue('READY_LOCAL_ANON_KEY');
  if (apiUrl === undefined || anonKey === undefined || !loopbackHttp(apiUrl)) return null;
  return { apiUrl: apiUrl.replace(/\/$/u, ''), anonKey };
}

function loopbackHttp(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}
