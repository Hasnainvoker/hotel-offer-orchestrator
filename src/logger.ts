import { config } from './config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(config.logLevel as Level) in LEVELS ? (config.logLevel as Level) : 'info'];

/** Minimal structured (JSON-lines) logger. */
function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};

export function errorMeta(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.message, errorName: err.name };
  return { error: String(err) };
}
