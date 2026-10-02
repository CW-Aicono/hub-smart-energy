/**
 * gateway-device-discover
 * =======================
 * Phase 3 (Remote-Setup): Triggert auf einem AICONO Gateway einen Discovery-Lauf
 * (mDNS / MQTT / Modbus-Scan) und liefert den aktuellen Stand des Discovery-Buffers
 * (`gateway_device_discoveries`) zurück.
 *
 * Endpoints (POST mit body.action):
 *   { action: "scan",  device_id, methods?: ["mdns","mqtt","modbus_scan"], modbus?: {...} }
 *     → enqueued in gateway_commands → Worker führt Scan aus → Ergebnisse
 *       landen via gateway-ingest in gateway_device_discoveries.
 *   { action: "list",  device_id, only_unprovisioned?: boolean }
 *     → liefert aktuelle (nicht abgelaufene) Discovery-Einträge.
 *   { action: "clear", device_id }
 *     → markiert alle Einträge als provisioniert (Buffer leeren).
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

const ALLOWED_METHODS = new Set(["mdns", "mqtt", "modbus_scan"]);

async function resolveUser(token: string) {
  const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser();
  if (!data?.user) return null;

  const sbSvc = svc();
  const [{ data: profile }, { data: superRow }] = await Promise.all([
    sbSvc.from("profiles").select("tenant_id").eq("user_id", data.user.id).maybeSingle(),
    sbSvc.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin").maybeSingle(),
  ]);
  return {
    userId: data.user.id,
    tenantId: (profile as any)?.tenant_id ?? null,
    isSuperAdmin: Boolean(superRow),
  };
}

async function ensureDeviceAccess(deviceId: string, ctx: { tenantId: string | null; isSuperAdmin: boolean }) {
  const { data, error } = await svc()
    .from("gateway_devices")
    .select("id, tenant_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (error || !data) return null;
  if (!ctx.isSuperAdmin && data.tenant_id !== ctx.tenantId) return null;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const ctx = await resolveUser(token);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const action = String(body?.action || "");
  const deviceId = String(body?.device_id || "");
  if (!deviceId) return json({ error: "device_id is required" }, 400);

  const device = await ensureDeviceAccess(deviceId, ctx);
  if (!device) return json({ error: "Device not found or forbidden" }, 404);

  const sb = svc();

  if (action === "scan") {
    const requested: string[] = Array.isArray(body?.methods) ? body.methods : ["mdns", "mqtt"];
    const methods = requested.filter((m) => ALLOWED_METHODS.has(m));
    if (methods.length === 0) return json({ error: "no valid methods" }, 400);

    const payload: Record<string, unknown> = { methods };
    if (body?.modbus && typeof body.modbus === "object") payload.modbus = body.modbus;

    const { data: cmd, error } = await sb
      .from("gateway_commands")
      .insert({
        gateway_device_id: deviceId,
        tenant_id: device.tenant_id,
        command_type: "discover_devices",
        payload,
        status: "pending",
        created_by: ctx.userId,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[gateway-device-discover] enqueue error", error.message);
      return json({ error: "Could not enqueue scan" }, 500);
    }
    return json({ success: true, command_id: (cmd as any)?.id, methods });
  }

  if (action === "list") {
    let q = sb
      .from("gateway_device_discoveries")
      .select("id, discovery_method, discovered_payload, is_provisioned, expires_at, created_at")
      .eq("gateway_device_id", deviceId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (body?.only_unprovisioned) q = q.eq("is_provisioned", false);
    const { data, error } = await q;
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true, discoveries: data ?? [] });
  }

  if (action === "clear") {
    const { error } = await sb
      .from("gateway_device_discoveries")
      .update({ is_provisioned: true })
      .eq("gateway_device_id", deviceId)
      .eq("is_provisioned", false);
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
});
