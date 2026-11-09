// Bundles the server and its dependencies into one file the packaged app runs as a child process.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/src/index.ts'],
  outfile: 'app/server-bundle/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Some dependencies are CommonJS and call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
