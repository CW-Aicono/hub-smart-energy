/**
 * Worker-Status helper – shared across edge functions.
 * Reads `worker_active` flag and `worker_last_heartbeat` from the
 * `system_settings` table. If the flag is on AND the heartbeat is fresh
 * (< staleMs old), edge functions should skip their own write path because
 * the gateway worker is the authoritative data source.
 *
 * Safety fallback: if the worker stops heartbeating for > staleMs,
 * `isWorkerPrimary()` returns false and edge functions resume writing,
 * preventing data gaps even when the worker is down.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache to avoid hitting the DB on every single read inside a hot loop.
let cache: { value: boolean; checkedAt: number } | null = null;
const CACHE_TTL_MS = 15_000; // 15 s — fresh enough, cheap enough

export async function isWorkerPrimary(
  supabase: SupabaseClient,
  staleMs: number = DEFAULT_STALE_MS,
): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.checkedAt < CACHE_TTL_MS) {
    return cache.value;
  }

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["worker_active", "worker_last_heartbeat"]);

    if (error || !data) {
      cache = { value: false, checkedAt: now };
      return false;
    }

    const map = new Map(data.map((r: any) => [r.key, r.value]));
    const active = map.get("worker_active") === "true";
    const heartbeatRaw = map.get("worker_last_heartbeat");
    const heartbeatMs = heartbeatRaw ? Date.parse(heartbeatRaw) : NaN;
    const fresh = isFinite(heartbeatMs) && now - heartbeatMs < staleMs;

    const primary = active && fresh;
    cache = { value: primary, checkedAt: now };
    return primary;
  } catch (e) {
    console.warn("[workerStatus] check failed:", e);
    cache = { value: false, checkedAt: now };
    return false;
  }
}

export async function recordWorkerHeartbeat(
  supabase: SupabaseClient,
): Promise<void> {
  await supabase
    .from("system_settings")
    .upsert(
      { key: "worker_last_heartbeat", value: new Date().toISOString() },
      { onConflict: "key" },
    );
  // invalidate cache so next read re-evaluates
  cache = null;
}
