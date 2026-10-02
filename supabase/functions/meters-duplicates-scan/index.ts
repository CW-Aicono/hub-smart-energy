// meters-duplicates-scan
// Super-Admin only. Returns all duplicate meter groups across all tenants.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) return json({ error: "Forbidden" }, 403);

  let tenantFilter: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.tenant_id === "string") tenantFilter = body.tenant_id;
    } catch { /* ignore */ }
  }

  const { data: groupsRaw, error: rpcErr } = await admin.rpc("find_duplicate_meters");
  if (rpcErr) return json({ error: rpcErr.message }, 500);
  const groups = tenantFilter
    ? ((groupsRaw ?? []) as any[]).filter((g) => g.tenant_id === tenantFilter)
    : (groupsRaw ?? []);

  // Enrich each group with meter details + tenant/location names for the UI.
  const allMeterIds = Array.from(
    new Set(((groups ?? []) as any[]).flatMap((g) => g.meter_ids as string[])),
  );
  if (allMeterIds.length === 0) return json({ groups: [] });

  const { data: meters } = await admin
    .from("meters")
    .select(
      "id, name, tenant_id, location_id, location_integration_id, sensor_uuid, capture_type, energy_type, unit, created_at, is_archived",
    )
    .in("id", allMeterIds);

  const tenantIds = Array.from(new Set((meters ?? []).map((m: any) => m.tenant_id).filter(Boolean)));
  const locationIds = Array.from(new Set((meters ?? []).map((m: any) => m.location_id).filter(Boolean)));

  const [{ data: tenants }, { data: locations }] = await Promise.all([
    admin.from("tenants").select("id, name").in("id", tenantIds),
    admin.from("locations").select("id, name").in("id", locationIds),
  ]);
  const tenantMap = new Map((tenants ?? []).map((t: any) => [t.id, t.name]));
  const locationMap = new Map((locations ?? []).map((l: any) => [l.id, l.name]));

  const meterMap = new Map(
    (meters ?? []).map((m: any) => [
      m.id,
      {
        ...m,
        tenant_name: tenantMap.get(m.tenant_id) ?? null,
        location_name: locationMap.get(m.location_id) ?? null,
      },
    ]),
  );

  const enriched = ((groups ?? []) as any[]).map((g) => {
    const ids: string[] = g.meter_ids;
    const items = ids.map((id) => meterMap.get(id)).filter(Boolean);
    // Master = oldest (first in the sorted array)
    return {
      tenant_id: g.tenant_id,
      tenant_name: tenantMap.get(g.tenant_id) ?? null,
      location_integration_id: g.location_integration_id,
      sensor_uuid: g.sensor_uuid_key,
      duplicate_count: g.duplicate_count,
      master_id: ids[0],
      meters: items,
    };
  });

  return json({ groups: enriched });
});
