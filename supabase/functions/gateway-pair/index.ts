/**
 * gateway-pair
 * ============
 * Public endpoint called by an AICONO Gateway during first-boot setup.
 * The gateway POSTs its MAC address + a one-time pairing token (entered by
 * the customer in the captive setup wizard). We:
 *   1. Validate the token (exists, not expired, not used)
 *   2. Generate a unique gateway_username + random password
 *   3. Create or upsert a gateway_devices row (tenant_id from the token)
 *   4. Mark the token as consumed and bind it to the MAC
 *   5. Return the credentials so the gateway can persist them
 *
 * No JWT required – the token itself is the authentication factor.
 * verify_jwt = false (configured via per-function block in supabase/config.toml).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function normalizeToken(input: string): string {
  return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeMac(input: string): string {
  return (input || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
}

function randomString(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

async function bcryptHash(plain: string): Promise<string> {
  const bcrypt: any = await import("npm:bcryptjs@2.4.3");
  const hash = bcrypt.hash ?? bcrypt.default?.hash;
  return await hash(plain, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const tokenIn = normalizeToken(String(body?.token || ""));
  const macIn = normalizeMac(String(body?.mac_address || ""));
  const hostname = String(body?.hostname || "aicono-ems").slice(0, 64);
  const haVersion = body?.ha_version ? String(body.ha_version).slice(0, 32) : null;
  const addonVersion = body?.addon_version ? String(body.addon_version).slice(0, 32) : null;

  if (tokenIn.length < 6 || tokenIn.length > 16) return json({ error: "Invalid token format" }, 400);
  if (macIn.length !== 12) return json({ error: "Invalid MAC address" }, 400);

  const sb = svc();

  // 1. Look up the token
  const { data: tokenRow, error: tokenErr } = await sb
    .from("gateway_pairing_tokens")
    .select("id, tenant_id, location_id, expires_at, used_at, bound_to_mac, label")
    .eq("token", tokenIn)
    .maybeSingle();

  if (tokenErr) {
    console.error("[gateway-pair] token lookup error", tokenErr.message);
    return json({ error: "Database error" }, 500);
  }
  if (!tokenRow) return json({ error: "Token not found" }, 404);
  if (tokenRow.used_at && tokenRow.bound_to_mac && tokenRow.bound_to_mac !== macIn) {
    return json({ error: "Token already used by another device" }, 409);
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return json({ error: "Token expired" }, 410);
  }

  // 2. Find or create the gateway_devices row (key on MAC + tenant)
  const { data: existingDevice } = await sb
    .from("gateway_devices")
    .select("id, gateway_username")
    .eq("tenant_id", tokenRow.tenant_id)
    .eq("mac_address", macIn)
    .maybeSingle();

  // 3. Generate fresh credentials (always rotate on (re-)pair)
  const username = `gw-${macIn.slice(-6)}`;
  const password = randomString(24);
  const passwordHash = await bcryptHash(password);

  let deviceId: string;

  if (existingDevice) {
    deviceId = existingDevice.id;
    const { error: updErr } = await sb.from("gateway_devices").update({
      gateway_username: username,
      gateway_password_hash: passwordHash,
      device_name: hostname,
      ha_version: haVersion,
      addon_version: addonVersion,
      status: "online",
      last_heartbeat_at: new Date().toISOString(),
    }).eq("id", deviceId);
    if (updErr) {
      console.error("[gateway-pair] device update error", updErr.message);
      return json({ error: "Database error" }, 500);
    }
  } else {
    const { data: created, error: insErr } = await sb.from("gateway_devices").insert({
      tenant_id: tokenRow.tenant_id,
      device_name: hostname,
      device_type: "aicono_ems",
      mac_address: macIn,
      gateway_username: username,
      gateway_password_hash: passwordHash,
      ha_version: haVersion,
      addon_version: addonVersion,
      status: "online",
      last_heartbeat_at: new Date().toISOString(),
      config: tokenRow.location_id ? { paired_location_id: tokenRow.location_id } : {},
    }).select("id").maybeSingle();
    if (insErr || !created) {
      console.error("[gateway-pair] device insert error", insErr?.message);
      return json({ error: "Database error" }, 500);
    }
    deviceId = created.id;
  }

  // 4. Consume the token
  await sb.from("gateway_pairing_tokens").update({
    used_at: new Date().toISOString(),
    bound_to_mac: macIn,
    bound_device_id: deviceId,
  }).eq("id", tokenRow.id);

  console.log(`[gateway-pair] paired mac=${macIn} tenant=${tokenRow.tenant_id} device=${deviceId}`);

  return json({
    success: true,
    gateway_username: username,
    gateway_password: password, // plaintext, only returned once
    device_id: deviceId,
    tenant_id: tokenRow.tenant_id,
    location_id: tokenRow.location_id,
    cloud_url: SUPABASE_URL,
  });
});
