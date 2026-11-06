import { defineConfig } from '@playwright/test';

// e2e has its own ports (web 5299, server 3199) and never reuses a running server, so a dev
// server left over from another checkout can't make the tests run against stale code.
// No .env and no API keys are passed, so the mock guesser runs.
const WEB = 'http://localhost:5299';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: WEB, browserName: 'chromium' },
  webServer: {
    command:
      'npx concurrently -k -n server,web "npm run dev -w server" "npm run dev -w web -- --port 5299 --strictPort"',
    cwd: '..',
    env: { PORT: '3199', ALLOWED_ORIGINS: WEB, DEEPGRAM_API_KEY: '', ANTHROPIC_API_KEY: '' },
    url: WEB,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
