import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Capture-path timing: the real page and its real microphone code, fed a looping WAV by Chrome's
// fake microphone, against a fake server that just logs when each audio chunk arrives. No keys
// needed. Run: npm run e2e:lag   (LAG_MINUTES, default 4, is how long it listens.)
export const WAV = join(tmpdir(), 'tott-lag-loop.wav');
const PHRASE =
  'I went to the shop this morning to buy some bread and then I walked to the park [[slnc 1500]] where the children were playing football [[slnc 800]] and the weather was warm and bright all afternoon';
if (!existsSync(WAV) && process.platform === 'darwin') {
  execFileSync('say', ['-o', WAV, '--data-format=LEI16@16000', PHRASE]);
}

const WEB = 'http://localhost:5398';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.lag.ts',
  workers: 1,
  timeout: 20 * 60_000,
  reporter: 'list',
  use: {
    baseURL: WEB,
    // Everyone has answered "How should I help?"; Play only shows after.
    storageState: {
      cookies: [],
      origins: [{ origin: WEB, localStorage: [{ name: 'tott.help', value: 'word' }] }],
    },
    browserName: 'chromium',
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${WAV}`,
      ],
    },
  },
  webServer: {
    command: 'npm run dev -w web -- --port 5398 --strictPort',
    cwd: '../..',
    url: WEB,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
