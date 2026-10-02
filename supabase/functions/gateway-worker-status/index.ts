/**
 * Gateway Worker Status — read-only metrics endpoint for the Super-Admin UI.
 *
 * Beobachtet ausschließlich den Loxone-WebSocket-Worker (Hetzner).
 * AICONO-Gateways laufen unabhängig und werden über gateway_devices überwacht.
 *
 * Returns:
 *  - worker_active flag (system_settings)
 *  - last heartbeat ISO timestamp + "fresh" boolean (< stale threshold)
 *  - stale_threshold_seconds (aus system_settings.loxone_ws_stale_threshold_seconds)
 *  - inserts_last_5min (meter_power_readings)
 *  - worker_meta (name, version, host) aus bridge_workers
 *
 * Auth: gültiger Supabase JWT erforderlich.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const DEFAULT_STALE_SECONDS = 300; // Default fallback

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(corsHeaders, { error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json(corsHeaders, { error: "Invalid token" }, 401);
    }

    // 1) System settings — worker_active flag + stale threshold + legacy fallback
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "worker_active",
        "worker_last_heartbeat",
        "worker_meta",
        "loxone_ws_stale_threshold_seconds",
        "public.loxone_ws_stale_threshold_seconds",
      ]);

    const settingsMap = new Map((settings || []).map((r: any) => [r.key, r.value]));
    const workerActive = settingsMap.get("worker_active") === "true";
    // Read both key variants (unprefixed preferred, prefixed as fallback for legacy writers).
    const staleRaw =
      settingsMap.get("loxone_ws_stale_threshold_seconds") ??
      settingsMap.get("public.loxone_ws_stale_threshold_seconds");
    const staleParsed = Number(staleRaw);
    const staleThresholdSeconds =
      Number.isFinite(staleParsed) && staleParsed >= 30 && staleParsed <= 7200
        ? staleParsed
        : DEFAULT_STALE_SECONDS;
    const freshMs = staleThresholdSeconds * 1000;

    // 2) Primär: neuesten Loxone-WS-Worker aus bridge_workers holen.
    //    Fallback: alter system_settings-Key (für ältere Worker-Versionen).
    const { data: bridgeRows } = await supabase
      .from("bridge_workers")
      .select("name, version, host, last_heartbeat_at, status")
      .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const bridgeWorker = bridgeRows?.[0] ?? null;
    let heartbeatRaw: string | null = bridgeWorker?.last_heartbeat_at ?? null;
    let workerMeta: any = bridgeWorker
      ? { worker_id: bridgeWorker.name, version: bridgeWorker.version, host: bridgeWorker.host }
      : null;

    if (!heartbeatRaw) {
      // Legacy fallback
      const legacyHb = settingsMap.get("worker_last_heartbeat");
      if (legacyHb) heartbeatRaw = legacyHb;
      if (!workerMeta) {
        try {
          workerMeta = settingsMap.get("worker_meta")
            ? JSON.parse(settingsMap.get("worker_meta")!)
            : null;
        } catch { /* ignore */ }
      }
    }

    const heartbeatMs = heartbeatRaw ? Date.parse(heartbeatRaw) : NaN;
    const heartbeatFresh = isFinite(heartbeatMs) && Date.now() - heartbeatMs < freshMs;

    // 3) Inserts in den letzten 5 Min (Schreib-Aktivität des Workers)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: insertsLast5min } = await supabase
      .from("meter_power_readings")
      .select("id", { count: "estimated", head: true })
      .gte("created_at", fiveMinAgo);

    return json(corsHeaders, {
      success: true,
      worker_active_flag: workerActive,
      last_heartbeat: heartbeatRaw || null,
      heartbeat_fresh: heartbeatFresh,
      heartbeat_age_seconds: isFinite(heartbeatMs)
        ? Math.round((Date.now() - heartbeatMs) / 1000)
        : null,
      stale_threshold_seconds: staleThresholdSeconds,
      inserts_last_5min: insertsLast5min || 0,
      worker_meta: workerMeta,
      worker_status: bridgeWorker?.status ?? null,
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[gateway-worker-status] error:", e);
    return json(getCorsHeaders(req), { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(corsHeaders: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
