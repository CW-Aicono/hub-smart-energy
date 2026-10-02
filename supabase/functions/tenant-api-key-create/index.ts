/**
 * tenant-api-key-create – erzeugt einen neuen tenant-eigenen Ingest-Key.
 * Klartext wird nur EINMAL im Response zurückgegeben.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomToken(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...cors, "Content-Type": "application/json" },
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: profile } = await svc
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();

  const { data: roles } = await svc
    .from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
  const isAdmin = roleSet.has("admin") || roleSet.has("super_admin");
  if (!isAdmin) return json({ error: "Forbidden – admin role required" }, 403);

  let body: { label?: string; tenant_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  // Super-Admin darf tenant_id im Body überschreiben; sonst zwingend eigener Tenant
  const isSuper = roleSet.has("super_admin");
  const tenantId = isSuper && body.tenant_id ? body.tenant_id : profile?.tenant_id;
  if (!tenantId) return json({ error: "No tenant context" }, 400);

  const label = (body.label ?? "default").toString().slice(0, 64);
  const secret = randomToken(32);
  const plainKey = `aic_live_${secret}`;
  const key_hash = await sha256Hex(plainKey);
  const key_prefix = plainKey.slice(0, 12); // "aic_live_XXX"

  const { data, error } = await svc.from("tenant_api_keys").insert({
    tenant_id: tenantId, key_hash, key_prefix, label, created_by: user.id,
  }).select("id, key_prefix, label, created_at").single();

  if (error) {
    console.error("[tenant-api-key-create]", error.message);
    return json({ error: "Failed to create key" }, 500);
  }

  return json({ success: true, key: plainKey, meta: data });
});
