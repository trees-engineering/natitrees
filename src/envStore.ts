import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(__dirname, '..', '.env');

// Every provider (llm.ts, tts.ts) reads process.env fresh per call rather
// than caching it at module load, so setting it here takes effect on the
// very next call, no restart needed. Rewriting .env is just so the choice
// survives one, it plays no part in the live switch itself.
export function updateEnv(updates: Record<string, string>): void {
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }

  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const remaining = new Map(Object.entries(updates));

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && remaining.has(match[1])) {
      const key = match[1];
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  for (const [key, value] of remaining) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_PATH, `${nextLines.join('\n').replace(/\n+$/, '')}\n`, 'utf-8');
}
