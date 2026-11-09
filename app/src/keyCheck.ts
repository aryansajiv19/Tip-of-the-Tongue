import type { KeyName } from './keyStore';

export type KeyResult = 'ok' | 'invalid' | 'unreachable' | 'missing';

const REQUESTS: Record<KeyName, (key: string) => { url: string; headers: Record<string, string> }> =
  {
    anthropic: (key) => ({
      url: 'https://api.anthropic.com/v1/models?limit=1',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    }),
    deepgram: (key) => ({
      url: 'https://api.deepgram.com/v1/auth/token',
      headers: { Authorization: `Token ${key}` },
    }),
  };

// One cheap authenticated GET: 2xx is ok, 401/403 means the provider refused the key, and
// anything else (no network, timeout, server error) says nothing about the key.
export async function checkKey(
  name: KeyName,
  key: string | undefined,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<KeyResult> {
  if (!key) return 'missing';
  const { url, headers } = REQUESTS[name](key);
  try {
    const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return 'ok';
    return res.status === 401 || res.status === 403 ? 'invalid' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
