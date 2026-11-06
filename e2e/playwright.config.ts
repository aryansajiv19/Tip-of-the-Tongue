import { defineConfig } from '@playwright/test';

// Fixed ports and no .env: the server listens on 3100 and Vite proxies /ws to it.
// No API keys are passed, so the mock guesser runs.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173', browserName: 'chromium' },
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    env: { PORT: '3100', DEEPGRAM_API_KEY: '', ANTHROPIC_API_KEY: '' },
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
