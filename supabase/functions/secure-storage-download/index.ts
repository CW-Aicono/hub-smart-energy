import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

function getChargePointId(path: string) {
  const parts = path.split("/");
  if (parts[0] !== "charge-points") return null;
  return parts[1]?.includes(".") ? parts[1].split(".")[0] : parts[1] || null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405, corsHeaders);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Nicht angemeldet" }, 401, corsHeaders);

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Ungültige Anmeldung" }, 401, corsHeaders);

  let body: { bucket?: string; path?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400, corsHeaders); }

  const bucket = body.bucket || "";
  const path = body.path || "";
  if (!path || !["tenant-assets", "meter-photos"].includes(bucket)) {
    return json({ error: "Ungültiger Bildpfad" }, 400, corsHeaders);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const userId = userData.user.id;

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const isSuperAdmin = (roles || []).some((r: any) => r.role === "super_admin");

  let allowed = isSuperAdmin;
  if (!allowed && bucket === "tenant-assets") {
    const tenantId = path.split("/")[0];
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    allowed = !!data;
  }

  if (!allowed && bucket === "meter-photos") {
    const chargePointId = getChargePointId(path);
    if (chargePointId) {
      const { data } = await admin
        .from("charge_points")
        .select("id, profiles!inner(id)")
        .eq("id", chargePointId)
        .eq("profiles.user_id", userId)
        .maybeSingle();
      allowed = !!data;
    }
  }

  if (!allowed) return json({ error: "Kein Zugriff auf dieses Bild" }, 403, corsHeaders);

  const { data: file, error } = await admin.storage.from(bucket).download(path);
  if (error || !file) return json({ error: error?.message || "Bild nicht gefunden" }, 404, corsHeaders);

  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
});