import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLog } from './log';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tott-log-'));

describe('log', () => {
  it('appends one line per entry, with level and time', () => {
    const file = path.join(dir(), 'sub', 'app.log');
    const log = createLog(file);
    log('info', 'started');
    log('error', 'multi\nline  message');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT.* info started$/);
    expect(lines[1]).toMatch(/ error multi line message$/);
  });

  it('rotates, keeping at most two old files', () => {
    const file = path.join(dir(), 'app.log');
    const log = createLog(file, 100);
    for (let i = 0; i < 40; i++) log('info', `entry number ${i}`);
    const files = fs.readdirSync(path.dirname(file)).sort();
    expect(files).toEqual(['app.log', 'app.log.1', 'app.log.2']);
    for (const f of files)
      expect(fs.statSync(path.join(path.dirname(file), f)).size).toBeLessThan(250);
    expect(fs.readFileSync(file, 'utf8')).toContain('entry number 39');
  });

  it('never throws, even when the folder cannot be written', () => {
    const blocker = path.join(dir(), 'file');
    fs.writeFileSync(blocker, '');
    expect(() => createLog(path.join(blocker, 'app.log'))('info', 'x')).not.toThrow();
  });
});
