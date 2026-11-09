import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';

// Runs the server and the Vite dev server as child processes, so the overlay needs only one
// command. Each child leads its own process group, so killing the group also stops npm's own
// children (tsx, vite).
export function startChildren(
  root: string,
  ports: { server: number; web: number },
  // Keys the user saved in the app; the server is started with them (and restarted when they change).
  keys: () => Record<string, string>,
) {
  const run = (args: string[], extra: Record<string, string> = {}) =>
    spawn('npm', args, {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(ports.server),
        ALLOWED_ORIGINS: `http://localhost:${ports.web}`,
        ...extra,
      },
      stdio: 'inherit',
      detached: true,
    });
  const kill = (child: ChildProcess | undefined) => {
    if (child?.pid === undefined) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  };
  const startServer = () => run(['run', 'dev', '-w', 'server'], keys());
  let server = startServer();
  const web = run(['run', 'dev', '-w', 'web', '--', '--port', String(ports.web), '--strictPort']);

  return {
    restartServer() {
      kill(server);
      server = startServer();
    },
    stop() {
      kill(server);
      kill(web);
    },
  };
}

// Resolves once `url` answers, or rejects after `timeoutMs` or once `giveUp()` says so.
export function waitForUrl(
  url: string,
  timeoutMs: number,
  giveUp: () => boolean = () => false,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (giveUp()) reject(new Error('gave up waiting'));
        else if (Date.now() > deadline) reject(new Error('The server did not start in time.'));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}
