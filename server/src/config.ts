// Loads the repo-root .env if present; every value has a default so the app runs without one.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
};

export const config = {
  port: num('PORT', 3000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || undefined,
  // Browser origins allowed to open the WebSocket (stops other web pages from reading it).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  stuckPauseMs: num('STUCK_PAUSE_MS', 1500),
  gateMinConfidence: num('GATE_MIN_CONFIDENCE', 0.6),
  guessTimeoutMs: num('GUESS_TIMEOUT_MS', 2500),
  // Optional personal profile (see data/profiles/example.json). Off by default.
  profilePath: process.env.PROFILE_PATH || undefined,
  cooldownMs: 8000,
  acceptWindowMs: 10_000,
  moveOnWords: 6,
};
