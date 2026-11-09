import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createKeyStore, type Cipher } from './keyStore';

// Stands in for safeStorage: reversible, but not readable as text.
const cipher = (available = true): Cipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString(),
});

const ANTHROPIC = 'sk-ant-api03-abcdefghijklmnop';
const DEEPGRAM = '0123456789abcdef0123456789abcdef01234567';

let file: string;
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tott-keys-')), 'sub', 'keys.json');
});

describe('key store', () => {
  it('starts empty', () => {
    const store = createKeyStore(file, cipher());
    expect(store.get('anthropic')).toBeUndefined();
    expect(store.get('deepgram')).toBeUndefined();
  });

  it('round-trips keys and never writes one in plain text', () => {
    const store = createKeyStore(file, cipher());
    store.save({ anthropic: ANTHROPIC, deepgram: DEEPGRAM });
    expect(store.get('anthropic')).toBe(ANTHROPIC);
    expect(store.get('deepgram')).toBe(DEEPGRAM);
    const onDisk = fs.readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(ANTHROPIC);
    expect(onDisk).not.toContain(DEEPGRAM);
    expect(onDisk).not.toContain(Buffer.from(ANTHROPIC).toString('base64'));
    // Windows has no POSIX permission bits.
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o077).toBe(0);
  });

  it('keeps what is omitted, replaces what is given, removes on empty', () => {
    const store = createKeyStore(file, cipher());
    store.save({ anthropic: ANTHROPIC, deepgram: DEEPGRAM });
    store.save({ deepgram: 'x'.repeat(40) });
    expect(store.get('anthropic')).toBe(ANTHROPIC);
    expect(store.get('deepgram')).toBe('x'.repeat(40));
    store.save({ anthropic: '  ' });
    expect(store.get('anthropic')).toBeUndefined();
    expect(store.get('deepgram')).toBe('x'.repeat(40));
  });

  it('trims pasted whitespace', () => {
    const store = createKeyStore(file, cipher());
    store.save({ anthropic: `  ${ANTHROPIC}\n` });
    expect(store.get('anthropic')).toBe(ANTHROPIC);
  });

  it.each([
    ['inner space', 'sk-ant abcdefgh'],
    ['newline', 'sk-ant-abc\nINJECT=1'],
    ['too short', 'abc'],
    ['too long', 'k'.repeat(301)],
    ['non-ASCII', 'sk-ant-ключ-abcdefgh'],
  ])('rejects a key with %s and changes nothing', (_why, bad) => {
    const store = createKeyStore(file, cipher());
    store.save({ anthropic: ANTHROPIC });
    expect(() => store.save({ deepgram: DEEPGRAM, anthropic: bad })).toThrow(/does not look right/);
    expect(store.get('anthropic')).toBe(ANTHROPIC);
    expect(store.get('deepgram')).toBeUndefined();
  });

  it('rejects a non-string value', () => {
    expect(() => createKeyStore(file, cipher()).save({ anthropic: 42 })).toThrow(/must be text/);
  });

  it('refuses to save, and writes nothing, when the OS cannot encrypt', () => {
    const store = createKeyStore(file, cipher(false));
    expect(() => store.save({ anthropic: ANTHROPIC })).toThrow(/cannot encrypt/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('treats a corrupt file, or ciphertext it cannot decrypt, as missing', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    const store = createKeyStore(file, cipher());
    expect(store.get('anthropic')).toBeUndefined();
    store.save({ anthropic: ANTHROPIC });
    expect(store.get('anthropic')).toBe(ANTHROPIC);
    const foreign: Cipher = {
      ...cipher(),
      decryptString: () => {
        throw new Error('bad mac');
      },
    };
    expect(createKeyStore(file, foreign).get('anthropic')).toBeUndefined();
  });
});
