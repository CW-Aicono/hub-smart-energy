import { config } from "./config";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  // structured JSON; one line per log
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
