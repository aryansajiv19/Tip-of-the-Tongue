import { createServer } from 'node:net';
import { defineConfig } from '@playwright/test';

// A free port each run, so two runs (or another checkout's dev server) can never clash, and a
// leftover server can't make the tests run against stale code. The choice goes into the
// environment, which the test workers inherit, so everyone agrees on it.
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

process.env.E2E_WEB_PORT ??= String(await freePort());
process.env.E2E_SERVER_PORT ??= String(await freePort());
const WEB = `http://localhost:${process.env.E2E_WEB_PORT}`;

// No .env and no API keys are passed, so the mock guesser runs.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: WEB, browserName: 'chromium' },
  webServer: {
    command: `npx concurrently -k -n server,web "npm run dev -w server" "npm run dev -w web -- --port ${process.env.E2E_WEB_PORT} --strictPort"`,
    cwd: '..',
    env: {
      PORT: process.env.E2E_SERVER_PORT,
      ALLOWED_ORIGINS: WEB,
      DEEPGRAM_API_KEY: '',
      ANTHROPIC_API_KEY: '',
    },
    url: WEB,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
