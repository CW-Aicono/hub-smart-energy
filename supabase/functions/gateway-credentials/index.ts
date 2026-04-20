/**
 * Gateway Credentials – Manages Loxone-style auth for AICONO EMS Gateways.
 * ============================================================================
 * Endpoints:
 *   POST /                  – assign MAC + username + (bcrypt) password to a
 *                             location_integration. Creates / updates the
 *                             gateway_devices row, sets tenant_id + location_integration_id.
 *   GET  /?action=pending   – list unassigned devices (tenant_id=NULL) that
 *                             have recently sent a heartbeat.
 *
 * Auth: Standard Supabase user JWT (verify_jwt=true via verifying user role).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function getAuthClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
      auth: { persistSession: false },
    },
  );
}

/** Resolve authenticated user → tenant_id. */
async function resolveTenant(req: Request): Promise<{ tenantId: string; userId: string } | null> {
  const authClient = getAuthClient(req);
  const { data: userData } = await authClient.auth.getUser();
  if (!userData?.user) return null;
  const svc = getServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return null;
  return { tenantId: profile.tenant_id, userId: userData.user.id };
}

function normalizeMac(input: string): string {
  return (input || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
}

async function bcryptHash(plain: string): Promise<string> {
  const bcrypt = await import("https://deno.land/x/bcrypt@v0.4.1/mod.ts");
  return await bcrypt.hash(plain);
}

async function locationIntegrationBelongsToTenant(
  svc: ReturnType<typeof getServiceClient>,
  tenantId: string,
  locationIntegrationId: string,
): Promise<boolean> {
  const { data: li } = await svc
    .from("location_integrations")
    .select("id, location_id, locations!inner(tenant_id)")
    .eq("id", locationIntegrationId)
    .maybeSingle();

  return Boolean(li && (li as any).locations?.tenant_id === tenantId);
}

/** POST: fetch existing safe credential fields for a location integration. */
async function handleCurrent(req: Request): Promise<Response> {
  const ctx = await resolveTenant(req);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  let body: { location_integration_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const liId = body.location_integration_id;
  if (!liId) {
    return json({ error: "location_integration_id is required" }, 400);
  }

  const svc = getServiceClient();
  const isAllowed = await locationIntegrationBelongsToTenant(svc, ctx.tenantId, liId);
  if (!isAllowed) {
    return json({ error: "Liegenschaft gehört nicht zu Ihrem Mandanten" }, 403);
  }

  const { data: device, error } = await svc
    .from("gateway_devices")
    .select("id, mac_address, gateway_username, gateway_password_hash")
    .eq("location_integration_id", liId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (error) {
    console.error("[gateway-credentials] current error:", error.message);
    return json({ error: "Datenbankfehler" }, 500);
  }

  return json({
    success: true,
    device: device
      ? {
          id: device.id,
          mac_address: device.mac_address,
          gateway_username: device.gateway_username,
          has_password: Boolean(device.gateway_password_hash),
        }
      : null,
  });
}

/** POST: assign credentials. */
async function handleAssign(req: Request): Promise<Response> {
  const ctx = await resolveTenant(req);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  let body: {
    mac_address?: string;
    gateway_username?: string;
    gateway_password?: string;
    location_integration_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const mac = normalizeMac(body.mac_address || "");
  const username = (body.gateway_username || "").trim();
  const password = body.gateway_password || "";
  const liId = body.location_integration_id;

  if (mac.length !== 12) {
    return json({ error: "MAC-Adresse muss 12 Hex-Zeichen enthalten (z.B. aabbccddeeff)" }, 400);
  }
  if (username.length < 3 || username.length > 32) {
    return json({ error: "Benutzername muss zwischen 3 und 32 Zeichen lang sein" }, 400);
  }

  const svc = getServiceClient();

  let resolvedLiId: string | null = liId || null;
  if (liId) {
    const isAllowed = await locationIntegrationBelongsToTenant(svc, ctx.tenantId, liId);
    if (!isAllowed) {
      return json({ error: "Liegenschaft gehört nicht zu Ihrem Mandanten" }, 403);
    }
  }

  const { data: existing } = await svc
    .from("gateway_devices")
    .select("id, tenant_id, gateway_password_hash")
    .eq("mac_address", mac)
    .maybeSingle();

  if (existing && existing.tenant_id && existing.tenant_id !== ctx.tenantId) {
    return json({ error: "Diese MAC ist bereits einem anderen Mandanten zugeordnet" }, 409);
  }

  let passwordHash: string | undefined;
  if (password) {
    if (password.length < 8) {
      return json({ error: "Passwort muss mindestens 8 Zeichen lang sein" }, 400);
    }
    passwordHash = await bcryptHash(password);
  } else if (!existing?.gateway_password_hash) {
    return json({ error: "Passwort ist erforderlich" }, 400);
  }

  const update: Record<string, unknown> = {
    tenant_id: ctx.tenantId,
    gateway_username: username,
    mac_address: mac,
    location_integration_id: resolvedLiId,
    status: "online",
  };
  if (passwordHash) update.gateway_password_hash = passwordHash;

  if (existing?.id) {
    const { error } = await svc
      .from("gateway_devices")
      .update(update)
      .eq("id", existing.id);
    if (error) {
      console.error("[gateway-credentials] update error:", error.message);
      return json({ error: "Datenbankfehler" }, 500);
    }
    console.info("[gateway-credentials] assigned existing device", { mac, location_integration_id: resolvedLiId });
    return json({ success: true, device_id: existing.id, action: "updated" });
  }

  const { data: inserted, error: insertErr } = await svc
    .from("gateway_devices")
    .insert({
      ...update,
      device_name: `aicono-ems-${mac.slice(-6)}`,
      device_type: "ha-addon",
    })
    .select("id")
    .single();
  if (insertErr) {
    console.error("[gateway-credentials] insert error:", insertErr.message);
    return json({ error: "Datenbankfehler" }, 500);
  }
  console.info("[gateway-credentials] created device", { mac, location_integration_id: resolvedLiId });
  return json({ success: true, device_id: inserted.id, action: "created" });
}

/** GET ?action=pending – list unassigned devices (heartbeat seen, no tenant). */
async function handlePending(_req: Request): Promise<Response> {
  // Pending devices are tenant-agnostic by definition; any authenticated user
  // may list them so they can be claimed.
  const svc = getServiceClient();
  const { data, error } = await svc
    .from("gateway_devices")
    .select("id, mac_address, gateway_username, last_heartbeat_at, local_ip")
    .is("tenant_id", null)
    .not("mac_address", "is", null)
    .order("last_heartbeat_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[gateway-credentials] pending error:", error.message);
    return json({ error: "Datenbankfehler" }, 500);
  }
  return json({ success: true, devices: data || [] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    if (!action && req.method === "POST") {
      try {
        const cloned = req.clone();
        const peek = await cloned.json().catch(() => null);
        if (peek && typeof peek === "object" && peek.action) {
          action = String(peek.action);
        }
      } catch {
      }
    }
    if (action === "pending") return handlePending(req);
    if (action === "current") return handleCurrent(req);
    if (req.method === "POST") return handleAssign(req);
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[gateway-credentials] unhandled:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
