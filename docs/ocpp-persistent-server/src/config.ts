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
  ocppServerApiKey: process.env.OCPP_SERVER_API_KEY || process.env.GATEWAY_API_KEY || req("SUPABASE_SERVICE_ROLE_KEY"),
  ocppDomain: process.env.OCPP_DOMAIN ?? "",
  port: num("PORT", 8080),
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  pingIntervalSec: num("PING_INTERVAL_SECONDS", 25),
  idleTimeoutSec: num("IDLE_TIMEOUT_SECONDS", 120),
  commandPollIntervalMs: num("COMMAND_POLL_INTERVAL_MS", 2000),
  enableRealtime: bool("ENABLE_REALTIME", false),
  ocppSubprotocol: "ocpp1.6",
};
