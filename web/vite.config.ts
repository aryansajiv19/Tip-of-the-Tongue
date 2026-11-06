import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read PORT from the repo-root .env, the same file the server uses.
  const { PORT = '3000' } = loadEnv(mode, '..', '');
  return {
    plugins: [react()],
    server: {
      proxy: { '/ws': { target: `ws://127.0.0.1:${PORT}`, ws: true } },
    },
  };
});
