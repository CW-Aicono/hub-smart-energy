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
  supabaseAnonKey: req("SUPABASE_ANON_KEY"),
  ocppDomain: process.env.OCPP_DOMAIN ?? "",
  port: num("PORT", 8080),
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  // IO-Notbremse v1.3: Wallbox-Verbindung bleibt offen, aber Cloud-Status wird
  // nicht mehr alle 25 Sekunden geschrieben. Das reduziert Dauer-Updates.
  pingIntervalSec: Math.max(120, num("PING_INTERVAL_SECONDS", 120)),
  // 25 h: muss größer sein als unsere Heartbeat-Antwort (interval: 86400 = 24h),
  // sonst werden OCPP-stille Wallboxen (z. B. wallbe BF-01.04.x) fälschlich
  // alle 2 Minuten als „idle" geschlossen.
  idleTimeoutSec: num("IDLE_TIMEOUT_SECONDS", 90000),
  // IO-Notbremse v1.3: Remote-Befehle werden weiterhin abgeholt, aber nicht
  // mehr im 2-Sekunden-Takt. Für normale Bedienung reichen 30 Sekunden.
  commandPollIntervalMs: Math.max(30000, num("COMMAND_POLL_INTERVAL_MS", 30000)),
  enableRealtime: bool("ENABLE_REALTIME", false),
  startupCheckOcppId: process.env.OCPP_STARTUP_CHECK_ID ?? "",
  ocppSubprotocol: "ocpp1.6",
};
