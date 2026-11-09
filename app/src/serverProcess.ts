import { utilityProcess } from 'electron';
import { createSupervisor } from './supervisor';

export interface ServerOptions {
  // The bundled server (app/server-bundle/index.mjs).
  script: string;
  // Environment for the server: port, token, built page, log file, saved keys.
  env: () => Record<string, string>;
  // The server stopped, was restarted once, and stopped again.
  onFail: (reason: string) => void;
}

// Runs the bundled server as an Electron utility process, for the installed app, restarting it once
// if it dies. Same shape as startChildren (children.ts), which does the job from the repo.
export function startServerProcess({ script, env, onFail }: ServerOptions) {
  const supervisor = createSupervisor({
    launch(onExit) {
      const child = utilityProcess.fork(script, [], {
        env: { ...process.env, ...env() },
        stdio: 'inherit',
      });
      child.on('exit', onExit);
      return child;
    },
    onFail,
  });
  supervisor.start();
  return {
    restartServer: () => supervisor.restart(),
    retry: () => supervisor.retry(),
    stop: () => supervisor.stop(),
  };
}
