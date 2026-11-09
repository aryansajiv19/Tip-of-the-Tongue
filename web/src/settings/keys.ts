// The user's own provider keys, as the desktop app reports them (window.tott.keys). The page can
// set and test keys but never read one back.
export type Presence = 'set' | 'missing';
export type Check = 'ok' | 'invalid' | 'unreachable' | 'missing';
export type Provider = 'anthropic' | 'deepgram';

export const PROVIDERS: Record<
  Provider,
  { name: string; job: string; getKey: string; label: string }
> = {
  anthropic: {
    name: 'Anthropic',
    job: 'Finds the word',
    getKey: 'https://console.anthropic.com/settings/keys',
    label: 'Anthropic key',
  },
  deepgram: {
    name: 'Deepgram',
    job: 'Hears you speak',
    getKey: 'https://console.deepgram.com/signup',
    label: 'Deepgram key',
  },
};

// What a check result means, in plain words. Never a status code or an environment variable.
export function checkMessage(provider: Provider, check: Check): string {
  const { name } = PROVIDERS[provider];
  switch (check) {
    case 'ok':
      return 'Works';
    case 'invalid':
      return `${name} did not accept this key. Check that you copied all of it.`;
    case 'unreachable':
      return `Could not reach ${name}. Check your internet connection and try again.`;
    case 'missing':
      return 'No key yet';
  }
}

// Only what was typed is sent; an empty field keeps the saved key.
export function keysToSave(typed: Record<Provider, string>): Partial<Record<Provider, string>> {
  const out: Partial<Record<Provider, string>> = {};
  for (const p of Object.keys(typed) as Provider[]) {
    const value = typed[p].trim();
    if (value) out[p] = value;
  }
  return out;
}

// The setup screen shows while a key is missing, unless the user chose demo mode.
export const needsSetup = (status: Record<Provider, Presence> | null): boolean =>
  status !== null && (status.anthropic === 'missing' || status.deepgram === 'missing');

const DEMO_KEY = 'tott.demo';

export function demoChosen(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function chooseDemo(): void {
  try {
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    // Private mode: the screen comes back next visit.
  }
}
