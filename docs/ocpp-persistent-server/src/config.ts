function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === "true" || v === "1";
}

export const config = {
  supabaseUrl: req("SUPABASE_URL"),
  // Optional: nur für Realtime-Push (Broadcast-Kanal ocpp:commands) benötigt.
  // Fehlt der Key, läuft der Server ausschließlich mit Polling weiter.
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  ocppDomain: process.env.OCPP_DOMAIN ?? "",
  port: num("PORT", 8080),
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  pingIntervalSec: num("PING_INTERVAL_SECONDS", 25),
  idleTimeoutSec: num("IDLE_TIMEOUT_SECONDS", 90000),
  commandPollIntervalMs: num("COMMAND_POLL_INTERVAL_MS", 10000),
  enableRealtime: bool("ENABLE_REALTIME", false),
  startupCheckOcppId: process.env.OCPP_STARTUP_CHECK_ID ?? "",
  ocppSubprotocol: "ocpp1.6",
};
