import { utilityProcess, type UtilityProcess } from 'electron';

export interface ServerOptions {
  // The bundled server (app/server-bundle/index.mjs).
  script: string;
  // Environment for the server: port, token, built page, log file, saved keys.
  env: () => Record<string, string>;
}

// Runs the bundled server as an Electron utility process, for the installed app. Same shape as
// startChildren (children.ts), which does the job from the repo in development.
export function startServerProcess({ script, env }: ServerOptions) {
  let child: UtilityProcess | undefined;
  const start = () => {
    child = utilityProcess.fork(script, [], {
      env: { ...process.env, ...env() },
      stdio: 'inherit',
    });
  };
  start();
  return {
    restartServer() {
      child?.kill();
      start();
    },
    stop() {
      child?.kill();
    },
  };
}
