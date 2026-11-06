import { config } from './config.js';
import { buildApp } from './app.js';

const app = await buildApp();
await app.listen({ port: config.port, host: '127.0.0.1' });
app.log.info(
  `guesser: ${config.anthropicApiKey ? config.anthropicModel : 'mock (no ANTHROPIC_API_KEY)'}`,
);
