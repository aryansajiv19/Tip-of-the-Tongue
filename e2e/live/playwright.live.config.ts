import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// Live check through the real Deepgram and the real Claude. Needs DEEPGRAM_API_KEY and
// ANTHROPIC_API_KEY in the environment and macOS `say` to make the audio. The browser's fake
// microphone plays that WAV file once. Run: npm run e2e:live
export const TRAILING_SILENCE_S = 6;
export const WAV = join(tmpdir(), 'tott-live-pharmacy.wav');
const PHRASE = `I need to go to the [[slnc 1500]] the place where you get medicine [[slnc ${TRAILING_SILENCE_S * 1000}]]`;

if (!existsSync(WAV) && process.platform === 'darwin') {
  execFileSync('say', ['-o', WAV, '--data-format=LEI16@16000', PHRASE]);
}
// 16 kHz, 16-bit mono: 32000 bytes a second after the 44-byte header.
export const WAV_SECONDS = existsSync(WAV) ? (statSync(WAV).size - 44) / 32000 : 0;

const WEB = 'http://localhost:5399';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.live.ts',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: WEB,
    browserName: 'chromium',
    permissions: ['microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${WAV}%noloop`,
      ],
    },
  },
  webServer: {
    command:
      'npx concurrently -k -n server,web "npm run dev -w server" "npm run dev -w web -- --port 5399 --strictPort"',
    cwd: '../..',
    env: { PORT: '3399', ALLOWED_ORIGINS: WEB },
    url: WEB,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
