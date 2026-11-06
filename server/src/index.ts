import { config } from './config.js';
import { buildApp } from './app.js';
import { loadProfile } from './guess/profile.js';

const profile = config.profilePath ? await loadProfile(config.profilePath) : undefined;
const app = await buildApp(profile ? { profile } : {});
await app.listen({ port: config.port, host: '127.0.0.1' });
app.log.info(
  `guesser: ${config.anthropicApiKey ? config.anthropicModel : 'mock (no ANTHROPIC_API_KEY)'}`,
);
