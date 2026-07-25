/**
 * Worker-Status helper – shared across edge functions.
 *
 * Determines whether the Hetzner gateway-worker (loxone-ws-worker) is the
 * authoritative writer for meter power readings. If so, edge functions
 * (loxone-api HTTP pull) should SKIP their own write path to avoid double
 * writes into `meter_power_readings_5min`.
 *
 * Signal quellen (aktuell, ohne Legacy-Rauschen):
 *   - `system_settings.worker_active`  → boolean flag ("true"/"false")
 *   - `bridge_workers.last_heartbeat_at` (max über alle `status='online'`)
 *   - `system_settings.loxone_ws_stale_threshold_seconds` (Default 900 s,
 *     Fallback-Key `public.loxone_ws_stale_threshold_seconds`)
 *
 * Der frühere Key `worker_last_heartbeat` in `system_settings` wird NICHT
 * mehr gelesen – er wurde vom Worker nie befüllt und lieferte permanent
 * "stale", weshalb der Skip-Pfad nicht griff.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_STALE_SECONDS = 900; // 15 min – matches HTTP pull cycle

// In-memory cache to avoid hitting the DB on every single read inside a hot loop.
let cache: { value: boolean; checkedAt: number } | null = null;
const CACHE_TTL_MS = 15_000; // 15 s

export async function isWorkerPrimary(
  supabase: SupabaseClient,
  staleMsOverride?: number,
): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.checkedAt < CACHE_TTL_MS) {
    return cache.value;
  }

  try {
    // 1) Flag + Stale-Schwelle aus system_settings
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "worker_active",
        "loxone_ws_stale_threshold_seconds",
        "public.loxone_ws_stale_threshold_seconds",
      ]);

    const smap = new Map((settings ?? []).map((r: any) => [r.key, r.value]));
    const active = smap.get("worker_active") === "true";
    if (!active) {
      cache = { value: false, checkedAt: now };
      return false;
    }

    const thresholdRaw =
      smap.get("loxone_ws_stale_threshold_seconds") ??
      smap.get("public.loxone_ws_stale_threshold_seconds");
    const thresholdSec = Number.parseInt(String(thresholdRaw ?? ""), 10);
    const staleMs =
      staleMsOverride ??
      (Number.isFinite(thresholdSec) && thresholdSec > 0
        ? thresholdSec * 1000
        : DEFAULT_STALE_SECONDS * 1000);

    // 2) Frischester Heartbeat aus bridge_workers (das ist die Quelle,
    //    in die der loxone-ws-worker tatsächlich schreibt).
    const { data: workers, error: werr } = await supabase
      .from("bridge_workers")
      .select("last_heartbeat_at, status, enabled")
      .eq("enabled", true)
      .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (werr || !workers || workers.length === 0) {
      cache = { value: false, checkedAt: now };
      return false;
    }

    const hbRaw = (workers[0] as any).last_heartbeat_at as string | null;
    const hbMs = hbRaw ? Date.parse(hbRaw) : NaN;
    const fresh = Number.isFinite(hbMs) && now - hbMs < staleMs;

    const primary = fresh;
    cache = { value: primary, checkedAt: now };
    return primary;
  } catch (e) {
    console.warn("[workerStatus] check failed:", e);
    cache = { value: false, checkedAt: now };
    return false;
  }
}

/**
 * @deprecated Der Worker schreibt seinen Heartbeat in `bridge_workers`.
 * Diese Funktion bleibt nur bestehen, um alte Aufrufer nicht zu brechen –
 * sie ist ein No-Op.
 */
export async function recordWorkerHeartbeat(
  _supabase: SupabaseClient,
): Promise<void> {
  cache = null;
}
