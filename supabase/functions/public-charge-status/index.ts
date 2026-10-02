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

    const [tenantRes, cpRes, groupsRes] = await Promise.all([
      admin.from("tenants").select("id, name, logo_url").eq("id", tenantId).maybeSingle(),
      admin
        .from("charge_points")
        .select(
          "id, name, ocpp_id, status, connector_count, ws_connected, last_heartbeat, group_id",
        )
        .eq("tenant_id", tenantId)
        .order("name"),
      admin
        .from("charge_point_groups")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name"),
    ]);

    const cps = (cpRes.data ?? []) as Array<{
      id: string;
      name: string;
      ocpp_id: string | null;
      status: string;
      connector_count: number;
      ws_connected: boolean;
      last_heartbeat: string | null;
      group_id: string | null;
    }>;

    const groups = (groupsRes.data ?? []) as Array<{ id: string; name: string }>;

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

    // Aktive Ladevorgänge laden – manche Wallboxen (z. B. ESB Mennekes) melden
    // während eines Ladevorgangs "Unavailable" statt "Charging". Wir markieren
    // diese Connectors/CPs als belegt, damit die Übersicht den realen Zustand
    // zeigt.
    const activeConnKeys = new Set<string>();
    if (cpIds.length > 0) {
      const { data: sessions } = await admin
        .from("charging_sessions")
        .select("charge_point_id, connector_id")
        .in("charge_point_id", cpIds)
        .is("stop_time", null);
      for (const s of sessions ?? []) {
        if (s.connector_id != null) {
          activeConnKeys.add(`${s.charge_point_id}:${s.connector_id}`);
        }
      }
    }

    // Status der Connectors überschreiben, wenn aktiver Ladevorgang läuft.
    connectors = connectors.map((c) => {
      const k = `${c.charge_point_id}:${c.connector_id}`;
      if (activeConnKeys.has(k)) return { ...c, status: "Charging" };
      return c;
    });

    // Resolve tenant logo. Stored as a path in the private "tenant-assets" bucket.
    // We download the bytes server-side and embed them as a data: URL. This avoids
    // all hostname issues with signed/public storage URLs (e.g. on self-hosted
    // Supabase / Hetzner where the storage URL points at an internal hostname
    // like http://kong:8000 that the public browser cannot reach).
    let logoUrl: string | null = null;
    const rawLogo = (tenantRes.data?.logo_url ?? "").toString().trim();
    if (rawLogo) {
      if (/^https?:\/\//i.test(rawLogo) || rawLogo.startsWith("data:")) {
        logoUrl = rawLogo;
      } else {
        const path = rawLogo.replace(/^\/+/, "");
        try {
          const { data: blob, error: dlErr } = await admin.storage
            .from("tenant-assets")
            .download(path);
          if (dlErr || !blob) {
            console.warn("tenant logo download failed", dlErr);
          } else if (blob.size <= 512 * 1024) { // hard cap 512KB to keep payload sane
            const buf = new Uint8Array(await blob.arrayBuffer());
            let bin = "";
            for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
            const b64 = btoa(bin);
            const ext = (path.split(".").pop() || "").toLowerCase();
            const mime = blob.type
              || (ext === "svg" ? "image/svg+xml"
                : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
                : ext === "webp" ? "image/webp"
                : ext === "gif" ? "image/gif"
                : "image/png");
            logoUrl = `data:${mime};base64,${b64}`;
          } else {
            console.warn("tenant logo too large for inline data URL", { size: blob.size });
          }
        } catch (e) {
          console.warn("tenant logo inline failed", e);
        }
      }
    }

    return json({
      tenant: {
        name: tenantRes.data?.name ?? "",
        logo_url: logoUrl,
      },
      groups,
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
