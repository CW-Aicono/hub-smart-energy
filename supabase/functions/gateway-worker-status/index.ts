/**
 * Gateway Worker Status — read-only metrics endpoint for the Super-Admin UI.
 *
 * Returns:
 *  - worker_active flag (system_settings)
 *  - last heartbeat ISO timestamp + "fresh" boolean (< 3 min)
 *  - inserts_last_5min (count of meter_power_readings rows in the last 5 min)
 *  - active_devices (gateway_devices with last_heartbeat in last 5 min)
 *  - worker_meta (worker_id, version) if reported
 *
 * Auth: requires a valid Supabase JWT for an authenticated user.
 *       (Authorisation/role gating is enforced in the UI layer.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FRESH_MS = 3 * 60 * 1000; // 3 min — UI threshold

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

    // Validate the user (any authenticated user; UI restricts to super_admin)
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await authClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !user) return json(corsHeaders, { error: "Invalid token" }, 401);

    // 1) System settings (worker_active, worker_last_heartbeat, worker_meta)
    const { data: settings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["worker_active", "worker_last_heartbeat", "worker_meta"]);

    const settingsMap = new Map((settings || []).map((r: any) => [r.key, r.value]));
    const workerActive = settingsMap.get("worker_active") === "true";
    const heartbeatRaw = settingsMap.get("worker_last_heartbeat");
    const heartbeatMs = heartbeatRaw ? Date.parse(heartbeatRaw) : NaN;
    const heartbeatFresh = isFinite(heartbeatMs) && Date.now() - heartbeatMs < FRESH_MS;
    let workerMeta: any = null;
    try { workerMeta = settingsMap.get("worker_meta") ? JSON.parse(settingsMap.get("worker_meta")!) : null; } catch { /* ignore */ }

    // 2) Inserts in the last 5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: insertsLast5min } = await supabase
      .from("meter_power_readings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", fiveMinAgo);

    // 3) Active gateway devices (HA add-ons etc.) — last_heartbeat in last 5 min
    const { count: activeDevices } = await supabase
      .from("gateway_devices")
      .select("id", { count: "exact", head: true })
      .gte("last_heartbeat_at", fiveMinAgo);

    return json(corsHeaders, {
      success: true,
      worker_active_flag: workerActive,
      last_heartbeat: heartbeatRaw || null,
      heartbeat_fresh: heartbeatFresh,
      heartbeat_age_seconds: isFinite(heartbeatMs) ? Math.round((Date.now() - heartbeatMs) / 1000) : null,
      inserts_last_5min: insertsLast5min || 0,
      active_devices: activeDevices || 0,
      worker_meta: workerMeta,
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
