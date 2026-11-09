import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1_000_000;
const KEEP = 2;

// A plain log file that rotates (app.log, app.log.1, app.log.2) so it never grows without bound.
// Callers log events and error messages only: never anything the user said.
export function createLog(file: string, maxBytes = MAX_BYTES) {
  const rotate = () => {
    for (let i = KEEP; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i}`);
    }
  };
  return (level: 'info' | 'error', message: string) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) rotate();
      const oneLine = message.replace(/\s+/g, ' ');
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${oneLine}\n`);
    } catch {
      // Logging must never take the app down.
    }
  };
}
