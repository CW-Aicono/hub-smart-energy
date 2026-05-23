/**
 * OCPP-Umgebungs-Erkennung
 *
 * Die App läuft auf mehreren Hosts. Pro Host muss die richtige WebSocket-URL für die
 * Wallboxen verwendet werden, damit Test-Wallboxen nicht versehentlich auf das
 * Live-Gateway gepointet werden (und umgekehrt).
 *
 * Mapping:
 *  - ems-pro.aicono.org, aicono.org           → LIVE   → cp.aicono.org
 *  - staging.aicono.org                       → TEST   → ocpp.aicono.org
 *  - *.lovable.app, *.lovableproject.com,
 *    localhost                                → TEST   → ocpp.aicono.org
 *  - alles andere (Fallback)                  → LIVE   → cp.aicono.org
 */

export type OcppEnvironment = "live" | "test";

const LIVE_HOST = "cp.aicono.org";
const TEST_HOST = "ocpp.aicono.org";

const TEST_HOSTNAMES = ["staging.aicono.org", "localhost", "127.0.0.1"];
const TEST_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];

export function detectOcppEnvironment(hostname?: string): OcppEnvironment {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  if (!host) return "live";
  if (TEST_HOSTNAMES.includes(host)) return "test";
  if (TEST_HOST_SUFFIXES.some((s) => host.endsWith(s))) return "test";
  return "live";
}

export function getOcppHost(hostname?: string): string {
  return detectOcppEnvironment(hostname) === "live" ? LIVE_HOST : TEST_HOST;
}

export function getOcppWssUrl(hostname?: string): string {
  return `wss://${getOcppHost(hostname)}`;
}

export function getOcppWsUrl(hostname?: string): string {
  return `ws://${getOcppHost(hostname)}`;
}

/** Lesbares Label für UI-Hinweise (z. B. „Live-Umgebung"). */
export function getOcppEnvironmentLabel(hostname?: string): string {
  return detectOcppEnvironment(hostname) === "live" ? "Live" : "Test";
}
