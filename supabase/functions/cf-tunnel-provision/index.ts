/**
 * cf-tunnel-provision
 * ===================
 * Erzeugt pro Liegenschafts-Integration einen Cloudflare Tunnel:
 * 1. POST /accounts/{id}/cfd_tunnel  → tunnel + token
 * 2. POST /accounts/{id}/cfd_tunnel/{tid}/configurations → Ingress (HA: http://homeassistant:8123)
 * 3. POST /zones/{zone}/dns_records → CNAME <tunnel-id>.tunnel.aicono.org → <tid>.cfargotunnel.com
 * Speichert tunnel_id, public_url und (verschlüsselt) tunnel_token in
 * location_integrations.config.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { encrypt } from "../_shared/crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
const CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
const CF_ZONE = Deno.env.get("CLOUDFLARE_ZONE_ID")!;
const ENC_KEY = Deno.env.get("BRIGHTHUB_ENCRYPTION_KEY") || SERVICE_KEY;
// 2-stufige Domain — Cloudflare Universal SSL deckt *.aicono.org automatisch ab.
// 3-stufige Hosts wie *.tunnel.aicono.org würden ein Advanced-Certificate erfordern.
const TUNNEL_DOMAIN = "aicono.org";

interface CfApiResp<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result: T;
}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = (await res.json()) as CfApiResp<T>;
  if (!json.success) {
    throw new Error(`Cloudflare API: ${json.errors?.map((e) => e.message).join(", ") || res.status}`);
  }
  return json.result;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const locIntId: string | undefined = body.location_integration_id;
    if (!locIntId) {
      return new Response(JSON.stringify({ error: "location_integration_id required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch existing location integration via authClient (RLS enforced)
    const { data: locInt, error: locErr } = await authClient
      .from("location_integrations")
      .select("id, location_id, config")
      .eq("id", locIntId)
      .maybeSingle();
    if (locErr || !locInt) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 1. Create Tunnel
    const tunnelSecret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const tunnelName = `aicono-${locInt.location_id.slice(0, 8)}-${Date.now()}`;
    const tunnel = await cf<{ id: string; token: string }>(
      `/accounts/${CF_ACCOUNT}/cfd_tunnel`,
      {
        method: "POST",
        body: JSON.stringify({
          name: tunnelName,
          tunnel_secret: tunnelSecret,
          config_src: "cloudflare",
        }),
      },
    );

    // 2. Configure Ingress: route everything to local HA
    await cf(
      `/accounts/${CF_ACCOUNT}/cfd_tunnel/${tunnel.id}/configurations`,
      {
        method: "PUT",
        body: JSON.stringify({
          config: {
            ingress: [
              { service: "http://homeassistant:8123" },
            ],
          },
        }),
      },
    );

    // 3. Get tunnel token (some accounts return it on creation, others need separate call)
    let tunnelToken = tunnel.token;
    if (!tunnelToken) {
      const tokenResp = await cf<string>(
        `/accounts/${CF_ACCOUNT}/cfd_tunnel/${tunnel.id}/token`,
      );
      tunnelToken = typeof tokenResp === "string" ? tokenResp : (tokenResp as any);
    }

    // 4. Create DNS CNAME
    const subdomain = tunnel.id.slice(0, 12);
    const fqdn = `${subdomain}.${TUNNEL_DOMAIN}`;
    await cf(
      `/zones/${CF_ZONE}/dns_records`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "CNAME",
          name: fqdn,
          content: `${tunnel.id}.cfargotunnel.com`,
          proxied: true,
        }),
      },
    ).catch((e) => {
      // ignore "already exists"
      if (!String(e).includes("already exists")) throw e;
    });

    const publicUrl = `https://${fqdn}`;
    const encryptedToken = await encrypt(tunnelToken, ENC_KEY);

    const newConfig = {
      ...(locInt.config as Record<string, unknown> || {}),
      api_url: publicUrl,
      cloudflare_tunnel_id: tunnel.id,
      cloudflare_tunnel_token_enc: encryptedToken,
      cloudflare_public_url: publicUrl,
      cloudflare_provisioned_at: new Date().toISOString(),
    };

    const { error: updErr } = await admin
      .from("location_integrations")
      .update({ config: newConfig })
      .eq("id", locIntId);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        success: true,
        tunnel_id: tunnel.id,
        public_url: publicUrl,
        tunnel_token: tunnelToken, // returned ONCE in plaintext for user to copy into Add-on
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[cf-tunnel-provision]", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
