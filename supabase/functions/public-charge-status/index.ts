// Public charge status endpoint – serves a read-only snapshot of all charge points
// for one tenant, identified by an opaque token. No JWT required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") ?? "").trim();

    if (!token || token.length < 16 || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return json({ error: "not_found" }, 404);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: link, error: linkErr } = await admin
      .from("public_charge_status_links")
      .select("tenant_id, enabled")
      .eq("token", token)
      .maybeSingle();

    if (linkErr || !link || !link.enabled) {
      return json({ error: "not_found" }, 404);
    }

    const tenantId = link.tenant_id as string;

    const [tenantRes, cpRes] = await Promise.all([
      admin.from("tenants").select("id, name, logo_url").eq("id", tenantId).maybeSingle(),
      admin
        .from("charge_points")
        .select(
          "id, name, ocpp_id, status, connector_count, ws_connected, last_heartbeat",
        )
        .eq("tenant_id", tenantId)
        .order("name"),
    ]);

    const cps = (cpRes.data ?? []) as Array<{
      id: string;
      name: string;
      ocpp_id: string;
      status: string;
      connector_count: number;
      ws_connected: boolean;
      last_heartbeat: string | null;
    }>;

    const cpIds = cps.map((c) => c.id);
    let connectors: Array<{
      charge_point_id: string;
      connector_id: number;
      status: string;
      name: string | null;
      display_order: number;
      connector_type: string;
    }> = [];
    if (cpIds.length > 0) {
      const { data } = await admin
        .from("charge_point_connectors")
        .select("charge_point_id, connector_id, status, name, display_order, connector_type")
        .in("charge_point_id", cpIds)
        .order("display_order");
      connectors = data ?? [];
    }

    return json({
      tenant: {
        name: tenantRes.data?.name ?? "",
        logo_url: tenantRes.data?.logo_url ?? null,
      },
      charge_points: cps,
      connectors,
      generated_at: new Date().toISOString(),
    }, 200);
  } catch (e) {
    console.error("public-charge-status error", e);
    return json({ error: "internal" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
