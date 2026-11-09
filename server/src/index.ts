import { config } from './config.js';
import { buildApp } from './app.js';
import { loadProfile } from './guess/profile.js';

const profile = config.profilePath ? await loadProfile(config.profilePath) : undefined;
const app = await buildApp(profile ? { profile } : {});
await app.listen({ port: config.port, host: '127.0.0.1' });
app.log.info(
  `guesser: ${config.anthropicApiKey ? config.anthropicModel : 'mock (no ANTHROPIC_API_KEY)'}`,
);

// A fatal error leaves the process in an unknown state: say so, and let whatever started it
// (the desktop app, a service manager) start a fresh one.
for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(event, (err) => {
    app.log.fatal({ err }, event);
    process.exit(1);
  });
}
