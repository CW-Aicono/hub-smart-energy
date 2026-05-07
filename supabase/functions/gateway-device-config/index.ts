/**
 * gateway-device-config
 * =====================
 * Remote-Konfiguration für AICONO Gateway-Devices (Phase 2 von v4).
 *
 * Endpoints (POST mit body.action):
 *   { action: "get",    device_id }                → aktuelle Config + Version
 *   { action: "update", device_id, config }        → neue Version schreiben (DB-Trigger
 *                                                    bumpt `version`, gateway-ws pusht
 *                                                    die Änderung über Realtime an das
 *                                                    verbundene Gerät)
 *
 * Auth-Pfade:
 *   1. User-JWT (Tenant-Admin / Super-Admin) – RLS auf gateway_device_config greift.
 *   2. Service-Role (GATEWAY_API_KEY oder SERVICE_ROLE_KEY) – das Gateway selbst zieht
 *      seine Boot-Config darüber, wenn der WebSocket noch nicht steht.
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
const GATEWAY_API_KEY = Deno.env.get("GATEWAY_API_KEY") ?? "";

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function isServiceRoleToken(token: string): boolean {
  if (!token) return false;
  if (GATEWAY_API_KEY && token === GATEWAY_API_KEY) return true;
  if (token === SERVICE_KEY) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

async function resolveUserContext(token: string): Promise<{
  userId: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
} | null> {
  const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser();
  if (!data?.user) return null;
  const userId = data.user.id;

  const sbSvc = svc();
  const { data: profile } = await sbSvc
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: roleRow } = await sbSvc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  return {
    userId,
    tenantId: (profile as any)?.tenant_id ?? null,
    isSuperAdmin: Boolean(roleRow),
  };
}

const DEFAULT_CONFIG: Record<string, unknown> = {
  device_name: "aicono-ems",
  poll_interval_seconds: 30,
  flush_interval_seconds: 5,
  heartbeat_interval_seconds: 60,
  automation_eval_seconds: 30,
  entity_filter: "sensor.*_energy,sensor.*_power,sensor.*_consumption",
  offline_buffer_max_mb: 100,
  auto_backup_hours: 24,
  cloud_url: null,
};

function sanitizeConfig(input: any): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const allowed = new Set([
    "device_name",
    "poll_interval_seconds",
    "flush_interval_seconds",
    "heartbeat_interval_seconds",
    "automation_eval_seconds",
    "entity_filter",
    "offline_buffer_max_mb",
    "auto_backup_hours",
    "cloud_url",
    "log_level",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!allowed.has(k)) continue;
    out[k] = v;
  }
  // Numeric clamping (defensive)
  const clamp = (k: string, min: number, max: number) => {
    const n = Number(out[k]);
    if (!Number.isFinite(n)) return;
    out[k] = Math.min(max, Math.max(min, Math.round(n)));
  };
  clamp("poll_interval_seconds", 5, 3600);
  clamp("flush_interval_seconds", 1, 600);
  clamp("heartbeat_interval_seconds", 10, 600);
  clamp("automation_eval_seconds", 5, 3600);
  clamp("offline_buffer_max_mb", 10, 5000);
  clamp("auto_backup_hours", 0, 168);
  return out;
}

async function handleGet(deviceId: string): Promise<Response> {
  const sb = svc();
  const { data, error } = await sb
    .from("gateway_device_config")
    .select("config, version, updated_at, gateway_device_id, tenant_id")
    .eq("gateway_device_id", deviceId)
    .maybeSingle();
  if (error) {
    console.error("[gateway-device-config] get error", error.message);
    return json({ error: "Database error" }, 500);
  }
  return json({
    success: true,
    device_id: deviceId,
    version: (data as any)?.version ?? 0,
    config: { ...DEFAULT_CONFIG, ...((data as any)?.config ?? {}) },
    updated_at: (data as any)?.updated_at ?? null,
    has_record: Boolean(data),
  });
}

async function handleUpdate(params: {
  deviceId: string;
  config: any;
  actorUserId: string | null;
  isService: boolean;
  tenantId: string | null;
  isSuperAdmin: boolean;
}): Promise<Response> {
  const sb = svc();
  const { data: device, error: devErr } = await sb
    .from("gateway_devices")
    .select("id, tenant_id")
    .eq("id", params.deviceId)
    .maybeSingle();
  if (devErr || !device) return json({ error: "Device not found" }, 404);

  if (!params.isService) {
    const ok = params.isSuperAdmin || (device.tenant_id && device.tenant_id === params.tenantId);
    if (!ok) return json({ error: "Forbidden" }, 403);
  }

  const sanitized = sanitizeConfig(params.config);
  const { data: existing } = await sb
    .from("gateway_device_config")
    .select("config, version")
    .eq("gateway_device_id", params.deviceId)
    .maybeSingle();

  const merged = { ...((existing as any)?.config ?? {}), ...sanitized };

  if (existing) {
    const { error } = await sb
      .from("gateway_device_config")
      .update({
        config: merged,
        updated_by: params.actorUserId,
        tenant_id: device.tenant_id,
      })
      .eq("gateway_device_id", params.deviceId);
    if (error) {
      console.error("[gateway-device-config] update error", error.message);
      return json({ error: "Database error" }, 500);
    }
  } else {
    const { error } = await sb.from("gateway_device_config").insert({
      gateway_device_id: params.deviceId,
      tenant_id: device.tenant_id,
      config: merged,
      version: 1,
      updated_by: params.actorUserId,
    });
    if (error) {
      console.error("[gateway-device-config] insert error", error.message);
      return json({ error: "Database error" }, 500);
    }
  }

  const { data: fresh } = await sb
    .from("gateway_device_config")
    .select("config, version, updated_at")
    .eq("gateway_device_id", params.deviceId)
    .maybeSingle();

  return json({
    success: true,
    device_id: params.deviceId,
    version: (fresh as any)?.version ?? 1,
    config: { ...DEFAULT_CONFIG, ...((fresh as any)?.config ?? {}) },
    updated_at: (fresh as any)?.updated_at ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const isService = isServiceRoleToken(token);
  let userCtx: { userId: string; tenantId: string | null; isSuperAdmin: boolean } | null = null;
  if (!isService) {
    userCtx = await resolveUserContext(token);
    if (!userCtx) return json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = String(body?.action || "");
  const deviceId = String(body?.device_id || "");
  if (!deviceId) return json({ error: "device_id is required" }, 400);

  if (action === "get") return await handleGet(deviceId);
  if (action === "update") {
    return await handleUpdate({
      deviceId,
      config: body?.config ?? {},
      actorUserId: userCtx?.userId ?? null,
      isService,
      tenantId: userCtx?.tenantId ?? null,
      isSuperAdmin: userCtx?.isSuperAdmin ?? false,
    });
  }
  return json({ error: "Unknown action" }, 400);
});
