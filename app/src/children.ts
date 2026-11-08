import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

// Runs the server and the Vite dev server as child processes, so the overlay needs only one
// command. Each child leads its own process group, so killing the group also stops npm's own
// children (tsx, vite).
export function startChildren(root: string, ports: { server: number; web: number }) {
  const env = {
    ...process.env,
    PORT: String(ports.server),
    ALLOWED_ORIGINS: `http://localhost:${ports.web}`,
  };
  const run = (args: string[]) =>
    spawn('npm', args, { cwd: root, env, stdio: 'inherit', detached: true });
  const children: ChildProcess[] = [
    run(['run', 'dev', '-w', 'server']),
    run(['run', 'dev', '-w', 'web', '--', '--port', String(ports.web), '--strictPort']),
  ];

  return {
    stop() {
      for (const child of children) {
        if (child.pid === undefined) continue;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // Already gone.
        }
      }
    },
  };
}

// Resolves once `url` answers, or rejects after `timeoutMs`.
export function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`${url} did not start in time`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}
