import fs from 'node:fs';
import path from 'node:path';

export const KEY_NAMES = ['anthropic', 'deepgram'] as const;
export type KeyName = (typeof KEY_NAMES)[number];

// The part of Electron's safeStorage the store needs.
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

// A key is one token: no spaces, newlines or other control characters (they could end up in an
// HTTP header or the server's environment).
const KEY_PATTERN = /^[\x21-\x7e]{8,300}$/;

// Keys encrypted with the OS keychain (safeStorage), kept in one file. Nothing is ever written
// unencrypted: without encryption, saving fails.
export function createKeyStore(file: string, cipher: Cipher) {
  const read = (): Partial<Record<KeyName, string>> => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  };

  return {
    // The plain key, for the server's environment and the provider check. Never sent to the page.
    get(name: KeyName): string | undefined {
      const stored = read()[name];
      if (typeof stored !== 'string' || !cipher.isEncryptionAvailable()) return undefined;
      try {
        return cipher.decryptString(Buffer.from(stored, 'base64'));
      } catch {
        // Written by another user or machine: unreadable, so treated as missing.
        return undefined;
      }
    },
    // Omitted: keep. Empty string: remove. Anything else must look like a key.
    save(keys: Partial<Record<KeyName, unknown>>): void {
      if (!cipher.isEncryptionAvailable()) {
        throw new Error('This computer cannot encrypt keys (no keychain), so none were saved.');
      }
      const next = read();
      for (const name of KEY_NAMES) {
        const value = keys[name];
        if (value === undefined) continue;
        if (typeof value !== 'string') throw new Error(`${name} key must be text`);
        const trimmed = value.trim();
        if (trimmed === '') next[name] = undefined;
        else if (!KEY_PATTERN.test(trimmed))
          throw new Error(`That ${name} key does not look right`);
        else next[name] = cipher.encryptString(trimmed).toString('base64');
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // JSON leaves out the removed (undefined) keys.
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
  };
}

export type KeyStore = ReturnType<typeof createKeyStore>;
